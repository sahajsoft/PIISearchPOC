const crypto = require('crypto');
const { Client } = require('pg');

// Load environment variables
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['DB_USER', 'DB_HOST', 'DB_DATABASE', 'DB_PASSWORD', 'DB_PORT', 'REDIS_HMAC_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please copy .env.template to .env and configure all required variables.');
    process.exit(1);
}

// Database-based PII-Safe Search Query API
// Implements Redis-compatible privacy-preserving search using PostgreSQL pii_search_index table

// Configuration (from environment variables only)
const config = {
    database: {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT),
    },
    search: {
        minResultSize: parseInt(process.env.MIN_RESULT_SIZE) || 5, // k-anonymity protection
        maxResults: parseInt(process.env.MAX_RESULTS) || 1000,
        minQueryLength: parseInt(process.env.MIN_QUERY_LENGTH) || 2
    }
};

// Search query types (Redis-compatible)
const QUERY_TYPES = {
    EQUALS: 'eq',
    STARTS_WITH: 'startsWith',
    ENDS_WITH: 'endsWith',
    CONTAINS: 'contains'
};

// Field mapping (same as Redis indexer)
const FIELD_MAP = {
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

// Valid operations (same as Redis)
const VALID_OPS = ['eq', 'startsWith', 'endsWith', 'contains'];

class PIIDatabaseSearchAPI {
    constructor() {
        this.dbClient = null;
        this.hmacSecret = null;
        this.k = 3; // Default k-gram size
    }

    async initialize() {
        try {
            console.log('🔍 Initializing PII Database Search API...');

            // Initialize Database
            this.dbClient = new Client(config.database);
            await this.dbClient.connect();
            console.log('✅ Database connected');

            // Initialize HMAC secret (same as Redis indexer)
            this.hmacSecret = process.env.REDIS_HMAC_SECRET;
            console.log('✅ Using Redis-compatible HMAC secret');

            console.log('🚀 PII Database Search API ready');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize:', error.message);
            throw error;
        }
    }

    // Normalize text (same as Redis)
    normalize(s) {
        return s.normalize('NFKC').toLowerCase().trim();
    }

    // HMAC hash function (same as Redis): H(s) = base64url(HMAC_SHA256(secret, s))
    H(s) {
        return crypto.createHmac('sha256', this.hmacSecret).update(s).digest('base64url');
    }

    // Get field alias from full field name (same as Redis)
    getFieldAlias(fieldName) {
        return FIELD_MAP[fieldName.toUpperCase()] || fieldName.toLowerCase();
    }

    // Generate Redis-compatible keys for a search query (same logic as Redis)
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

    // Search tokens in database index using Redis-compatible keys
    async searchTokensInIndex(keys) {
        if (keys.length === 0) return new Set();

        try {
            // Create placeholders for parameterized query
            const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(',');

            const query = `
                SELECT DISTINCT unnest(string_to_array(token_set, ',')) as token
                FROM pii_search_index
                WHERE hmac_key IN (${placeholders})
                  AND retention_until > NOW()
            `;

            const result = await this.dbClient.query(query, keys);
            return new Set(result.rows.map(row => row.token.trim()).filter(token => token));

        } catch (error) {
            console.error('❌ Database search error:', error.message);
            throw error;
        }
    }

    // Core search method (same interface as Redis)
    async search(fieldName, op, query, k = this.k) {
        const field = this.getFieldAlias(fieldName);
        const keys = this.keysFor(field, op, query, k);

        if (keys.length === 0) return [];

        // For single key operations (eq, startsWith, endsWith)
        if (keys.length === 1) {
            const tokens = await this.searchTokensInIndex(keys);
            return Array.from(tokens);
        }

        // For multi-key operations (contains with multiple k-grams)
        // Get intersection of all k-gram results
        const tokenSets = [];
        for (const key of keys) {
            const tokens = await this.searchTokensInIndex([key]);
            tokenSets.push(tokens);
        }

        // Find intersection (all k-grams must match)
        let intersection = tokenSets[0];
        for (let i = 1; i < tokenSets.length; i++) {
            intersection = new Set([...intersection].filter(token => tokenSets[i].has(token)));
        }

        return Array.from(intersection);
    }

    // Convenience methods for specific operations (same as Redis)
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

    // Complex query support: AND/OR operations (same as Redis)
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
                    case 'startswith':
                        tokens = await this.searchFieldStartsWith(field, value);
                        break;
                    case 'endswith':
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

    // Get comprehensive search statistics (similar to Redis)
    async getStats() {
        try {
            const pattern = 'idx:%';
            const query = `
                SELECT
                    COUNT(*) as total_keys,
                    COUNT(CASE WHEN hmac_key LIKE '%:eq:%' THEN 1 END) as eq_keys,
                    COUNT(CASE WHEN hmac_key LIKE '%:pre:%' THEN 1 END) as pre_keys,
                    COUNT(CASE WHEN hmac_key LIKE '%:suf:%' THEN 1 END) as suf_keys,
                    COUNT(CASE WHEN hmac_key LIKE '%:g3:%' THEN 1 END) as g3_keys
                FROM pii_search_index
                WHERE hmac_key LIKE $1
            `;

            const result = await this.dbClient.query(query, [pattern]);
            const stats = result.rows[0];

            return {
                totalKeys: parseInt(stats.total_keys),
                keysByOperation: {
                    eq: parseInt(stats.eq_keys),
                    pre: parseInt(stats.pre_keys),
                    suf: parseInt(stats.suf_keys),
                    g3: parseInt(stats.g3_keys)
                }
            };
        } catch (error) {
            console.error('❌ Stats failed:', error.message);
            return { error: error.message };
        }
    }

    // High-level search with options (wrapper around core search)
    async performSearch(query, fieldType, queryType = 'contains', options = {}) {
        const startTime = Date.now();

        try {
            // Validate inputs
            if (!query || query.length < config.search.minQueryLength) {
                throw new Error(`Query must be at least ${config.search.minQueryLength} characters long`);
            }

            // Map query type to Redis operation
            let operation;
            switch (queryType.toLowerCase()) {
                case 'exact':
                case 'equals':
                    operation = 'eq';
                    break;
                case 'starts_with':
                case 'startswith':
                    operation = 'startsWith';
                    break;
                case 'ends_with':
                case 'endswith':
                    operation = 'endsWith';
                    break;
                case 'contains':
                default:
                    operation = 'contains';
                    break;
            }

            console.log(`🔍 Searching: ${fieldType} ${operation} "${query}"`);

            // Use core search method
            const tokens = await this.search(fieldType, operation, query);

            console.log(`🎯 Found ${tokens.length} matching tokens`);

            // Apply k-anonymity protection
            const resultCount = tokens.length;
            const anonymizedTokens = resultCount >= config.search.minResultSize ? tokens : [];

            if (resultCount > 0 && anonymizedTokens.length === 0) {
                console.log(`🔒 k-anonymity protection applied: ${resultCount} results (< ${config.search.minResultSize})`);
            }

            const executionTime = Date.now() - startTime;

            return {
                tokens: anonymizedTokens,
                resultCount: resultCount,
                anonymizedCount: anonymizedTokens.length,
                queryType: queryType,
                fieldType: fieldType,
                executionTime: executionTime,
                kAnonymityApplied: resultCount > 0 && anonymizedTokens.length === 0
            };

        } catch (error) {
            console.error(`❌ Search failed: ${error.message}`);
            throw error;
        }
    }

    // Batch search with multiple queries
    async batchSearch(queries, options = {}) {
        const results = [];

        for (const queryConfig of queries) {
            try {
                const result = await this.performSearch(
                    queryConfig.query,
                    queryConfig.fieldType,
                    queryConfig.queryType || 'contains',
                    options
                );
                results.push(result);
            } catch (error) {
                results.push({
                    error: error.message,
                    query: queryConfig.query,
                    fieldType: queryConfig.fieldType
                });
            }
        }

        return results;
    }


    // Clean up resources
    async close() {
        if (this.dbClient) await this.dbClient.end();
        console.log('🛑 PII Database Search API closed');
    }
}

// Main execution for testing
async function main() {
    console.log('🔍 PII Database Search API Test');
    console.log('===============================');

    const args = process.argv.slice(2);

    if (args.includes('--help')) {
        console.log(`
Usage: node pii-db-search-api.js [options]

Test the Redis-compatible database-based PII search API functionality.

Options:
  --test-search        Run sample search tests
  --stats              Show search index statistics
  --help               Show this help message

Environment Variables:
  DB_HOST              Database host (default: localhost)
  DB_NAME              Database name (default: pii)
  DB_USER              Database user (default: postgres)
  DB_PASSWORD          Database password
  REDIS_HMAC_SECRET    HMAC secret (same as Redis)

Example:
  node pii-db-search-api.js --test-search
  node pii-db-search-api.js --stats
        `);
        return;
    }

    const searchAPI = new PIIDatabaseSearchAPI();

    try {
        await searchAPI.initialize();

        if (args.includes('--test-search')) {
            console.log('\n🧪 Running sample searches...\n');

            const testQueries = [
                { query: 'john', fieldType: 'FIRST_NAME', queryType: 'contains' },
                { query: 'gmail', fieldType: 'EMAIL', queryType: 'contains' },
                { query: 'smith', fieldType: 'LAST_NAME', queryType: 'endsWith' },
                { query: '999', fieldType: 'MOBILE_NUMBER', queryType: 'startsWith' },
                { query: 'india', fieldType: 'COUNTRY', queryType: 'equals' }
            ];

            for (const testQuery of testQueries) {
                try {
                    const result = await searchAPI.performSearch(
                        testQuery.query,
                        testQuery.fieldType,
                        testQuery.queryType
                    );

                    console.log(`📋 Query: ${testQuery.fieldType} ${testQuery.queryType} "${testQuery.query}"`);
                    console.log(`   Results: ${result.anonymizedCount} tokens (${result.resultCount} total)`);
                    console.log(`   Time: ${result.executionTime}ms`);
                    if (result.kAnonymityApplied) {
                        console.log(`   🔒 k-anonymity protection applied`);
                    }
                    console.log('');
                } catch (error) {
                    console.error(`❌ Test failed: ${error.message}\n`);
                }
            }
        }

        if (args.includes('--stats')) {
            const stats = await searchAPI.getStats();
            console.log('\n📊 Search Index Statistics:');
            console.log(`   Total Keys: ${stats.totalKeys || 'N/A'}`);
            console.log(`   Equality Keys: ${stats.keysByOperation?.eq || 'N/A'}`);
            console.log(`   Prefix Keys: ${stats.keysByOperation?.pre || 'N/A'}`);
            console.log(`   Suffix Keys: ${stats.keysByOperation?.suf || 'N/A'}`);
            console.log(`   3-gram Keys: ${stats.keysByOperation?.g3 || 'N/A'}`);
        }

    } catch (error) {
        console.error('❌ Search API test failed:', error.message);
        process.exit(1);
    } finally {
        await searchAPI.close();
    }
}

// Export for use in other modules
module.exports = {
    PIIDatabaseSearchAPI,
    QUERY_TYPES,
    FIELD_MAP,
    VALID_OPS
};

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}