const vault = require('node-vault');
const fs = require('fs');
const csv = require('csv-parser');

// Load environment variables
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['VAULT_ADDR', 'VAULT_TOKEN'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please copy .env.template to .env and configure all required variables.');
    process.exit(1);
}

// STEP 2: Transform plaintext CSV to encrypted CSV using Vault

// Vault configuration (from environment variables only)
const vaultConfig = {
    apiVersion: 'v1',
    endpoint: process.env.VAULT_ADDR,
    token: process.env.VAULT_TOKEN,
    requestOptions: {
        rejectUnauthorized: process.env.VAULT_SKIP_VERIFY === 'true' ? false : true,
        timeout: 10000,
        strictSSL: process.env.VAULT_SKIP_VERIFY === 'true' ? false : true
    }
};

// Transit engine and key configuration
const TRANSIT_MOUNT = 'transit';
const ENCRYPTION_KEY = 'pii-encryption-key';

class VaultCSVEncryptor {
    constructor() {
        // Also set the global HTTPS agent to ignore SSL errors
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        this.vaultClient = vault(vaultConfig);
    }

    async initialize() {
        try {
            console.log(`🔗 Connecting to Vault server at ${vaultConfig.endpoint}...`);

            // Check Vault status
            const status = await this.vaultClient.status();
            console.log(`✅ Vault connection successful. Sealed: ${status.sealed}`);

            if (status.sealed) {
                throw new Error('Vault is sealed. Please unseal Vault first.');
            }

            // Enable transit engine if not already enabled
            await this.enableTransitEngine();

            // Create encryption key if not exists
            await this.createEncryptionKey();

            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Vault connection:');
            console.error(`   Error: ${error.message}`);
            throw error;
        }
    }

    async enableTransitEngine() {
        try {
            const mounts = await this.vaultClient.mounts();
            if (!mounts[`${TRANSIT_MOUNT}/`]) {
                console.log('🔧 Enabling transit engine...');
                await this.vaultClient.mount({
                    mount_point: TRANSIT_MOUNT,
                    type: 'transit',
                    description: 'Transit engine for PII encryption'
                });
                console.log('✅ Transit engine enabled');
            } else {
                console.log('✅ Transit engine already enabled');
            }
        } catch (error) {
            if (error.message.includes('path is already in use')) {
                console.log('✅ Transit engine already enabled');
            } else {
                throw error;
            }
        }
    }

    async createEncryptionKey() {
        try {
            await this.vaultClient.read(`${TRANSIT_MOUNT}/keys/${ENCRYPTION_KEY}`);
            console.log('✅ Encryption key already exists');
        } catch (error) {
            if (error.response && error.response.statusCode === 404) {
                console.log('🔑 Creating encryption key...');
                await this.vaultClient.write(`${TRANSIT_MOUNT}/keys/${ENCRYPTION_KEY}`, {
                    type: 'aes256-gcm96'
                });
                console.log('✅ Encryption key created');
            } else {
                throw error;
            }
        }
    }

    async encryptData(plaintext) {
        try {
            const base64Plaintext = Buffer.from(plaintext, 'utf8').toString('base64');
            const response = await this.vaultClient.write(`${TRANSIT_MOUNT}/encrypt/${ENCRYPTION_KEY}`, {
                plaintext: base64Plaintext
            });
            return response.data.ciphertext;
        } catch (error) {
            console.error(`❌ Encryption failed for: ${plaintext}`, error.message);
            throw error;
        }
    }
}

