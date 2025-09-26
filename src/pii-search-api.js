require('dotenv').config();

// Environment variable validation
const requiredEnvVars = ['REDIS_HOST', 'REDIS_PORT', 'VAULT_ADDR', 'VAULT_TOKEN', 'DB_USER', 'DB_HOST', 'DB_DATABASE', 'DB_PASSWORD', 'DB_PORT'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please copy .env.template to .env and configure all required variables.');
    process.exit(1);
}
const crypto = require('crypto');
const redis = require('redis');
const vault = require('node-vault');
const { Client } = require('pg');

// PII-Safe Search Query API
// Implements privacy-preserving search with k-anonymity protection and audit logging

// Import constants from indexer
const { FIELD_IDS, BOUNDARY_START, BOUNDARY_END } = require('./pii-search-indexer');

// Configuration (should match indexer config)
const config = {
    redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD || null
    },
    vault: {
        endpoint: process.env.VAULT_ADDR,
        token: process.env.VAULT_TOKEN,
        requestOptions: {
            rejectUnauthorized: false,
            timeout: 10000,
            strictSSL: false
        }
    },
    database: {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT),
    },
    search: {
        region: process.env.PII_REGION || 'us-east-1',
        version: '1',
        minResultSize: parseInt(process.env.MIN_RESULT_SIZE) || 5, // k-anonymity protection
        maxResults: parseInt(process.env.MAX_RESULTS) || 1000,
        minQueryLength: parseInt(process.env.MIN_QUERY_LENGTH) || 2,
        rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 3600, // 1 hour
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100 // queries per hour
    }
};

// Search query types
const QUERY_TYPES = {
    EXACT: 'exact',
    CONTAINS: 'contains',
    STARTS_WITH: 'starts_with',
    ENDS_WITH: 'ends_with',
    PARTIAL: 'partial'
};

// Reverse field mapping for display
const FIELD_NAMES = Object.fromEntries(
    Object.entries(FIELD_IDS).map(([name, id]) => [id, name])
);

