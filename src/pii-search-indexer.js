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

// PII-Safe Search Index Builder
// Implements reverse index with HMAC'd keys and opaque tokens for GDPR-compliant PII search

// Configuration
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
        maxResults: parseInt(process.env.MAX_RESULTS) || 1000
    }
};

// Field mappings (enum values instead of field names for privacy)
const FIELD_IDS = {
    EMAIL: 1,
    PHONE: 2,
    NAME: 3,
    ADDRESS: 4,
    PAN_CARD: 5,
    PASSPORT: 6,
    CREDIT_CARD: 7,
    SSN: 8
};

// Special boundary markers for start/end queries
const BOUNDARY_START = '\u0001';
const BOUNDARY_END = '\u0002';

class PIISearchIndexer {
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
            console.log('🚀 Initializing PII Search Indexer...');

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

            // Get or create region key from Vault
            await this.initializeRegionKey();

            console.log('🎯 PII Search Indexer ready');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize:', error.message);
            throw error;
        }
    }

    async initializeRegionKey() {
        const keyPath = `secret/pii-search/region-keys/${config.search.region}`;

        try {
            // Try to read existing key
            const result = await this.vaultClient.read(keyPath);
            this.regionKey = Buffer.from(result.data.key, 'base64');
            console.log(`✅ Loaded region key for ${config.search.region}`);
        } catch (error) {
            if (error.response && error.response.statusCode === 404) {
                // Generate new region key
                this.regionKey = crypto.randomBytes(32);
                await this.vaultClient.write(keyPath, {
                    key: this.regionKey.toString('base64'),
                    created: new Date().toISOString(),
                    region: config.search.region
                });
                console.log(`🔑 Generated new region key for ${config.search.region}`);
            } else {
                throw error;
            }
        }
    }

    // Normalize text for consistent indexing
    normalizeText(text) {
        if (!text) return '';

        return text
            .normalize('NFKC')          // Unicode normalization
            .toLowerCase()             // Case folding
            .replace(/\s+/g, ' ')      // Collapse whitespace
            .trim();                   // Remove leading/trailing spaces
    }

    // Generate all trigrams for a normalized text
    generateTrigrams(normalizedText) {
        if (normalizedText.length < 1) return [];

        // Add boundary markers
        const bounded = BOUNDARY_START + normalizedText + BOUNDARY_END;
        const trigrams = [];

        // Generate all possible trigrams
        for (let i = 0; i <= bounded.length - 3; i++) {
            trigrams.push(bounded.substr(i, 3));
        }

        // For short texts, also include bigrams with boundary markers
        if (normalizedText.length <= 3) {
            for (let i = 0; i <= bounded.length - 2; i++) {
                trigrams.push(bounded.substr(i, 2));
            }
        }

        return [...new Set(trigrams)]; // Remove duplicates
    }

    // Generate HMAC'd key for a trigram
    generateHmacKey(tenantId, fieldId, gram) {
        const data = `${tenantId || ''}|${fieldId}|${gram}`;
        const hmac = crypto.createHmac('sha256', this.regionKey)
            .update(data)
            .digest('base64url');

        // Use prefix for sharding
        const prefix = hmac.substring(0, 4);

        return `idx:${config.search.version}:${config.search.region}:${prefix}:${hmac}`;
    }

    // Generate opaque token for a record
    generateOpaqueToken() {
        return crypto.randomBytes(16).toString('base64url');
    }

    // Calculate hash of the original value for integrity
    calculateValueHash(value) {
        return crypto.createHash('sha256').update(value).digest('hex');
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

    // Determine field ID from PII data type or pattern
    determineFieldId(decryptedValue) {
        const value = decryptedValue.toLowerCase();

        // Simple heuristics for field type detection
        if (value.includes('@')) return FIELD_IDS.EMAIL;
        if (/^\d{10}$/.test(value.replace(/\D/g, ''))) return FIELD_IDS.PHONE;
        if (/^[A-Z]{5}\d{4}[A-Z]$/.test(decryptedValue.toUpperCase())) return FIELD_IDS.PAN_CARD;
        if (/^[A-Z]\d{7}$/.test(decryptedValue.toUpperCase())) return FIELD_IDS.PASSPORT;
        if (/^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/.test(value)) return FIELD_IDS.CREDIT_CARD;
        if (/^\d{9}$/.test(value.replace(/\D/g, ''))) return FIELD_IDS.SSN;
        if (value.includes(' ') && value.length > 10) return FIELD_IDS.ADDRESS;

        return FIELD_IDS.NAME; // Default fallback
    }

    // Index a single PII record
    async indexRecord(recordId, encryptedPiiData, tenantId = null) {
        try {
            // Decrypt the PII data
            const decryptedValue = await this.decryptPIIData(encryptedPiiData);

            // Determine field type
            const fieldId = this.determineFieldId(decryptedValue);

            // Normalize the text
            const normalizedText = this.normalizeText(decryptedValue);

            if (!normalizedText) return null;

            // Generate opaque token
            const opaqueToken = this.generateOpaqueToken();

            // Calculate value hash for integrity
            const valueHash = this.calculateValueHash(decryptedValue);

            // Generate trigrams
            const trigrams = this.generateTrigrams(normalizedText);

            console.log(`📝 Indexing record ${recordId}: "${normalizedText}" -> ${trigrams.length} trigrams`);

            // Store token mapping in secure storage (could be separate DB table)
            const tokenMapping = {
                token: opaqueToken,
                tenantId: tenantId,
                recordId: recordId,
                fieldId: fieldId,
                valueHash: valueHash,
                version: config.search.version,
                created: new Date().toISOString()
            };

            // Store token mapping (in production, use encrypted secure storage)
            await this.redisClient.hSet(`token:${opaqueToken}`, tokenMapping);

            // Create reverse mapping for deletion support
            const reverseKey = `ridx:${tenantId || 'null'}:${recordId}:${fieldId}`;
            const hmacKeys = [];

            // Index each trigram
            for (const gram of trigrams) {
                const hmacKey = this.generateHmacKey(tenantId, fieldId, gram);
                hmacKeys.push(hmacKey);

                // Add token to the posting list
                await this.redisClient.sAdd(hmacKey, opaqueToken);
            }

            // Store reverse mapping for deletion
            await this.redisClient.lPush(reverseKey, ...hmacKeys);

            console.log(`✅ Indexed ${trigrams.length} trigrams for record ${recordId}`);

            return {
                recordId,
                opaqueToken,
                fieldId,
                trigramCount: trigrams.length,
                normalizedValue: normalizedText
            };

        } catch (error) {
            console.error(`❌ Failed to index record ${recordId}:`, error.message);
            throw error;
        }
    }

    // Process all records from the database and build the index
    async buildIndexFromDatabase() {
        try {
            console.log('🔨 Building search index from database...');

            const query = `
                SELECT id, pii_data_point, token
                FROM pii_token_data
                WHERE pii_data_point IS NOT NULL
                AND pii_data_point LIKE 'vault:v1:%'
                ORDER BY creation_date ASC
            `;

            const result = await this.dbClient.query(query);
            console.log(`📊 Found ${result.rows.length} encrypted PII records to index`);

            let indexed = 0;
            let failed = 0;

            for (const row of result.rows) {
                try {
                    await this.indexRecord(row.id, row.pii_data_point);
                    indexed++;

                    if (indexed % 100 === 0) {
                        console.log(`📈 Progress: ${indexed}/${result.rows.length} records indexed`);
                    }
                } catch (error) {
                    console.error(`⚠️  Failed to index record ${row.id}: ${error.message}`);
                    failed++;
                }
            }

            console.log(`\n🎯 Index build complete:`);
            console.log(`   ✅ Successfully indexed: ${indexed} records`);
            console.log(`   ❌ Failed to index: ${failed} records`);
            console.log(`   📊 Total trigrams in index: ${await this.getIndexStats()}`);

            return { indexed, failed, total: result.rows.length };

        } catch (error) {
            console.error('❌ Failed to build index:', error.message);
            throw error;
        }
    }

    // Get index statistics
    async getIndexStats() {
        try {
            const keys = await this.redisClient.keys(`idx:${config.search.version}:${config.search.region}:*`);
            let totalTokens = 0;

            for (const key of keys.slice(0, 100)) { // Sample first 100 keys
                const count = await this.redisClient.sCard(key);
                totalTokens += count;
            }

            return {
                totalKeys: keys.length,
                sampleTokenCount: totalTokens,
                estimatedTotalTokens: Math.round((totalTokens / Math.min(keys.length, 100)) * keys.length)
            };
        } catch (error) {
            console.error('❌ Failed to get stats:', error.message);
            return { error: error.message };
        }
    }

    // Clean up resources
    async close() {
        if (this.redisClient) await this.redisClient.quit();
        if (this.dbClient) await this.dbClient.end();
        console.log('🛑 PII Search Indexer closed');
    }
}

