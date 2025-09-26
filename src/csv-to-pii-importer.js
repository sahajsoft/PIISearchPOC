const fs = require('fs');
const csv = require('csv-parser');
const { Client } = require('pg');
const crypto = require('crypto');
const { spawn } = require('child_process');
const vault = require('node-vault');
const { FieldAwareRedisIndexer } = require('./field-aware-redis-indexer.js');

// Load environment variables
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
    'DB_USER', 'DB_HOST', 'DB_DATABASE', 'DB_PASSWORD', 'DB_PORT',
    'VAULT_ADDR', 'VAULT_TOKEN',
    'REDIS_HOST', 'REDIS_PORT'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please copy .env.template to .env and configure all required variables.');
    process.exit(1);
}

// Database configuration (from environment variables only)
const dbConfig = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
};

// Vault configuration (from environment variables only)
const vaultConfig = {
    endpoint: process.env.VAULT_ADDR,
    token: process.env.VAULT_TOKEN,
    requestOptions: {
        rejectUnauthorized: process.env.VAULT_SKIP_VERIFY === 'true' ? false : true,
        timeout: 10000,
        strictSSL: process.env.VAULT_SKIP_VERIFY === 'true' ? false : true
    }
};

// Redis configuration (from environment variables only)
const redisConfig = {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD || null
};

// STEP 3: Import encrypted CSV to database

// CSV file path - use output from Step 2 (vault-csv-encryptor.js)
const csvFilePath = 'resources/encrypted_pii_data.csv';

// Expected CSV columns from Step 2: pii_data_point (encrypted), token, is_active, hash, created_by, modified_by
// Sample CSV format:
// pii_data_point,token,is_active,hash,created_by,modified_by
// "vault:v1:encrypted_data_here",TKN_ABC123,true,a1b2c3d4e5f6,admin,admin

async function connectToDatabase() {
    const client = new Client(dbConfig);
    try {
        await client.connect();
        console.log('Connected to PostgreSQL database');
        return client;
    } catch (error) {
        console.error('Database connection error:', error);
        throw error;
    }
}

function generateUUID() {
    return crypto.randomUUID();
}

function getCurrentTimestamp() {
    return new Date().toISOString();
}

function generateToken(dataType) {
    const prefix = 'TKN_';
    const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `${prefix}${randomPart}`;
}

function generateHash(plaintext) {
    return crypto.createHash('md5').update(plaintext).digest('hex');
}

