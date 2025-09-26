const { createHmac } = require('crypto');
const { createClient } = require('redis');

// Load environment variables
require('dotenv').config();

// Field-aware HMAC indexer for multi-field PII records
// Supports field-scoped search: "first name starts with X AND last name ends with Y"

class FieldAwareRedisIndexer {
    constructor(redisConfig = {}, secret = null) {
        // Validate required environment variables if not provided as parameters
        if (!secret && !process.env.REDIS_HMAC_SECRET) {
            console.error('❌ Missing REDIS_HMAC_SECRET environment variable');
            console.error('Please copy .env.template to .env and configure all required variables.');
            process.exit(1);
        }

        if (!redisConfig.host && !process.env.REDIS_HOST) {
            console.error('❌ Missing REDIS_HOST environment variable');
            console.error('Please copy .env.template to .env and configure all required variables.');
            process.exit(1);
        }

        if (!redisConfig.port && !process.env.REDIS_PORT) {
            console.error('❌ Missing REDIS_PORT environment variable');
            console.error('Please copy .env.template to .env and configure all required variables.');
            process.exit(1);
        }

        this.redis = null;
        this.secret = secret || process.env.REDIS_HMAC_SECRET;
        this.redisConfig = {
            host: redisConfig.host || process.env.REDIS_HOST,
            port: redisConfig.port || parseInt(process.env.REDIS_PORT),
            password: redisConfig.password || process.env.REDIS_PASSWORD || null
        };
        this.k = 3; // Default k-gram size

        // Field mapping to compact aliases (ONLY for Redis keys - not used in database)
        // Database stores full field names, Redis uses these abbreviations for key efficiency
        this.fieldMap = {
            'FIRST_NAME': 'fn',
            'LAST_NAME': 'ln',
            'MIDDLE_NAME': 'mn',
            'FULL_NAME': 'name',
            'EMAIL': 'email',
            'MOBILE_NUMBER': 'phone',
            'DATE_OF_BIRTH': 'dob',
            'ADDRESS': 'addr',
            'COUNTRY': 'country',
            'CITY': 'city',
            'PAN_CARD': 'pan',
            'PASSPORT_NUMBER': 'passport'
        };

        // Valid fields and operations
        this.validFields = ['fn', 'ln', 'mn', 'name', 'email', 'phone', 'dob', 'addr', 'country', 'city', 'pan', 'passport'];
        this.validOps = ['eq', 'startsWith', 'endsWith', 'contains'];
    }

    async initialize() {
        try {
            this.redis = createClient(this.redisConfig);
            await this.redis.connect();
            console.log('✅ Field-Aware Redis Indexer connected');
            return true;
        } catch (error) {
            console.error('❌ Redis connection failed:', error.message);
            throw error;
        }
    }

    // HMAC hash function: H(s) = base64url(HMAC_SHA256(secret, s))
    H(s) {
        return createHmac('sha256', this.secret).update(s).digest('base64url');
    }

    // Normalize text: lowercase + Unicode NFKC + trim
    normalize(s) {
        return s.normalize('NFKC').toLowerCase().trim();
    }

    // Get field alias from full field name
    getFieldAlias(fieldName) {
        return this.fieldMap[fieldName.toUpperCase()] || fieldName.toLowerCase();
    }

    // Generate Redis keys for a specific field, operation, and query
    // Matches the TypeScript interface: keysFor(field, op, q, k=3)
    keysFor(field, op, q, k = this.k) {
        const n = this.normalize(q);

        if (op === 'eq') {
            return [`idx:${field}:eq:${this.H(`${field}|${n}`)}`];
        }

        if (op === 'startsWith') {
            return [`idx:${field}:pre:${this.H(`${field}|${n}`)}`];
        }

        if (op === 'endsWith') {
            const r = [...n].reverse().join('');
            return [`idx:${field}:suf:${this.H(`${field}|${r}`)}`];
        }

        // contains operation using k-grams (minimum k=3 required)
        if (n.length < k) {
            console.warn(`⚠️  Contains search requires minimum ${k} characters, got "${q}" (${n.length} chars)`);
            return []; // No contains search for queries shorter than k
        }

        const grams = Array.from({length: n.length - k + 1}, (_, i) => n.slice(i, i + k));
        return grams.map(g => `idx:${field}:g${k}:${this.H(`${field}|${g}`)}`);
    }

