const crypto = require('crypto');
const vault = require('node-vault');
const { Client } = require('pg');

// Load environment variables
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
    'DB_USER', 'DB_HOST', 'DB_DATABASE', 'DB_PASSWORD', 'DB_PORT',
    'VAULT_ADDR', 'VAULT_TOKEN'
];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please copy .env.template to .env and configure all required variables.');
    process.exit(1);
}

// Database-based PII-Safe Search Index Builder
// Implements reverse index with HMAC'd keys and opaque tokens stored in PostgreSQL
// Identical functionality to Redis approach but with database storage

// Configuration (from environment variables only)
const config = {
    vault: {
        endpoint: process.env.VAULT_ADDR,
        token: process.env.VAULT_TOKEN,
        requestOptions: {
            rejectUnauthorized: process.env.VAULT_SKIP_VERIFY === 'true' ? false : true,
            timeout: 10000,
            strictSSL: process.env.VAULT_SKIP_VERIFY === 'true' ? false : true
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
    FIRST_NAME: 3, // Map to NAME for compatibility
    LAST_NAME: 3,  // Map to NAME for compatibility
    MIDDLE_NAME: 3, // Map to NAME for compatibility
    ADDRESS: 4,
    PAN_CARD: 5,
    PASSPORT: 6,
    PASSPORT_NUMBER: 6, // Alias
    CREDIT_CARD: 7,
    SSN: 8,
    CITY: 10, // Separate field type for compatibility with Redis
    COUNTRY: 11, // Separate field type for compatibility with Redis
    MOBILE_NUMBER: 2, // Map to PHONE for compatibility
    DATE_OF_BIRTH: 9 // Add new field type
};

// Special boundary markers for start/end queries
const BOUNDARY_START = '\u0001';
const BOUNDARY_END = '\u0002';

class PIIDatabaseSearchIndexer {
    constructor() {
        this.vaultClient = null;
        this.dbClient = null;
        this.regionKey = null;

        // Set global HTTPS agent to ignore SSL errors for Vault
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    async initialize() {
        try {
            console.log('🚀 Initializing PII Database Search Indexer...');

            // Initialize Vault
            this.vaultClient = vault(config.vault);
            const status = await this.vaultClient.status();
            console.log(`✅ Vault connected (sealed: ${status.sealed})`);

            // Initialize Database
            this.dbClient = new Client(config.database);
            await this.dbClient.connect();
            console.log('✅ Database connected');

            // Verify pii_search_index table exists
            await this.verifyIndexTable();

            // Initialize HMAC secret (same as Redis)
            await this.initializeHmacSecret();

            console.log('🎯 PII Database Search Indexer ready');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize:', error.message);
            throw error;
        }
    }

    async verifyIndexTable() {
        try {
            const query = `
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'pii_search_index'
            `;
            const result = await this.dbClient.query(query);

            if (result.rows.length === 0) {
                throw new Error('pii_search_index table not found. Please create it first.');
            }

            console.log('✅ pii_search_index table verified');
        } catch (error) {
            console.error('❌ Failed to verify index table:', error.message);
            throw error;
        }
    }

    async initializeHmacSecret() {
        // Use the same HMAC secret as Redis indexer for consistency
        this.hmacSecret = process.env.REDIS_HMAC_SECRET || 'default-secret-key';
        console.log(`✅ Using Redis-compatible HMAC secret`);

        // Field mapping to compact aliases (same as Redis)
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
        return this.fieldMap[fieldName.toUpperCase()] || fieldName.toLowerCase();
    }

    // Generate all Redis-compatible index keys for a field value (for all operations)
    generateAllIndexKeys(field, value, k = 3) {
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

    // Determine field name from token suffix or PII data pattern
    determineFieldName(decryptedValue, token = null) {
        // First, try to extract field type from token suffix (most reliable)
        if (token && typeof token === 'string') {
            const tokenParts = token.split('_');
            if (tokenParts.length >= 3) {
                const fieldType = tokenParts.slice(2).join('_'); // Handle multi-word field types
                // Validate it's a known field type
                const validFieldTypes = ['FIRST_NAME', 'LAST_NAME', 'MIDDLE_NAME', 'FULL_NAME', 'EMAIL',
                                       'MOBILE_NUMBER', 'DATE_OF_BIRTH', 'ADDRESS', 'CITY', 'COUNTRY',
                                       'PAN_CARD', 'PASSPORT_NUMBER', 'CREDIT_CARD', 'SSN'];
                if (validFieldTypes.includes(fieldType)) {
                    return fieldType;
                }
            }
        }

        // Fallback: pattern-based detection
        const value = decryptedValue.toLowerCase();

        // Simple heuristics for field type detection
        if (value.includes('@')) return 'EMAIL';
        if (/^\d{10}$/.test(value.replace(/\D/g, ''))) return 'MOBILE_NUMBER';
        if (/^[A-Z]{5}\d{4}[A-Z]$/.test(decryptedValue.toUpperCase())) return 'PAN_CARD';
        if (/^[A-Z]\d{7}$/.test(decryptedValue.toUpperCase())) return 'PASSPORT_NUMBER';
        if (/^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/.test(value)) return 'CREDIT_CARD';
        if (/^\d{9}$/.test(value.replace(/\D/g, ''))) return 'SSN';
        if (value.includes(' ') && value.length > 10) return 'ADDRESS';

        // Check if it looks like a name (contains letters and possibly spaces)
        if (/^[a-zA-Z\s]+$/.test(decryptedValue) && value.length < 50) {
            // Try to determine if it's first, last, or full name
            const parts = value.trim().split(/\s+/);
            if (parts.length === 1) return 'FIRST_NAME';
            if (parts.length === 2) return 'FULL_NAME';
            if (parts.length >= 3) return 'FULL_NAME';
        }

        return 'FIRST_NAME'; // Default fallback
    }

    // Note: Token mapping not needed since we use existing tokens from pii_token_data

    // Add token to search index for a specific HMAC key
    async addTokenToIndex(hmacKey, opaqueToken, fieldType, retentionDate = null) {
        // Calculate retention date (1 year from now if not specified)
        const retention = retentionDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

        const query = `
            INSERT INTO pii_search_index (hmac_key, token_set, field_type, created_at, retention_until)
            VALUES ($1, $2, $3, NOW(), $4)
            ON CONFLICT (hmac_key) DO UPDATE SET
                token_set = CASE
                    WHEN pii_search_index.token_set LIKE '%' || $2 || '%'
                    THEN pii_search_index.token_set
                    ELSE pii_search_index.token_set || ',' || $2
                END,
                retention_until = GREATEST(pii_search_index.retention_until, $4)
        `;

        await this.dbClient.query(query, [hmacKey, opaqueToken, fieldType, retention]);
    }

    // Index a single PII record using Redis-compatible approach
    async indexFieldValue(fieldName, value, token) {
        try {
            const field = this.getFieldAlias(fieldName);
            const keys = this.generateAllIndexKeys(field, value);

            // Use transaction for consistency
            await this.dbClient.query('BEGIN');

            try {
                // Add token to all generated keys (same as Redis approach)
                for (const key of keys) {
                    await this.addTokenToIndex(key, token, fieldName);
                }

                await this.dbClient.query('COMMIT');

                return { indexed: keys.length, field: fieldName, alias: field };
            } catch (error) {
                await this.dbClient.query('ROLLBACK');
                throw error;
            }
        } catch (error) {
            console.error(`❌ Failed to index ${fieldName}="${value}":`, error.message);
            throw error;
        }
    }

    // Index a single PII record using existing token from database
    async indexRecord(recordId, encryptedPiiData, existingToken, fieldName, tenantId = null) {
        try {
            // Decrypt the PII data
            const decryptedValue = await this.decryptPIIData(encryptedPiiData);

            // Normalize the text
            const normalizedText = this.normalize(decryptedValue);

            if (!normalizedText) return null;

            // Use existing token instead of generating new one
            const opaqueToken = existingToken;

            // Determine field type if not provided (pass token for suffix-based detection)
            const actualFieldName = fieldName || this.determineFieldName(decryptedValue, opaqueToken);

            // Index using Redis-compatible approach
            const result = await this.indexFieldValue(actualFieldName, normalizedText, opaqueToken);

            return {
                recordId,
                opaqueToken,
                fieldName: result.field,
                fieldAlias: result.alias,
                keyCount: result.indexed,
                normalizedValue: normalizedText
            };

        } catch (error) {
            console.error(`❌ Failed to index record ${recordId}:`, error.message);
            throw error;
        }
    }

    // Ensure token mapping table exists
    async ensureTokenMappingTable() {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS pii_token_mappings (
                token VARCHAR(255) PRIMARY KEY,
                tenant_id VARCHAR(255),
                record_id VARCHAR(255) NOT NULL,
                field_id INTEGER NOT NULL,
                value_hash VARCHAR(64) NOT NULL,
                version VARCHAR(10) NOT NULL,
                created_at TIMESTAMP NOT NULL
            )
        `;

        await this.dbClient.query(createTableQuery);

        // Create indexes for efficient lookups
        const indexQueries = [
            'CREATE INDEX IF NOT EXISTS idx_token_mappings_record ON pii_token_mappings(record_id)',
            'CREATE INDEX IF NOT EXISTS idx_token_mappings_field ON pii_token_mappings(field_id)',
            'CREATE INDEX IF NOT EXISTS idx_token_mappings_created ON pii_token_mappings(created_at)'
        ];

        for (const indexQuery of indexQueries) {
            await this.dbClient.query(indexQuery);
        }
    }

    // Process all records from the database and build the index
    async buildIndexFromDatabase() {
        try {
            console.log('🔨 Building database search index from PII records...');

            const query = `
                SELECT id, pii_data_point, token
                FROM pii_token_data
                WHERE pii_data_point IS NOT NULL
                AND pii_data_point LIKE 'vault:v1:%'
                ORDER BY created_at ASC
            `;

            const result = await this.dbClient.query(query);
            console.log(`📊 Found ${result.rows.length} encrypted PII records to index`);

            let indexed = 0;
            let failed = 0;

            for (const row of result.rows) {
                try {
                    // Since field_name doesn't exist, we'll determine the field type from the decrypted content
                    await this.indexRecord(row.id, row.pii_data_point, row.token, null);
                    indexed++;

                    if (indexed % 100 === 0) {
                        console.log(`📈 Progress: ${indexed}/${result.rows.length} records indexed`);
                    }
                } catch (error) {
                    console.error(`⚠️  Failed to index record ${row.id}: ${error.message}`);
                    failed++;
                }
            }

            console.log(`\n🎯 Database index build complete:`);
            console.log(`   ✅ Successfully indexed: ${indexed} records`);
            console.log(`   ❌ Failed to index: ${failed} records`);
            console.log(`   📊 Index statistics: ${JSON.stringify(await this.getIndexStats(), null, 2)}`);

            return { indexed, failed, total: result.rows.length };

        } catch (error) {
            console.error('❌ Failed to build database index:', error.message);
            throw error;
        }
    }

    // Get index statistics
    async getIndexStats() {
        try {
            const queries = [
                'SELECT COUNT(*) as total_hmac_keys FROM pii_search_index',
                'SELECT field_type, COUNT(*) as count FROM pii_search_index GROUP BY field_type ORDER BY count DESC',
                'SELECT COUNT(*) as total_tokens FROM pii_token_mappings',
                `SELECT
                    MIN(created_at) as oldest_entry,
                    MAX(created_at) as newest_entry,
                    COUNT(CASE WHEN retention_until < NOW() THEN 1 END) as expired_entries
                 FROM pii_search_index`
            ];

            const [totalKeys, fieldDistribution, totalTokens, dateStats] = await Promise.all(
                queries.map(query => this.dbClient.query(query))
            );

            return {
                totalHmacKeys: parseInt(totalKeys.rows[0].total_hmac_keys),
                totalTokens: parseInt(totalTokens.rows[0].total_tokens),
                fieldDistribution: fieldDistribution.rows,
                oldestEntry: dateStats.rows[0].oldest_entry,
                newestEntry: dateStats.rows[0].newest_entry,
                expiredEntries: parseInt(dateStats.rows[0].expired_entries)
            };
        } catch (error) {
            console.error('❌ Failed to get database stats:', error.message);
            return { error: error.message };
        }
    }

    // Clean up expired entries (GDPR retention compliance)
    async cleanupExpiredEntries() {
        try {
            const deleteQuery = 'DELETE FROM pii_search_index WHERE retention_until < NOW()';
            const result = await this.dbClient.query(deleteQuery);
            console.log(`🧹 Cleaned up ${result.rowCount} expired index entries`);
            return result.rowCount;
        } catch (error) {
            console.error('❌ Failed to cleanup expired entries:', error.message);
            throw error;
        }
    }

    // Clean up resources
    async close() {
        if (this.dbClient) await this.dbClient.end();
        console.log('🛑 PII Database Search Indexer closed');
    }
}

// Main execution
async function main() {
    console.log('🔍 PII Database Search Index Builder');
    console.log('====================================');

    const args = process.argv.slice(2);

    if (args.includes('--help')) {
        console.log(`
Usage: node pii-db-search-indexer.js [options]

This script builds a privacy-preserving search index for encrypted PII data using PostgreSQL.

Options:
  --build-index         Build search index from database records
  --stats              Show index statistics
  --cleanup            Clean up expired entries
  --help               Show this help message

Environment Variables:
  VAULT_ADDR           Vault server address
  VAULT_TOKEN          Vault authentication token
  DB_HOST              Database host (default: localhost)
  DB_NAME              Database name (default: pii)
  DB_USER              Database user (default: postgres)
  DB_PASSWORD          Database password
  PII_REGION           Region identifier (default: us-east-1)
  MIN_RESULT_SIZE      Minimum result size for k-anonymity (default: 5)

Database Requirements:
- Table 'pii_search_index' must exist with proper schema
- Recommended indexes on hmac_key, field_type, retention_until

Architecture:
- Generates trigrams from decrypted PII data
- Creates HMAC'd keys using region-specific secrets
- Stores opaque tokens in PostgreSQL instead of Redis
- Identical GDPR compliance to Redis approach
- ACID transaction support for consistency

Example:
  node pii-db-search-indexer.js --build-index
  node pii-db-search-indexer.js --stats
  node pii-db-search-indexer.js --cleanup
        `);
        return;
    }

    const indexer = new PIIDatabaseSearchIndexer();

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
            console.log('\n📊 Database Index Statistics:');
            console.log(`   Total HMAC Keys: ${stats.totalHmacKeys || 'N/A'}`);
            console.log(`   Total Tokens: ${stats.totalTokens || 'N/A'}`);
            console.log(`   Expired Entries: ${stats.expiredEntries || 'N/A'}`);
            console.log(`   Date Range: ${stats.oldestEntry || 'N/A'} to ${stats.newestEntry || 'N/A'}`);
            if (stats.fieldDistribution && stats.fieldDistribution.length > 0) {
                console.log('\n📋 Field Distribution:');
                stats.fieldDistribution.forEach(field => {
                    console.log(`   ${field.field_type}: ${field.count}`);
                });
            }
        }

        if (args.includes('--cleanup')) {
            const cleaned = await indexer.cleanupExpiredEntries();
            console.log(`✅ Cleanup complete: ${cleaned} entries removed`);
        }

    } catch (error) {
        console.error('❌ Database indexer failed:', error.message);
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
    PIIDatabaseSearchIndexer,
    FIELD_IDS,
    BOUNDARY_START,
    BOUNDARY_END
};

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}