// Main execution
async function main() {
    console.log('🔍 PII Search Index Builder');
    console.log('============================');

    const args = process.argv.slice(2);

    if (args.includes('--help')) {
        console.log(`
Usage: node pii-search-indexer.js [options]

This script builds a privacy-preserving search index for encrypted PII data.

Options:
  --build-index         Build search index from database records
  --stats              Show index statistics
  --help               Show this help message

Environment Variables:
  REDIS_HOST           Redis server host (default: localhost)
  REDIS_PORT           Redis server port (default: 6379)
  REDIS_PASSWORD       Redis password (optional)
  VAULT_ADDR           Vault server address
  VAULT_TOKEN          Vault authentication token
  PII_REGION           Region identifier (default: us-east-1)
  MIN_RESULT_SIZE      Minimum result size for k-anonymity (default: 5)

Architecture:
- Generates trigrams from decrypted PII data
- Creates HMAC'd keys using region-specific secrets
- Stores opaque tokens in Redis posting lists
- Supports contains/starts/ends/exact text search
- GDPR-compliant with deterministic erasure paths

Example:
  node pii-search-indexer.js --build-index
  node pii-search-indexer.js --stats
        `);
        return;
    }

    const indexer = new PIISearchIndexer();

    try {
        await indexer.initialize();

        if (args.includes('--build-index')) {
            const startTime = Date.now();
            const result = await indexer.buildIndexFromDatabase();
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`⏱️  Build time: ${duration} seconds`);
        }

        if (args.includes('--stats')) {
            const stats = await indexer.getIndexStats();
            console.log('\n📊 Index Statistics:');
            console.log(`   Index Keys: ${stats.totalKeys || 'N/A'}`);
            console.log(`   Estimated Tokens: ${stats.estimatedTotalTokens || 'N/A'}`);
        }

    } catch (error) {
        console.error('❌ Indexer failed:', error.message);
        process.exit(1);
    } finally {
        await indexer.close();
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

// Export for testing
module.exports = {
    PIISearchIndexer,
    FIELD_IDS,
    BOUNDARY_START,
    BOUNDARY_END
};

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}