    // Generate all keys needed for indexing a field value (for all operations)
    generateAllIndexKeys(field, value, k = this.k) {
        const n = this.normalize(value);
        const r = [...n].reverse().join('');

        const keys = [];

        // Equality key
        keys.push(`idx:${field}:eq:${this.H(`${field}|${n}`)}`);

        // All prefix keys for startsWith
        for (let i = 1; i <= n.length; i++) {
            const prefix = n.slice(0, i);
            keys.push(`idx:${field}:pre:${this.H(`${field}|${prefix}`)}`);
        }

        // All suffix keys for endsWith (using reversed prefixes)
        for (let i = 1; i <= r.length; i++) {
            const prefix = r.slice(0, i);
            keys.push(`idx:${field}:suf:${this.H(`${field}|${prefix}`)}`);
        }

        // All k-gram keys for contains (only k=3 grams to avoid index explosion)
        if (n.length >= k) {
            for (let i = 0; i <= n.length - k; i++) {
                const gram = n.slice(i, i + k);
                keys.push(`idx:${field}:g${k}:${this.H(`${field}|${gram}`)}`);
            }
        }

        return keys;
    }

    // Index a single field → token mapping
    async indexFieldValue(fieldName, value, token, k = this.k) {
        try {
            const field = this.getFieldAlias(fieldName);
            const keys = this.generateAllIndexKeys(field, value, k);
            const pipe = this.redis.multi();

            // Add token to all generated keys
            keys.forEach(key => pipe.sAdd(key, token));

            await pipe.exec();
            return { indexed: keys.length, field: fieldName, alias: field };
        } catch (error) {
            console.error(`❌ Failed to index ${fieldName}="${value}":`, error.message);
            throw error;
        }
    }

    // Index a complete multi-field record
    async indexRecord(recordData, token, k = this.k) {
        try {
            let totalKeys = 0;
            const indexedFields = [];

            // Index each field in the record
            for (const [fieldName, value] of Object.entries(recordData)) {
                if (value && typeof value === 'string' && value.trim()) {
                    const result = await this.indexFieldValue(fieldName, value, token, k);
                    totalKeys += result.indexed;
                    indexedFields.push(fieldName);
                }
            }

            return {
                token,
                indexedFields,
                totalKeys,
                recordData: Object.keys(recordData)
            };
        } catch (error) {
            console.error(`❌ Failed to index record for token ${token}:`, error.message);
            throw error;
        }
    }

    // Remove field → token mapping
    async removeFieldValue(fieldName, value, token, k = this.k) {
        try {
            const {eq, pres, sufs, gk} = this.generateFieldKeys(fieldName, value, token, k);
            const pipe = this.redis.multi();

            // Remove token from all relevant sets
            pipe.sRem(eq, token);
            pres.forEach(key => pipe.sRem(key, token));
            sufs.forEach(key => pipe.sRem(key, token));
            gk.forEach(key => pipe.sRem(key, token));

            await pipe.exec();

            // Clean up empty sets
            await this.cleanupEmptyKeys([eq, ...pres, ...sufs, ...gk]);
            return true;
        } catch (error) {
            console.error(`❌ Failed to remove ${fieldName}="${value}":`, error.message);
            throw error;
        }
    }

    // Field-scoped search operations using the clean keysFor interface
    async search(fieldName, op, query, k = this.k) {
        const field = this.getFieldAlias(fieldName);
        const keys = this.keysFor(field, op, query, k);

        if (keys.length === 0) return [];

        // For single key operations (eq, startsWith, endsWith)
        if (keys.length === 1) {
            return await this.redis.sMembers(keys[0]);
        }

        // For multi-key operations (contains with multiple k-grams)
        return await this.redis.sInter(keys);
    }

