#!/usr/bin/env node

// Rebuild Redis index from existing database records

const { Client } = require('pg');
const { FieldAwareRedisIndexer } = require('./src/field-aware-redis-indexer.js');
const NodeVault = require('node-vault');

const dbConfig = {
    user: 'postgres',
    host: 'localhost',
    database: 'pii',
    password: 'spini7788',
    port: 5432,
};

async function main() {
    console.log('🔄 Rebuilding Redis Index from Database');
    console.log('======================================');

    const client = new Client(dbConfig);
    await client.connect();
    console.log('✅ Database connected');

    // Initialize Redis indexer
    const redisIndexer = new FieldAwareRedisIndexer();
    await redisIndexer.initialize();

    // Initialize Vault
    const vault = NodeVault({
        apiVersion: 'v1',
        endpoint: 'https://127.0.0.1:8200',
        token: 'root',
        requestOptions: {
            rejectUnauthorized: false
        }
    });

    try {
        // Get all records from database
        const result = await client.query('SELECT data_type, pii_data_point, token FROM pii_token_data WHERE is_active = true');
        console.log(`📊 Found ${result.rows.length} active records in database`);

        let indexed = 0;
        let errors = 0;

        for (const row of result.rows) {
            try {
                // Decrypt the value
                const decryptResult = await vault.write('transit/decrypt/pii-encryption-key', {
                    ciphertext: row.pii_data_point
                });

                const decryptedValue = Buffer.from(decryptResult.data.plaintext, 'base64').toString('utf8');

                // Index in Redis
                await redisIndexer.indexFieldValue(row.data_type, decryptedValue, row.token);
                indexed++;

                if (indexed % 100 === 0) {
                    console.log(`⏱️  Indexed ${indexed}/${result.rows.length} records...`);
                }

            } catch (error) {
                console.error(`❌ Failed to index ${row.token}:`, error.message);
                errors++;
            }
        }

        console.log('\n🎯 Rebuild Complete:');
        console.log(`   ✅ Successfully indexed: ${indexed} records`);
        console.log(`   ❌ Errors: ${errors} records`);
        console.log(`   📊 Success rate: ${((indexed / result.rows.length) * 100).toFixed(1)}%`);

    } catch (error) {
        console.error('❌ Rebuild failed:', error);
    } finally {
        await redisIndexer.close();
        await client.end();
        console.log('🛑 Connections closed');
    }
}

if (require.main === module) {
    main().catch(console.error);
}