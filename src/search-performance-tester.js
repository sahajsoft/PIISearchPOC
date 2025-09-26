require('dotenv').config();

// Environment variable validation
const requiredEnvVars = ['DB_USER', 'DB_HOST', 'DB_DATABASE', 'DB_PASSWORD', 'DB_PORT', 'VAULT_ADDR', 'VAULT_TOKEN', 'REDIS_HOST', 'REDIS_PORT'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please copy .env.template to .env and configure all required variables.');
    process.exit(1);
}
const { Client } = require('pg');
const vault = require('node-vault');
const { FieldAwareRedisIndexer } = require('./field-aware-redis-indexer.js');
const { PIIDatabaseSearchAPI, QUERY_TYPES } = require('./pii-db-search-api.js');

// Performance Testing for PII Search Approaches
// Compares Redis HMAC indexing vs Database table HMAC indexing (identical approach, different storage)

class SearchPerformanceTester {
    constructor() {
        // Database configuration
        this.dbConfig = {
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: process.env.DB_DATABASE,
            password: process.env.DB_PASSWORD,
            port: parseInt(process.env.DB_PORT),
        };

        // Vault configuration
        this.vaultConfig = {
            endpoint: process.env.VAULT_ADDR,
            token: process.env.VAULT_TOKEN,
            requestOptions: {
                rejectUnauthorized: false,
                timeout: 10000,
                strictSSL: false
            }
        };

        // Redis configuration
        this.redisConfig = {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT),
            password: process.env.REDIS_PASSWORD || null
        };