function determineFieldType(record, decryptedValue = null) {
    // Use data_type from CSV if available (preferred method)
    if (record.data_type) {
        return record.data_type;
    }

    // If decrypted value is provided, use it for accurate field detection
    if (decryptedValue) {
        const value = decryptedValue.toLowerCase();

        // Consistent heuristics matching the database indexer
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

    // Fallback: Cannot reliably determine from encrypted data
    const encryptedValue = record.pii_data_point;
    if (encryptedValue && encryptedValue.startsWith('vault:v1:')) {
        return 'UNKNOWN'; // Cannot determine from encrypted data
    }

    // Final fallback for plaintext (shouldn't happen in normal flow)
    const value = encryptedValue ? encryptedValue.toLowerCase() : '';
    if (value.includes('@')) return 'EMAIL';
    if (/^\d{10}$/.test(value.replace(/\D/g, ''))) return 'MOBILE_NUMBER';
    if (/^[A-Z]{5}\d{4}[A-Z]$/i.test(value)) return 'PAN_CARD';
    if (/^[A-Z]\d{7}$/i.test(value)) return 'PASSPORT_NUMBER';

    return 'FIRST_NAME'; // Consistent default fallback (no randomization)
}

// Decrypt PII data using Vault (for Redis indexing)
async function decryptVaultData(vaultClient, ciphertext) {
    try {
        if (!ciphertext.startsWith('vault:v1:')) {
            // If not encrypted, return as-is (shouldn't happen in normal flow)
            return ciphertext;
        }

        const response = await vaultClient.write('transit/decrypt/pii-encryption-key', {
            ciphertext: ciphertext
        });

        return Buffer.from(response.data.plaintext, 'base64').toString('utf8');
    } catch (error) {
        console.error(`❌ Decryption failed for: ${ciphertext.substring(0, 50)}...`);
        throw error;
    }
}

// Note: buildSearchIndex() function removed - now using real-time FieldAwareRedisIndexer

async function insertPiiRecord(client, record) {
    const query = `
        INSERT INTO pii_token_data (
            pii_data_point,
            token,
            is_active,
            hash,
            created_by,
            modified_by,
            created_at,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `;

    const currentTime = getCurrentTimestamp();

    const fieldName = determineFieldType(record);

    const values = [
        record.pii_data_point,  // Already encrypted by Step 2
        record.token,
        record.is_active === 'true' || record.is_active === true,
        record.hash || null,
        record.created_by || 'csv_import',
        record.modified_by || 'csv_import'
    ];

    try {
        await client.query(query, values);
        // Reduced logging - only log every 1000 records instead of every record
        return { success: true, token: record.token, encryptedValue: record.pii_data_point };
    } catch (error) {
        console.error('Error inserting record:', error);
        console.error('Record data:', record);
        return { success: false };
    }
}

async function processCsvFile() {
    const client = await connectToDatabase();

    // Initialize Field-Aware Redis indexer for Approach 2
    const redisIndexer = new FieldAwareRedisIndexer(redisConfig);
    await redisIndexer.initialize();

    // Initialize Vault client for decryption (needed for Redis indexing)
    const vaultClient = vault(vaultConfig);

    try {
        let totalRecords = 0;
        let successfulInserts = 0;
        let failedInserts = 0;
        let redisIndexed = 0;

        // Check if CSV file exists
        if (!fs.existsSync(csvFilePath)) {
            throw new Error(`CSV file not found: ${csvFilePath}`);
        }

        console.log(`Processing CSV file: ${csvFilePath}`);

        // Collect all rows first, then process them
        const rows = [];
        await new Promise((resolve, reject) => {
            fs.createReadStream(csvFilePath)
                .pipe(csv())
                .on('data', (row) => {
                    rows.push(row);
                })
                .on('end', () => {
                    resolve();
                })
                .on('error', (error) => {
                    console.error('CSV processing error:', error);
                    reject(error);
                });
        });

        // Process rows sequentially
        for (const row of rows) {
            totalRecords++;

            // Validate required fields
            if (!row.pii_data_point || !row.token) {
                console.warn(`Skipping row ${totalRecords}: missing required fields (pii_data_point, token)`);
                failedInserts++;
                continue;
            }

            const result = await insertPiiRecord(client, row);
            if (result.success) {
                successfulInserts++;

                // Approach 2: Index in Redis HMAC after successful DB insert
                try {
                    // Decrypt the PII data for Redis indexing
                    const decryptedValue = await decryptVaultData(vaultClient, result.encryptedValue);

                    // Index the decrypted text in Redis using field-aware HMAC
                    // Use decrypted value for consistent field detection
                    const fieldName = determineFieldType(row, decryptedValue);
                    await redisIndexer.indexFieldValue(fieldName, decryptedValue, result.token);
                    redisIndexed++;

                    if (successfulInserts % 1000 === 0) {
                        console.log(`📊 Progress: DB=${successfulInserts}, Redis=${redisIndexed} records indexed`);
                    }
                } catch (redisError) {
                    console.warn(`⚠️  Redis indexing failed for token ${result.token}: ${redisError.message}`);
                }
            } else {
                failedInserts++;
            }
        }

        console.log('\n=== Import Summary ===');
        console.log(`Total records processed: ${totalRecords}`);
        console.log(`Successful inserts: ${successfulInserts}`);
        console.log(`Failed inserts: ${failedInserts}`);
        console.log('\n=== Approach Comparison ===');
        console.log(`Approach 1 (DB field_name): ${successfulInserts} records with field_name column`);
        console.log(`Approach 2 (Redis HMAC): ${redisIndexed} records indexed in Redis`);

        // Get Redis indexing stats
        const redisStats = await redisIndexer.getStats();
        console.log(`Redis index keys: ${redisStats.totalKeys || 'N/A'}`);
        console.log(`Estimated Redis tokens: ${redisStats.estimatedTotalTokens || 'N/A'}`);

        // Note: Search indexing is now done in real-time during import via FieldAwareRedisIndexer
        // No need to build additional search index
        console.log('\n✅ Field-aware Redis indexing completed during import');

    } catch (error) {
        console.error('Error processing CSV file:', error);
    } finally {
        await client.end();
        await redisIndexer.close();
        console.log('Database and Field-Aware Redis connections closed');
    }
}

// Sample encrypted CSV creation function (for reference)
function createSampleCsv() {
    const sampleData = `data_type,plaintext,ciphertext,encryption_key
email,"john.doe@example.com","vault:v1:sample_encrypted_data_1","pii-encryption-key"
email,"jane.smith@test.com","vault:v1:sample_encrypted_data_2","pii-encryption-key"
phone,"9876543210","vault:v1:sample_encrypted_data_3","pii-encryption-key"`;

    fs.writeFileSync('resources/sample_encrypted_pii_data.csv', sampleData);
    console.log('Sample encrypted CSV file created: resources/sample_encrypted_pii_data.csv');
    console.log('Note: Use vault-encrypt or crypto-encrypt scripts to generate real encrypted data');
}

// Main execution
async function main() {
    console.log('🗄️  STEP 3: Import Encrypted CSV to Database');
    console.log('===================');

    // Check command line arguments
    const args = process.argv.slice(2);

    if (args.includes('--create-sample')) {
        createSampleCsv();
        return;
    }

    if (args.includes('--help')) {
        console.log(`
Usage: node csv-to-pii-importer.js [options]

Options:
  --create-sample    Create a sample CSV file
  --help            Show this help message

Before running:
1. Update database configuration in the dbConfig object
2. Install required dependencies: npm install csv-parser pg
3. Complete the 3-step pipeline:
   Step 1: npm run generate-pii    → Create plaintext CSV
   Step 2: npm run encrypt-csv     → Transform to encrypted CSV
   Step 3: npm run import-csv      → Import encrypted CSV to DB

Expected CSV format (from Step 2):
pii_data_point,token,is_active,hash,created_by,modified_by
"vault:v1:encrypted_data",TKN_ABC123,true,hash_value,admin,admin

Note: The pii_data_point field contains Vault-encrypted data
        `);
        return;
    }

    await processCsvFile();
}

// Handle unhandled errors
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

// Run the main function
main().catch(console.error);