class PIISearchAPI {
    constructor() {
        this.redisClient = null;
        this.vaultClient = null;
        this.dbClient = null;
        this.regionKey = null;

        // Set global HTTPS agent to ignore SSL errors for Vault
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    async initialize() {
        try {
            console.log('🔍 Initializing PII Search API...');

            // Initialize Redis
            this.redisClient = redis.createClient(config.redis);
            await this.redisClient.connect();
            console.log('✅ Redis connected');

            // Initialize Vault
            this.vaultClient = vault(config.vault);
            const status = await this.vaultClient.status();
            console.log(`✅ Vault connected (sealed: ${status.sealed})`);

            // Initialize Database
            this.dbClient = new Client(config.database);
            await this.dbClient.connect();
            console.log('✅ Database connected');

            // Load region key from Vault
            await this.loadRegionKey();

            console.log('🚀 PII Search API ready');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize:', error.message);
            throw error;
        }
    }

    async loadRegionKey() {
        const keyPath = `secret/pii-search/region-keys/${config.search.region}`;

        try {
            const result = await this.vaultClient.read(keyPath);
            this.regionKey = Buffer.from(result.data.key, 'base64');
            console.log(`✅ Loaded region key for ${config.search.region}`);
        } catch (error) {
            console.error('❌ Failed to load region key. Run indexer first to create keys.');
            throw error;
        }
    }

    // Normalize text for search (must match indexer logic)
    normalizeText(text) {
        if (!text) return '';

        return text
            .normalize('NFKC')          // Unicode normalization
            .toLowerCase()             // Case folding
            .replace(/\s+/g, ' ')      // Collapse whitespace
            .trim();                   // Remove leading/trailing spaces
    }

    // Generate trigrams for query (must match indexer logic)
    generateQueryTrigrams(normalizedText, queryType) {
        if (normalizedText.length < 1) return [];

        let bounded;
        const trigrams = [];

        switch (queryType) {
            case QUERY_TYPES.EXACT:
                // Exact match: add both boundaries
                bounded = BOUNDARY_START + normalizedText + BOUNDARY_END;
                break;

            case QUERY_TYPES.STARTS_WITH:
                // Starts with: add start boundary only
                bounded = BOUNDARY_START + normalizedText;
                break;

            case QUERY_TYPES.ENDS_WITH:
                // Ends with: add end boundary only
                bounded = normalizedText + BOUNDARY_END;
                break;

            case QUERY_TYPES.CONTAINS:
            case QUERY_TYPES.PARTIAL:
            default:
                // Contains: no boundaries
                bounded = normalizedText;
                break;
        }

        // Generate all possible trigrams
        for (let i = 0; i <= bounded.length - 3; i++) {
            trigrams.push(bounded.substr(i, 3));
        }

        // For short queries, also include bigrams
        if (normalizedText.length <= 3) {
            for (let i = 0; i <= bounded.length - 2; i++) {
                trigrams.push(bounded.substr(i, 2));
            }
        }

        return [...new Set(trigrams)]; // Remove duplicates
    }

    // Generate HMAC'd key for a trigram (must match indexer logic)
    generateHmacKey(tenantId, fieldId, gram) {
        const data = `${tenantId || ''}|${fieldId}|${gram}`;
        const hmac = crypto.createHmac('sha256', this.regionKey)
            .update(data)
            .digest('base64url');

        // Use prefix for sharding
        const prefix = hmac.substring(0, 4);

        return `idx:${config.search.version}:${config.search.region}:${prefix}:${hmac}`;
    }

    // Rate limiting check
    async checkRateLimit(clientId) {
        const key = `rate:${clientId}`;
        const current = await this.redisClient.get(key);

        if (current && parseInt(current) >= config.search.rateLimitMax) {
            throw new Error(`Rate limit exceeded. Max ${config.search.rateLimitMax} queries per hour.`);
        }

        // Increment counter
        await this.redisClient.multi()
            .incr(key)
            .expire(key, config.search.rateLimitWindow)
            .exec();
    }

    // Audit logging
    async auditLog(queryInfo) {
        const auditEntry = {
            timestamp: new Date().toISOString(),
            queryId: crypto.randomUUID(),
            clientId: queryInfo.clientId,
            queryType: queryInfo.queryType,
            fieldIds: queryInfo.fieldIds,
            queryLength: queryInfo.normalizedQuery.length,
            resultCount: queryInfo.resultCount,
            region: config.search.region,
            version: config.search.version
        };

        // Store audit log (in production, use secure audit storage)
        await this.redisClient.lPush('audit:search', JSON.stringify(auditEntry));
        console.log(`📝 Audit: ${auditEntry.queryId} - ${queryInfo.queryType} query returned ${queryInfo.resultCount} results`);
    }

    // Resolve opaque tokens to record information
    async resolveTokens(opaqueTokens, includeDecrypted = false) {
        const results = [];

        for (const token of opaqueTokens) {
            try {
                const tokenMapping = await this.redisClient.hGetAll(`token:${token}`);

                if (tokenMapping && tokenMapping.recordId) {
                    const result = {
                        recordId: tokenMapping.recordId,
                        fieldType: FIELD_NAMES[tokenMapping.fieldId] || 'UNKNOWN',
                        fieldId: parseInt(tokenMapping.fieldId),
                        valueHash: tokenMapping.valueHash,
                        tenantId: tokenMapping.tenantId,
                        version: tokenMapping.version,
                        created: tokenMapping.created
                    };

                    // Optionally decrypt the actual PII value (only for authorized queries)
                    if (includeDecrypted) {
                        try {
                            // Fetch encrypted PII from database
                            const dbResult = await this.dbClient.query(
                                'SELECT pii_data_point FROM pii_token_data WHERE id = $1',
                                [tokenMapping.recordId]
                            );

                            if (dbResult.rows.length > 0) {
                                const decrypted = await this.decryptPIIData(dbResult.rows[0].pii_data_point);
                                result.decryptedValue = decrypted;
                            }
                        } catch (decryptError) {
                            console.error(`⚠️  Failed to decrypt token ${token}: ${decryptError.message}`);
                        }
                    }

                    results.push(result);
                }
            } catch (error) {
                console.error(`⚠️  Failed to resolve token ${token}: ${error.message}`);
            }
        }

        return results;
    }

    // Decrypt PII data using Vault
    async decryptPIIData(ciphertext) {
        try {
            const response = await this.vaultClient.write('transit/decrypt/pii-encryption-key', {
                ciphertext: ciphertext
            });
            return Buffer.from(response.data.plaintext, 'base64').toString('utf8');
        } catch (error) {
            console.error(`❌ Failed to decrypt: ${ciphertext.substring(0, 50)}...`);
            throw error;
        }
    }

    // Perform intersection of posting lists for multiple trigrams
    async intersectPostingLists(hmacKeys) {
        if (hmacKeys.length === 0) return [];
        if (hmacKeys.length === 1) {
            return await this.redisClient.sMembers(hmacKeys[0]);
        }

        // Use Redis SET intersection for multiple keys
        const tempKey = `temp:intersect:${crypto.randomUUID()}`;
        try {
            await this.redisClient.sInterStore(tempKey, hmacKeys);
            const result = await this.redisClient.sMembers(tempKey);
            await this.redisClient.del(tempKey);
            return result;
        } catch (error) {
            await this.redisClient.del(tempKey).catch(() => {}); // Cleanup on error
            throw error;
        }
    }

    // Main search function
    async search(query, options = {}) {
        const startTime = Date.now();

        try {
            // Extract and validate options
            const {
                queryType = QUERY_TYPES.CONTAINS,
                fieldIds = null, // null means search all fields
                tenantId = null,
                clientId = 'anonymous',
                includeDecrypted = false,
                maxResults = config.search.maxResults
            } = options;

            // Input validation
            if (!query || typeof query !== 'string') {
                throw new Error('Query must be a non-empty string');
            }

            if (query.length < config.search.minQueryLength) {
                throw new Error(`Query must be at least ${config.search.minQueryLength} characters long`);
            }

            if (!Object.values(QUERY_TYPES).includes(queryType)) {
                throw new Error(`Invalid query type: ${queryType}`);
            }

            // Rate limiting
            await this.checkRateLimit(clientId);

            // Normalize query
            const normalizedQuery = this.normalizeText(query);
            console.log(`🔍 Search: "${query}" -> "${normalizedQuery}" (${queryType})`);

            // Generate search trigrams
            const queryTrigrams = this.generateQueryTrigrams(normalizedQuery, queryType);
            console.log(`📊 Generated ${queryTrigrams.length} trigrams: ${queryTrigrams.join(', ')}`);

            if (queryTrigrams.length === 0) {
                throw new Error('Query too short to generate searchable trigrams');
            }

            // Determine which fields to search
            const searchFieldIds = fieldIds || Object.values(FIELD_IDS);
            const allHmacKeys = [];

            // Generate HMAC keys for all field/trigram combinations
            for (const fieldId of searchFieldIds) {
                for (const gram of queryTrigrams) {
                    const hmacKey = this.generateHmacKey(tenantId, fieldId, gram);
                    allHmacKeys.push(hmacKey);
                }
            }

            console.log(`🔑 Generated ${allHmacKeys.length} HMAC keys for search`);

            // Find intersection of posting lists
            const matchingTokens = await this.intersectPostingLists(allHmacKeys);
            console.log(`📋 Found ${matchingTokens.length} matching tokens before k-anonymity filter`);

            // Apply k-anonymity protection
            if (matchingTokens.length > 0 && matchingTokens.length < config.search.minResultSize) {
                console.log(`⚠️  Result set too small (${matchingTokens.length} < ${config.search.minResultSize}), blocked for k-anonymity`);
                throw new Error(`Search results blocked: insufficient result set size for privacy protection (minimum ${config.search.minResultSize})`);
            }

            // Limit results
            const limitedTokens = matchingTokens.slice(0, maxResults);

            // Resolve tokens to record information
            const results = await this.resolveTokens(limitedTokens, includeDecrypted);

            // Audit the search
            await this.auditLog({
                clientId,
                queryType,
                fieldIds: searchFieldIds,
                normalizedQuery,
                resultCount: results.length
            });

            const duration = Date.now() - startTime;

            return {
                success: true,
                query: {
                    original: query,
                    normalized: normalizedQuery,
                    type: queryType,
                    trigrams: queryTrigrams
                },
                results: results,
                metadata: {
                    totalMatches: matchingTokens.length,
                    returnedCount: results.length,
                    fieldsSearched: searchFieldIds.map(id => FIELD_NAMES[id] || id),
                    durationMs: duration,
                    kAnonymityThreshold: config.search.minResultSize
                }
            };

        } catch (error) {
            console.error(`❌ Search failed: ${error.message}`);

            return {
                success: false,
                error: error.message,
                query: {
                    original: query,
                    type: options.queryType || QUERY_TYPES.CONTAINS
                },
                metadata: {
                    durationMs: Date.now() - startTime
                }
            };
        }
    }

    // Batch search for multiple queries
    async batchSearch(queries, options = {}) {
        const results = [];

        for (const query of queries) {
            const result = await this.search(query, options);
            results.push(result);
        }

        return {
            batchResults: results,
            summary: {
                totalQueries: queries.length,
                successfulQueries: results.filter(r => r.success).length,
                failedQueries: results.filter(r => !r.success).length
            }
        };
    }

    // Get search statistics
    async getSearchStats() {
        try {
            const indexKeys = await this.redisClient.keys(`idx:${config.search.version}:${config.search.region}:*`);
            const auditEntries = await this.redisClient.lLen('audit:search');

            return {
                indexKeys: indexKeys.length,
                auditEntries: auditEntries,
                region: config.search.region,
                version: config.search.version,
                kAnonymityThreshold: config.search.minResultSize,
                rateLimits: {
                    maxQueriesPerHour: config.search.rateLimitMax,
                    windowSeconds: config.search.rateLimitWindow
                }
            };
        } catch (error) {
            console.error('❌ Failed to get search stats:', error.message);
            return { error: error.message };
        }
    }

    // Clean up resources
    async close() {
        if (this.redisClient) await this.redisClient.quit();
        if (this.dbClient) await this.dbClient.end();
        console.log('🛑 PII Search API closed');
    }
}

// Main execution for testing/demo
async function main() {
    console.log('🔍 PII Search API');
    console.log('=================');

    const args = process.argv.slice(2);

    if (args.includes('--help')) {
        console.log(`
Usage: node pii-search-api.js [options]

This script provides privacy-preserving search for encrypted PII data.

Options:
  --demo               Run interactive search demo
  --stats              Show search index statistics
  --help               Show this help message

Environment Variables:
  REDIS_HOST           Redis server host (default: localhost)
  REDIS_PORT           Redis server port (default: 6379)
  VAULT_ADDR           Vault server address
  VAULT_TOKEN          Vault authentication token
  MIN_RESULT_SIZE      Minimum result size for k-anonymity (default: 5)
  RATE_LIMIT_MAX       Max queries per hour per client (default: 100)

Search Types:
  exact                Exact match with boundaries
  contains             Substring match anywhere in text
  starts_with          Text starts with query
  ends_with            Text ends with query
  partial              General partial matching

Example API Usage:
  const api = new PIISearchAPI();
  await api.initialize();

  const results = await api.search('john', {
    queryType: 'contains',
    fieldIds: [FIELD_IDS.NAME, FIELD_IDS.EMAIL],
    includeDecrypted: true
  });

Privacy Features:
- HMAC'd search keys prevent enumeration attacks
- k-anonymity protection blocks small result sets
- Rate limiting prevents bulk queries
- Audit logging for compliance
- Opaque tokens hide direct record references
        `);
        return;
    }

    const searchAPI = new PIISearchAPI();

    try {
        await searchAPI.initialize();

        if (args.includes('--stats')) {
            const stats = await searchAPI.getSearchStats();
            console.log('\n📊 Search Index Statistics:');
            console.log(JSON.stringify(stats, null, 2));
        }

        if (args.includes('--demo')) {
            console.log('\n🎮 Running search demo...');

            // Demo searches
            const demoQueries = [
                { query: 'john', type: QUERY_TYPES.CONTAINS },
                { query: 'example.com', type: QUERY_TYPES.ENDS_WITH },
                { query: '987', type: QUERY_TYPES.STARTS_WITH }
            ];

            for (const demo of demoQueries) {
                console.log(`\n--- Testing ${demo.type} search for "${demo.query}" ---`);
                const result = await searchAPI.search(demo.query, {
                    queryType: demo.type,
                    clientId: 'demo-client',
                    includeDecrypted: false // Set to true if you want to see decrypted values
                });

                console.log(JSON.stringify(result, null, 2));
            }
        }

    } catch (error) {
        console.error('❌ Search API failed:', error.message);
        process.exit(1);
    } finally {
        await searchAPI.close();
    }
}

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

// Export for use as library
module.exports = {
    PIISearchAPI,
    QUERY_TYPES,
    FIELD_IDS,
    FIELD_NAMES
};

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}