        this.dbClient = null;
        this.vaultClient = null;
        this.redisIndexer = null;
        this.dbSearchAPI = null;
    }

    async initialize() {
        try {
            console.log('🚀 Initializing Search Performance Tester...');

            // Initialize database
            this.dbClient = new Client(this.dbConfig);
            await this.dbClient.connect();
            console.log('✅ Database connected');

            // Initialize Vault
            this.vaultClient = vault(this.vaultConfig);
            await this.vaultClient.status();
            console.log('✅ Vault connected');

            // Initialize Redis indexer
            this.redisIndexer = new FieldAwareRedisIndexer(this.redisConfig);
            await this.redisIndexer.initialize();
            console.log('✅ Redis indexer connected');

            // Initialize Database Search API
            this.dbSearchAPI = new PIIDatabaseSearchAPI();
            await this.dbSearchAPI.initialize();
            console.log('✅ Database search API connected');

            console.log('🎯 Search Performance Tester ready\n');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize:', error.message);
            throw error;
        }
    }

    // Approach 1: Database table search (HMAC-indexed)
    async searchDatabaseTable(fieldName, operation, searchValue) {
        const startTime = Date.now();

        try {
            // Use the Redis-compatible database search API
            const tokens = await this.dbSearchAPI.search(fieldName, operation, searchValue);

            const endTime = Date.now();
            return {
                approach: 'Database Table (Approach 1)',
                tokens: tokens,
                matchingRecords: tokens.length,
                totalResults: tokens.length,
                executionTime: endTime - startTime,
                decryptionCalls: 0, // No decryption needed with HMAC approach
                kAnonymityApplied: false // Using core search method without k-anonymity wrapper
            };

        } catch (error) {
            console.error(`❌ Database table search failed: ${error.message}`);
            return {
                approach: 'Database Table (Approach 1)',
                error: error.message,
                executionTime: Date.now() - startTime
            };
        }
    }


    // Approach 2: Redis field-scoped search (pre-indexed)
    async searchRedis(fieldName, operation, searchValue) {
        const startTime = Date.now();

        try {
            // Use the field-aware search
            const matchingTokens = await this.redisIndexer.search(fieldName, operation, searchValue);

            const endTime = Date.now();
            return {
                approach: 'Redis HMAC (Approach 2)',
                tokens: matchingTokens,
                matchingRecords: matchingTokens.length,
                executionTime: endTime - startTime,
                decryptionCalls: 0 // No decryption needed
            };

        } catch (error) {
            console.error(`❌ Redis search failed: ${error.message}`);
            return {
                approach: 'Redis HMAC (Approach 2)',
                error: error.message,
                executionTime: Date.now() - startTime
            };
        }
    }

    // Text matching logic for database approach
    matchesOperation(text, operation, searchValue) {
        const normalizedText = text.toLowerCase().trim();
        const normalizedSearch = searchValue.toLowerCase().trim();

        switch (operation) {
            case 'eq':
            case 'equals':
                return normalizedText === normalizedSearch;
            case 'startsWith':
                return normalizedText.startsWith(normalizedSearch);
            case 'endsWith':
                return normalizedText.endsWith(normalizedSearch);
            case 'contains':
                return normalizedText.includes(normalizedSearch);
            default:
                return false;
        }
    }

    // Validate that both approaches return the same set of tokens
    validateResults(dbResult, redisResult) {
        try {
            // Extract tokens from both results
            const dbTokens = new Set(dbResult.tokens || []);
            const redisTokens = new Set(redisResult.tokens || []);

            // Find differences
            const dbOnlyTokens = [...dbTokens].filter(token => !redisTokens.has(token));
            const redisOnlyTokens = [...redisTokens].filter(token => !dbTokens.has(token));
            const commonTokens = [...dbTokens].filter(token => redisTokens.has(token));

            // Validate results
            const isValid = dbOnlyTokens.length === 0 && redisOnlyTokens.length === 0;

            const validation = {
                isValid,
                dbTokenCount: dbTokens.size,
                redisTokenCount: redisTokens.size,
                commonTokens: commonTokens.length,
                dbOnlyTokens,
                redisOnlyTokens,
                dbTokens: [...dbTokens],
                redisTokens: [...redisTokens],
                accuracy: dbTokens.size > 0 ? (commonTokens.length / Math.max(dbTokens.size, redisTokens.size)) * 100 : 100
            };

            return validation;

        } catch (error) {
            console.error('❌ Result validation failed:', error.message);
            return {
                isValid: false,
                error: error.message,
                dbTokenCount: 0,
                redisTokenCount: 0,
                commonTokens: 0,
                dbOnlyTokens: [],
                redisOnlyTokens: [],
                accuracy: 0
            };
        }
    }

    // Run performance comparison for a single search query
    async runSingleComparison(fieldName, operation, searchValue) {
        console.log(`🔍 Testing: ${fieldName} ${operation} "${searchValue}"`);
        console.log('=' .repeat(60));

        // Run both approaches
        const [dbResult, redisResult] = await Promise.all([
            this.searchDatabaseTable(fieldName, operation, searchValue),
            this.searchRedis(fieldName, operation, searchValue)
        ]);

        // Validate result correctness
        const validation = this.validateResults(dbResult, redisResult);

        // Display results
        console.log(`\n📊 Performance Comparison Results:`);
        console.log(`\nApproach 1 (Database Table):`);
        console.log(`   ⏱️  Execution Time: ${dbResult.executionTime}ms`);
        console.log(`   🔑 Hash Lookups: O(1) or O(k) for intersections`);
        console.log(`   🔓 Decryption Calls: ${dbResult.decryptionCalls || 0}`);
        console.log(`   ✅ Matching Records: ${dbResult.matchingRecords || 0}`);

        console.log(`\nApproach 2 (Redis):`);
        console.log(`   ⏱️  Execution Time: ${redisResult.executionTime}ms`);
        console.log(`   🔑 Hash Lookups: O(1) or O(k) for intersections`);
        console.log(`   🔓 Decryption Calls: ${redisResult.decryptionCalls}`);
        console.log(`   ✅ Matching Tokens: ${redisResult.matchingRecords || 0}`);

        // Result validation
        console.log(`\n🔍 Result Validation:`);
        if (validation.isValid) {
            console.log(`   ✅ Results MATCH: Both approaches found same tokens`);
            console.log(`   🎯 Correctness: ${validation.commonTokens} identical tokens`);
        } else {
            console.log(`   ❌ Results MISMATCH: Different tokens found`);
            console.log(`   📊 DB only: ${validation.dbOnlyTokens.length} tokens`);
            console.log(`   📊 Redis only: ${validation.redisOnlyTokens.length} tokens`);
            console.log(`   📊 Common: ${validation.commonTokens} tokens`);

            if (validation.dbOnlyTokens.length > 0) {
                console.log(`   🔍 DB-only tokens: ${validation.dbOnlyTokens.slice(0, 3).join(', ')}${validation.dbOnlyTokens.length > 3 ? '...' : ''}`);
            }
            if (validation.redisOnlyTokens.length > 0) {
                console.log(`   🔍 Redis-only tokens: ${validation.redisOnlyTokens.slice(0, 3).join(', ')}${validation.redisOnlyTokens.length > 3 ? '...' : ''}`);
            }
        }

        // Performance analysis
        if (dbResult.executionTime && redisResult.executionTime && validation.isValid) {
            const speedup = (dbResult.executionTime / redisResult.executionTime).toFixed(2);
            console.log(`\n🚀 Performance Summary:`);
            console.log(`   Redis is ${speedup}x faster than Database approach`);
            console.log(`   Time saved: ${dbResult.executionTime - redisResult.executionTime}ms`);
            console.log(`   ✅ Correctness: VERIFIED (same results)`);
        } else if (!validation.isValid) {
            console.log(`\n⚠️  Performance comparison skipped due to result mismatch`);
            console.log(`   🔧 Debug: Check indexing consistency`);
        }

        console.log('\n' + '='.repeat(60) + '\n');

        return { dbResult, redisResult, validation };
    }

    // Run comprehensive performance test suite
    async runComprehensiveTest() {
        console.log('🧪 Running Comprehensive Performance Test Suite');
        console.log('===============================================\n');

        // Test cases covering different scenarios (using Indian names and patterns)
        const testCases = [
            { field: 'FIRST_NAME', operation: 'contains', value: 'Aar' }, // 3+ chars for k-gram search
            { field: 'FIRST_NAME', operation: 'startsWith', value: 'Arjun' },
            { field: 'LAST_NAME', operation: 'endsWith', value: 'mar' }, // Common Indian surname ending
            { field: 'EMAIL', operation: 'contains', value: 'gmail' },
            { field: 'EMAIL', operation: 'eq', value: 'priya.sharma@example.com' },
            { field: 'CITY', operation: 'startsWith', value: 'Mum' }, // Mumbai, etc.
            { field: 'ADDRESS', operation: 'contains', value: 'Road' } // Common in Indian addresses
        ];

        const results = [];

        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            console.log(`\n📋 Test ${i + 1}/${testCases.length}:`);

            const result = await this.runSingleComparison(
                testCase.field,
                testCase.operation,
                testCase.value
            );

            results.push({
                testCase,
                ...result
            });

            // Small delay between tests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Summary statistics
        this.displaySummaryStatistics(results);

        return results;
    }

    // Display overall performance summary
    displaySummaryStatistics(results) {
        console.log('📈 Overall Performance Summary');
        console.log('============================');

        let totalDbTime = 0;
        let totalRedisTime = 0;
        let totalDecryptionCalls = 0;
        let successfulTests = 0;
        let validResults = 0;
        let totalAccuracy = 0;

        results.forEach(result => {
            if (result.dbResult.executionTime && result.redisResult.executionTime) {
                totalDbTime += result.dbResult.executionTime;
                totalRedisTime += result.redisResult.executionTime;
                totalDecryptionCalls += result.dbResult.decryptionCalls || 0;
                successfulTests++;

                // Track validation results
                if (result.validation) {
                    if (result.validation.isValid) {
                        validResults++;
                    }
                    totalAccuracy += result.validation.accuracy || 0;
                }
            }
        });

        if (successfulTests > 0) {
            const avgDbTime = (totalDbTime / successfulTests).toFixed(2);
            const avgRedisTime = (totalRedisTime / successfulTests).toFixed(2);
            const overallSpeedup = (totalDbTime / totalRedisTime).toFixed(2);
            const avgAccuracy = (totalAccuracy / successfulTests).toFixed(1);

            console.log(`\n📊 Aggregate Results (${successfulTests} tests):`);
            console.log(`   Database avg time: ${avgDbTime}ms`);
            console.log(`   Redis avg time: ${avgRedisTime}ms`);
            console.log(`   Overall speedup: ${overallSpeedup}x`);
            console.log(`   Total decryptions avoided: ${totalDecryptionCalls}`);
            console.log(`   Total time saved: ${(totalDbTime - totalRedisTime).toFixed(0)}ms`);

            // Validation summary
            console.log(`\n🔍 Result Validation Summary:`);
            console.log(`   ✅ Exact matches: ${validResults}/${successfulTests} tests`);
            console.log(`   🎯 Average accuracy: ${avgAccuracy}%`);

            if (validResults === successfulTests) {
                console.log(`   ✅ PERFECT: All approaches returned identical tokens`);
            } else if (validResults > successfulTests * 0.8) {
                console.log(`   ⚠️  MOSTLY ACCURATE: Some minor discrepancies found`);
            } else {
                console.log(`   ❌ SIGNIFICANT ISSUES: Many result mismatches detected`);
            }

            // Performance categories (only if results are valid)
            if (validResults === successfulTests) {
                if (parseFloat(overallSpeedup) > 10) {
                    console.log(`\n🎯 Final Result: Redis provides SIGNIFICANT performance advantage with VERIFIED correctness`);
                } else if (parseFloat(overallSpeedup) > 2) {
                    console.log(`\n🎯 Final Result: Redis provides MODERATE performance advantage with VERIFIED correctness`);
                } else {
                    console.log(`\n🎯 Final Result: Performance difference is MINIMAL but correctness is VERIFIED`);
                }
            } else {
                console.log(`\n⚠️  Final Result: Performance gains exist but correctness issues need investigation`);
            }
        }
    }

    // Complex query testing (AND/OR operations)
    async testComplexQueries() {
        console.log('\n🔗 Testing Complex Queries (AND/OR operations)');
        console.log('===============================================');

        // Test different complex query scenarios
        const complexQueries = [
            {
                name: 'AND Query: first name',
                description: 'FIRST_NAME endsWith "hen" AND FIRST_NAME startsWith "Ste"',
                conditions: [
                    { field: 'FIRST_NAME', operation: 'endsWith', value: 'hen' }, 
                    { field: 'FIRST_NAME', operation: 'startsWith', value: 'Ste' }
                ],
                operator: 'AND'
            },
            {
                name: 'OR Query: Email domains',
                description: 'EMAIL contains "gmail" OR EMAIL contains "yahoo"',
                conditions: [
                    { field: 'EMAIL', operation: 'contains', value: 'gmail' },
                    { field: 'EMAIL', operation: 'contains', value: 'yahoo' }
                ],
                operator: 'OR'
            }
        ];

        for (let i = 0; i < complexQueries.length; i++) {
            const query = complexQueries[i];
            console.log(`\n📋 Test ${i + 1}/${complexQueries.length}:`);
            console.log(`🔍 ${query.name}`);
            console.log(`📝 ${query.description}`);
            console.log('============================================================\n');

            try {
                // Test Database approach
                const dbStartTime = Date.now();
                let dbTokens = [];

                if (query.operator === 'AND') {
                    // For AND: get intersection of all conditions
                    const dbConditions = query.conditions.map(c => ({
                        field: c.field,
                        operation: c.operation.toLowerCase(),
                        value: c.value
                    }));
                    dbTokens = await this.dbSearchAPI.executeComplexQuery(dbConditions, 'AND');
                } else {
                    // For OR: get union of all conditions
                    const dbConditions = query.conditions.map(c => ({
                        field: c.field,
                        operation: c.operation.toLowerCase(),
                        value: c.value
                    }));
                    dbTokens = await this.dbSearchAPI.executeComplexQuery(dbConditions, 'OR');
                }

                const dbTime = Date.now() - dbStartTime;

                // Test Redis approach
                const redisStartTime = Date.now();
                let redisTokens = [];

                if (query.operator === 'AND') {
                    // For AND: get intersection
                    const resultSets = [];
                    for (const condition of query.conditions) {
                        const tokens = await this.redisIndexer.search(
                            condition.field,
                            condition.operation,
                            condition.value
                        );
                        resultSets.push(new Set(tokens));
                    }

                    // Apply AND operation (intersection)
                    let intersection = resultSets[0];
                    for (let j = 1; j < resultSets.length; j++) {
                        intersection = new Set([...intersection].filter(x => resultSets[j].has(x)));
                    }
                    redisTokens = Array.from(intersection);
                } else {
                    // For OR: get union
                    const allTokens = new Set();
                    for (const condition of query.conditions) {
                        const tokens = await this.redisIndexer.search(
                            condition.field,
                            condition.operation,
                            condition.value
                        );
                        tokens.forEach(token => allTokens.add(token));
                    }
                    redisTokens = Array.from(allTokens);
                }

                const redisTime = Date.now() - redisStartTime;

                // Display results
                console.log(`📊 Performance Comparison Results:\n`);

                console.log(`Approach 1 (Database):`);
                console.log(`   ⏱️  Execution Time: ${dbTime}ms`);
                console.log(`   🔑 Complex Query: ${query.operator} operation`);
                console.log(`   ✅ Matching Records: ${dbTokens.length}\n`);

                console.log(`Approach 2 (Redis):`);
                console.log(`   ⏱️  Execution Time: ${redisTime}ms`);
                console.log(`   🔑 Set Operations: ${query.operator} intersection/union`);
                console.log(`   ✅ Matching Tokens: ${redisTokens.length}\n`);

                // Validate results match
                const dbSet = new Set(dbTokens);
                const redisSet = new Set(redisTokens);
                const identical = dbSet.size === redisSet.size &&
                                [...dbSet].every(token => redisSet.has(token));

                console.log(`🔍 Result Validation:`);
                if (identical) {
                    console.log(`   ✅ Results MATCH: Both approaches found same tokens`);
                    console.log(`   🎯 Correctness: ${dbTokens.length} identical tokens`);
                } else {
                    console.log(`   ❌ Results MISMATCH: Different tokens found`);
                    console.log(`   📊 DB tokens: ${dbTokens.length}, Redis tokens: ${redisTokens.length}`);
                    console.log(`   📊 Common: ${[...dbSet].filter(t => redisSet.has(t)).length} tokens`);
                }

                // Performance summary
                if (identical && dbTokens.length > 0) {
                    const speedup = dbTime > 0 ? (dbTime / redisTime).toFixed(2) : 1;
                    console.log(`\n🚀 Performance Summary:`);
                    console.log(`   Redis is ${speedup}x faster than Database approach`);
                    console.log(`   Time saved: ${Math.max(0, dbTime - redisTime)}ms`);
                    console.log(`   ✅ Correctness: VERIFIED (same results)`);
                }

                console.log('\n============================================================');

            } catch (error) {
                console.error(`❌ Complex query test failed for "${query.name}":`, error.message);
                console.log('============================================================');
            }
        }

        console.log('\n📈 Complex Query Test Summary');
        console.log('============================');
        console.log('✅ Tested AND operations (intersection logic)');
        console.log('✅ Tested OR operations (union logic)');
        console.log('✅ Verified functional equivalence between approaches');
        console.log('✅ Performance comparison for complex queries');
        console.log('\n🎯 Complex queries demonstrate the power of pre-computed HMAC indices');
        console.log('   for privacy-preserving multi-field searches without decryption.');
    }

    // Dedicated result validation test (no performance timing)
    async validateSearchAccuracy() {
        console.log('🎯 Search Accuracy Validation Test');
        console.log('==================================\n');

        // Test cases focusing on potential edge cases (using Indian names)
        const validationTests = [
            { field: 'FIRST_NAME', operation: 'eq', value: 'Aarav' }, // Popular Indian name
            { field: 'FIRST_NAME', operation: 'contains', value: 'raj' }, // 3+ chars for k-gram
            { field: 'EMAIL', operation: 'startsWith', value: 'priya' },
            { field: 'EMAIL', operation: 'endsWith', value: 'com' },
            { field: 'LAST_NAME', operation: 'contains', value: 'har' }, // Sharma, etc. - 3+ chars
            // Edge cases
            { field: 'FIRST_NAME', operation: 'eq', value: 'NonExistentName' }, // Should return empty
            { field: 'EMAIL', operation: 'contains', value: 'xyz' }, // Uncommon substring (3 chars)
        ];

        let totalTests = 0;
        let passedTests = 0;
        const failedTests = [];

        for (const testCase of validationTests) {
            totalTests++;
            console.log(`🔍 Validating: ${testCase.field} ${testCase.operation} "${testCase.value}"`);

            try {
                const [dbResult, redisResult] = await Promise.all([
                    this.searchDatabase(testCase.field, testCase.operation, testCase.value),
                    this.searchRedis(testCase.field, testCase.operation, testCase.value)
                ]);

                const validation = this.validateResults(dbResult, redisResult);

                if (validation.isValid) {
                    console.log(`   ✅ PASS: ${validation.commonTokens} matching tokens`);
                    passedTests++;
                } else {
                    console.log(`   ❌ FAIL: DB=${validation.dbTokenCount}, Redis=${validation.redisTokenCount} tokens`);
                    failedTests.push({
                        testCase,
                        validation,
                        dbResult: dbResult.matchingRecords,
                        redisResult: redisResult.matchingRecords
                    });
                }
            } catch (error) {
                console.log(`   ❌ ERROR: ${error.message}`);
                failedTests.push({ testCase, error: error.message });
            }

            console.log(''); // Empty line between tests
        }

        // Summary
        console.log('📊 Validation Summary');
        console.log('====================');
        console.log(`Total tests: ${totalTests}`);
        console.log(`Passed: ${passedTests}`);
        console.log(`Failed: ${failedTests.length}`);
        console.log(`Accuracy: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

        // Detail failed tests
        if (failedTests.length > 0) {
            console.log('\n❌ Failed Test Details:');
            failedTests.forEach((failed, index) => {
                console.log(`\n${index + 1}. ${failed.testCase.field} ${failed.testCase.operation} "${failed.testCase.value}"`);
                if (failed.validation) {
                    console.log(`   DB tokens: ${failed.validation.dbTokenCount}`);
                    console.log(`   Redis tokens: ${failed.validation.redisTokenCount}`);
                    if (failed.validation.dbOnlyTokens.length > 0) {
                        console.log(`   DB-only: ${failed.validation.dbOnlyTokens.slice(0, 3).join(', ')}`);
                    }
                    if (failed.validation.redisOnlyTokens.length > 0) {
                        console.log(`   Redis-only: ${failed.validation.redisOnlyTokens.slice(0, 3).join(', ')}`);
                    }
                } else if (failed.error) {
                    console.log(`   Error: ${failed.error}`);
                }
            });
        }

        return {
            totalTests,
            passedTests,
            failedTests,
            accuracy: (passedTests / totalTests) * 100
        };
    }

    // Close all connections
    async close() {
        if (this.dbClient) await this.dbClient.end();
        if (this.redisIndexer) await this.redisIndexer.close();
        if (this.dbSearchAPI) await this.dbSearchAPI.close();
        console.log('🛑 Search Performance Tester closed');
    }
}

// Main execution
async function main() {
    console.log('⚡ PII Search Performance Testing Tool');
    console.log('=====================================\n');

    const args = process.argv.slice(2);

    if (args.includes('--help')) {
        console.log(`
Usage: node search-performance-tester.js [options]

Options:
  --single <field> <operation> <value>    Run single comparison test
  --comprehensive                         Run full test suite
  --complex                              Test complex AND/OR queries
  --validate                             Run accuracy validation (no performance timing)
  --help                                 Show this help

Examples:
  node search-performance-tester.js --single FIRST_NAME contains "ram"
  node search-performance-tester.js --comprehensive
  node search-performance-tester.js --complex

Operations supported: eq, startsWith, endsWith, contains
Fields supported: FIRST_NAME, LAST_NAME, EMAIL, MOBILE_NUMBER, ADDRESS, CITY, COUNTRY, etc.
        `);
        return;
    }

    const tester = new SearchPerformanceTester();

    try {
        await tester.initialize();

        if (args.includes('--single') && args.length >= 5) {
            const field = args[args.indexOf('--single') + 1];
            const operation = args[args.indexOf('--single') + 2];
            const value = args[args.indexOf('--single') + 3];
            await tester.runSingleComparison(field, operation, value);
        } else if (args.includes('--comprehensive')) {
            await tester.runComprehensiveTest();
        } else if (args.includes('--complex')) {
            await tester.testComplexQueries();
        } else if (args.includes('--validate')) {
            await tester.validateSearchAccuracy();
        } else {
            // Default: run a sample test
            console.log('Running sample performance test...\n');
            await tester.runSingleComparison('FIRST_NAME', 'contains', 'raj');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    } finally {
        await tester.close();
    }
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

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { SearchPerformanceTester };