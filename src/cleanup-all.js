#!/usr/bin/env node

const { Client } = require('pg');
const { createClient } = require('redis');

// Load environment variables
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
    'DB_USER', 'DB_HOST', 'DB_DATABASE', 'DB_PASSWORD', 'DB_PORT',
    'REDIS_HOST', 'REDIS_PORT'
];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please copy .env.template to .env and configure all required variables.');
    process.exit(1);
}

// Database configuration
const dbConfig = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
};

// Redis configuration
const redisConfig = {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD || null
};

class DataCleanup {
    constructor() {
        this.dbClient = null;
        this.redisClient = null;
    }

    async initialize() {
        try {
            // Initialize database connection
            this.dbClient = new Client(dbConfig);
            await this.dbClient.connect();
            console.log('✅ Database connected');

            // Initialize Redis connection
            this.redisClient = createClient(redisConfig);
            await this.redisClient.connect();
            console.log('✅ Redis connected');

            return true;
        } catch (error) {
            console.error('❌ Failed to initialize connections:', error.message);
            throw error;
        }
    }

    async cleanupDatabase() {
        try {
            console.log('🧹 Cleaning up database tables...');

            // Drop and recreate pii_search_index table
            console.log('  📋 Dropping pii_search_index table...');
            await this.dbClient.query('DROP TABLE IF EXISTS pii_search_index CASCADE');

            console.log('  📋 Recreating pii_search_index table...');
            await this.dbClient.query(`
                CREATE TABLE pii_search_index (
                    hmac_key VARCHAR(255) PRIMARY KEY,
                    token_set TEXT NOT NULL,
                    field_type VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    retention_until TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '1 year')
                )
            `);

            // Create indexes for performance
            console.log('  🔍 Creating indexes...');
            await this.dbClient.query('CREATE INDEX idx_pii_search_field_type ON pii_search_index(field_type)');
            await this.dbClient.query('CREATE INDEX idx_pii_search_retention ON pii_search_index(retention_until)');
            await this.dbClient.query('CREATE INDEX idx_pii_search_field_hmac ON pii_search_index(field_type, hmac_key)');
            await this.dbClient.query('CREATE INDEX idx_pii_search_cleanup ON pii_search_index(retention_until, field_type) WHERE retention_until IS NOT NULL');

            // Drop and recreate pii_token_data table
            console.log('  📋 Dropping pii_token_data table...');
            await this.dbClient.query('DROP TABLE IF EXISTS pii_token_data CASCADE');

            console.log('  📋 Recreating pii_token_data table...');
            await this.dbClient.query(`
                CREATE TABLE pii_token_data (
                    id SERIAL PRIMARY KEY,
                    pii_data_point TEXT NOT NULL,
                    token VARCHAR(255) UNIQUE NOT NULL,
                    is_active BOOLEAN DEFAULT true,
                    hash VARCHAR(255),
                    created_by VARCHAR(255),
                    modified_by VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create indexes for pii_token_data
            console.log('  🔍 Creating indexes for pii_token_data...');
            await this.dbClient.query('CREATE INDEX idx_pii_token_data_token ON pii_token_data(token)');
            await this.dbClient.query('CREATE INDEX idx_pii_token_data_active ON pii_token_data(is_active)');
            await this.dbClient.query('CREATE INDEX idx_pii_token_data_hash ON pii_token_data(hash)');

            console.log('✅ Database tables cleaned and recreated');
        } catch (error) {
            console.error('❌ Database cleanup failed:', error.message);
            throw error;
        }
    }

    async cleanupRedis() {
        try {
            console.log('🧹 Cleaning up Redis store...');

            // Get all keys to see what we're deleting
            const allKeys = await this.redisClient.keys('*');
            console.log(`  📊 Found ${allKeys.length} keys in Redis`);

            if (allKeys.length > 0) {
                // Delete all keys
                await this.redisClient.flushAll();
                console.log(`  🗑️  Deleted all ${allKeys.length} keys from Redis`);
            } else {
                console.log('  ℹ️  Redis store is already empty');
            }

            console.log('✅ Redis store cleaned');
        } catch (error) {
            console.error('❌ Redis cleanup failed:', error.message);
            throw error;
        }
    }

    async displaySummary() {
        try {
            console.log('\n📊 Cleanup Summary:');
            console.log('==================');

            // Check database tables
            const tokenDataCount = await this.dbClient.query('SELECT COUNT(*) FROM pii_token_data');
            const searchIndexCount = await this.dbClient.query('SELECT COUNT(*) FROM pii_search_index');

            console.log(`Database:`);
            console.log(`  - pii_token_data: ${tokenDataCount.rows[0].count} records`);
            console.log(`  - pii_search_index: ${searchIndexCount.rows[0].count} records`);

            // Check Redis
            const redisKeys = await this.redisClient.keys('*');
            console.log(`Redis:`);
            console.log(`  - Total keys: ${redisKeys.length}`);

            console.log('\n🎯 System is now clean and ready for fresh data!');
        } catch (error) {
            console.error('❌ Failed to display summary:', error.message);
        }
    }

    async close() {
        try {
            if (this.dbClient) {
                await this.dbClient.end();
                console.log('📪 Database connection closed');
            }

            if (this.redisClient) {
                await this.redisClient.quit();
                console.log('📪 Redis connection closed');
            }
        } catch (error) {
            console.error('⚠️  Warning: Error closing connections:', error.message);
        }
    }

    async cleanup() {
        try {
            console.log('🧹 PII System Cleanup');
            console.log('=====================\n');

            await this.initialize();

            // Perform cleanup operations
            await this.cleanupDatabase();
            await this.cleanupRedis();

            // Show summary
            await this.displaySummary();

        } catch (error) {
            console.error('❌ Cleanup failed:', error.message);
            process.exit(1);
        } finally {
            await this.close();
        }
    }
}

// Check for command line arguments
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🧹 PII System Cleanup Tool
==========================

This tool will:
  1. Drop and recreate the pii_token_data table
  2. Drop and recreate the pii_search_index table
  3. Delete all keys from Redis store
  4. Display cleanup summary

Usage:
  npm run cleanup-all
  node src/cleanup-all.js

Options:
  --help, -h     Show this help message

⚠️  WARNING: This will permanently delete all PII data and search indexes!
        `);
        return;
    }

    // Confirm destructive operation
    console.log('⚠️  WARNING: This will permanently delete ALL data from:');
    console.log('  - pii_token_data table (with all PII records)');
    console.log('  - pii_search_index table (with all search indexes)');
    console.log('  - All Redis keys (search index cache)');
    console.log('\n🤔 Are you sure you want to continue?');
    console.log('Press Ctrl+C to cancel, or any key to continue...');

    // Simple pause - in production you might want proper prompting
    await new Promise(resolve => {
        process.stdin.once('data', resolve);
    });

    const cleanup = new DataCleanup();
    await cleanup.cleanup();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { DataCleanup };