    // Convenience methods for specific operations
    async searchFieldEquals(fieldName, query) {
        return await this.search(fieldName, 'eq', query);
    }

    async searchFieldStartsWith(fieldName, query) {
        return await this.search(fieldName, 'startsWith', query);
    }

    async searchFieldEndsWith(fieldName, query) {
        return await this.search(fieldName, 'endsWith', query);
    }

    async searchFieldContains(fieldName, query, k = this.k) {
        return await this.search(fieldName, 'contains', query, k);
    }

    // Complex query support: AND/OR operations
    async executeComplexQuery(queryConditions, operator = 'AND') {
        try {
            const resultSets = [];

            // Execute each condition
            for (const condition of queryConditions) {
                const { field, operation, value } = condition;
                let tokens;

                switch (operation.toLowerCase()) {
                    case 'equals':
                        tokens = await this.searchFieldEquals(field, value);
                        break;
                    case 'starts_with':
                        tokens = await this.searchFieldStartsWith(field, value);
                        break;
                    case 'ends_with':
                        tokens = await this.searchFieldEndsWith(field, value);
                        break;
                    case 'contains':
                        tokens = await this.searchFieldContains(field, value);
                        break;
                    default:
                        throw new Error(`Unsupported operation: ${operation}`);
                }

                resultSets.push(new Set(tokens));
            }

            // Apply AND/OR logic
            if (resultSets.length === 0) return [];

            let finalResult = resultSets[0];

            for (let i = 1; i < resultSets.length; i++) {
                if (operator.toUpperCase() === 'AND') {
                    // Intersection for AND
                    finalResult = new Set([...finalResult].filter(x => resultSets[i].has(x)));
                } else if (operator.toUpperCase() === 'OR') {
                    // Union for OR
                    finalResult = new Set([...finalResult, ...resultSets[i]]);
                }
            }

            return Array.from(finalResult);
        } catch (error) {
            console.error('❌ Complex query failed:', error.message);
            throw error;
        }
    }

    // Clean up keys that have empty sets
    async cleanupEmptyKeys(keys) {
        try {
            for (const key of keys) {
                const size = await this.redis.sCard(key);
                if (size === 0) {
                    await this.redis.del(key);
                }
            }
        } catch (error) {
            console.error('❌ Cleanup failed:', error.message);
        }
    }

    // Get comprehensive indexing statistics
    async getStats() {
        try {
            const pattern = 'idx:*';
            const keys = await this.redis.keys(pattern);

            const stats = {
                totalKeys: keys.length,
                keysByField: {},
                keysByOperation: { eq: 0, pre: 0, suf: 0, g3: 0, g4: 0 },
                sampleTokenCount: 0,
                estimatedTotalTokens: 0
            };

            // Analyze key patterns
            for (const key of keys.slice(0, 100)) { // Sample for performance
                const parts = key.split(':');
                if (parts.length >= 4) {
                    const field = parts[1];
                    const operation = parts[2];

                    // Count by field
                    stats.keysByField[field] = (stats.keysByField[field] || 0) + 1;

                    // Count by operation
                    if (stats.keysByOperation[operation] !== undefined) {
                        stats.keysByOperation[operation]++;
                    }

                    // Sample token count
                    const count = await this.redis.sCard(key);
                    stats.sampleTokenCount += count;
                }
            }

            // Estimate total tokens
            const sampleSize = Math.min(keys.length, 100);
            stats.estimatedTotalTokens = Math.round((stats.sampleTokenCount / sampleSize) * keys.length);

            return stats;
        } catch (error) {
            console.error('❌ Stats failed:', error.message);
            return { error: error.message };
        }
    }

    // Close Redis connection
    async close() {
        if (this.redis) {
            await this.redis.quit();
            console.log('🛑 Field-Aware Redis Indexer closed');
        }
    }
}

module.exports = { FieldAwareRedisIndexer };