// Transform plaintext CSV to encrypted CSV
async function transformCSV(inputFile, outputFile) {
    const encryptor = new VaultCSVEncryptor();

    try {
        await encryptor.initialize();

        console.log(`\n📄 Reading plaintext CSV: ${inputFile}`);

        // Read input CSV
        const rows = [];
        await new Promise((resolve, reject) => {
            fs.createReadStream(inputFile)
                .pipe(csv())
                .on('data', (row) => {
                    rows.push(row);
                })
                .on('end', resolve)
                .on('error', reject);
        });

        console.log(`🔄 Encrypting ${rows.length} records...`);

        // Create output CSV with encrypted data
        let outputContent = 'data_type,pii_data_point,token,is_active,hash,created_by,modified_by\n';

        const progressInterval = Math.max(1, Math.floor(rows.length / 20));

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            try {
                // Encrypt the pii_data_point field
                const encryptedData = await encryptor.encryptData(row.pii_data_point);

                // Create new row with encrypted pii_data_point
                const escapedValues = [
                    row.data_type,         // preserve data_type field
                    `"${encryptedData}"`,  // encrypted pii_data_point
                    row.token,
                    row.is_active,
                    row.hash,
                    row.created_by,
                    row.modified_by
                ];

                outputContent += escapedValues.join(',') + '\n';

                // Progress update
                if ((i + 1) % progressInterval === 0) {
                    console.log(`   Encrypted ${i + 1}/${rows.length} records (${Math.round(((i + 1) / rows.length) * 100)}%)`);
                }

            } catch (error) {
                console.error(`❌ Failed to encrypt row ${i + 1}:`, error.message);
                throw error;
            }
        }

        // Write encrypted CSV
        fs.writeFileSync(outputFile, outputContent);

        console.log(`\n✅ Encryption complete!`);
        console.log(`📁 Encrypted CSV: ${outputFile}`);
        console.log(`📊 File size: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} KB`);

        return outputFile;
    } catch (error) {
        console.error('❌ CSV encryption failed:', error.message);
        throw error;
    }
}

// Main execution
async function main() {
    console.log('🔐 STEP 2: Vault CSV Encryptor');
    console.log('===============================');

    const args = process.argv.slice(2);

    if (args.includes('--help')) {
        console.log(`
Usage: node vault-csv-encryptor.js [options]

This script transforms a plaintext CSV file to an encrypted CSV file using Vault.

Options:
  --input <file>     Input plaintext CSV file (default: resources/generated_pii_data.csv)
  --output <file>    Output encrypted CSV file (default: resources/encrypted_pii_data.csv)
  --help             Show this help message

Environment Variables:
  VAULT_ADDR         Vault server address (default: https://127.0.0.1:8200)
  VAULT_TOKEN        Vault authentication token (default: root)

Prerequisites:
1. Vault server running with transit engine
2. Valid Vault token with encryption permissions
3. Input CSV with columns: pii_data_point,token,is_active,hash,created_by,modified_by

Pipeline:
  Step 1: npm run generate-pii     → Create plaintext CSV
  Step 2: npm run encrypt-csv      → Transform to encrypted CSV
  Step 3: npm run import-csv       → Import encrypted CSV to DB

Example:
  npm run encrypt-csv
  npm run encrypt-csv -- --input resources/my-data.csv --output resources/my-encrypted.csv
        `);
        return;
    }

    // Parse arguments
    let inputFile = 'resources/generated_pii_data.csv';
    let outputFile = 'resources/encrypted_pii_data.csv';

    const inputIndex = args.indexOf('--input');
    if (inputIndex !== -1 && args[inputIndex + 1]) {
        inputFile = args[inputIndex + 1];
    }

    const outputIndex = args.indexOf('--output');
    if (outputIndex !== -1 && args[outputIndex + 1]) {
        outputFile = args[outputIndex + 1];
    }

    // Check if input file exists
    if (!fs.existsSync(inputFile)) {
        console.error(`❌ Input file not found: ${inputFile}`);
        console.error('💡 Run "npm run generate-pii" first to create plaintext data');
        process.exit(1);
    }

    try {
        const startTime = Date.now();
        await transformCSV(inputFile, outputFile);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`⏱️  Total time: ${duration} seconds`);
        console.log(`\n🎯 Next step: npm run import-csv`);
    } catch (error) {
        console.error('❌ Failed to encrypt CSV:', error.message);
        process.exit(1);
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
    VaultCSVEncryptor,
    transformCSV
};

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}