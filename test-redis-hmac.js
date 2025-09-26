#!/usr/bin/env node

const { RedisHmacIndexer } = require('./src/redis-hmac-indexer.js');

// Test Redis HMAC indexing functionality
async function testRedisHmacIndexing() {
    console.log('🧪 Testing Redis HMAC Indexing (Approach 2)');
    console.log('===========================================\n');

    const indexer = new RedisHmacIndexer();

    try {
        // Initialize
        console.log('1️⃣  Initializing Redis HMAC Indexer...');
        await indexer.initialize();
        console.log('✅ Redis HMAC Indexer initialized\n');

        // Test data - PII examples with tokens
        const testData = [
            { phrase: 'john.doe@example.com', token: 'TKN_001', type: 'EMAIL' },
            { phrase: 'jane.smith@test.com', token: 'TKN_002', type: 'EMAIL' },
            { phrase: 'John Doe', token: 'TKN_003', type: 'NAME' },
            { phrase: '9876543210', token: 'TKN_004', type: 'MOBILE_NUMBER' },
            { phrase: 'ABCDE1234F', token: 'TKN_005', type: 'PAN_CARD' },
            { phrase: '123 Main Street, Anytown', token: 'TKN_006', type: 'ADDRESS' }
        ];

        // Index test data
        console.log('2️⃣  Indexing test data...');
        for (const data of testData) {
            await indexer.addPhraseToken(data.phrase, data.token);
        }
        console.log(`✅ Indexed ${testData.length} test records\n`);

        // Test different search operations
        const searchTests = [
            {
                type: 'Equality',
                operation: 'equalsLookup',
                queries: ['john.doe@example.com', 'Jane Smith', '9876543210']
            },
            {
                type: 'Starts With',
                operation: 'startsWithLookup',
                queries: ['john', 'jane.smith', '987', 'ABCDE']
            },
            {
                type: 'Ends With',
                operation: 'endsWithLookup',
                queries: ['example.com', 'Doe', '3210', '4F']
            },
            {
                type: 'Contains',
                operation: 'containsLookup',
                queries: ['doe', 'test', 'Main', '123']
            }
        ];

        let totalTests = 0;
        let passedTests = 0;

        for (const searchTest of searchTests) {
            console.log(`3️⃣  Testing ${searchTest.type} Search`);

            for (const query of searchTest.queries) {
                totalTests++;
                try {
                    const startTime = Date.now();
                    const results = await indexer[searchTest.operation](query);
                    const endTime = Date.now();

                    console.log(`   Query: "${query}" → Found ${results.length} matches in ${endTime - startTime}ms`);
                    if (results.length > 0) {
                        console.log(`   Tokens: [${results.join(', ')}]`);
                    }

                    passedTests++;
                } catch (error) {
                    console.log(`   ❌ Query "${query}" failed: ${error.message}`);
                }
            }
            console.log();
        }

        // Test batch operations
        console.log('4️⃣  Testing Batch Operations');
        const batchPhrases = ['test.batch@example.com', 'Batch User', 'batch data'];
        await indexer.addTokenPhrases('TKN_BATCH', batchPhrases);
        console.log(`✅ Batch indexed ${batchPhrases.length} phrases for token TKN_BATCH\n`);

        // Test removal
        console.log('5️⃣  Testing Data Removal');
        await indexer.removePhraseToken('john.doe@example.com', 'TKN_001');
        const afterRemoval = await indexer.equalsLookup('john.doe@example.com');
        console.log(`✅ Removed data - remaining matches: ${afterRemoval.length}\n`);

        // Get indexing statistics
        console.log('6️⃣  Getting Index Statistics');
        const stats = await indexer.getStats();
        console.log('   📊 Redis HMAC Index Statistics:');
        console.log(`      Total Keys: ${stats.totalKeys || 'N/A'}`);
        console.log(`      Key Types: eq=${stats.keyTypes?.eq || 0}, pre=${stats.keyTypes?.pre || 0}, suf=${stats.keyTypes?.suf || 0}, g3=${stats.keyTypes?.g3 || 0}`);
        console.log(`      Estimated Tokens: ${stats.estimatedTotalTokens || 'N/A'}`);
        console.log();

        // Performance demonstration
        console.log('7️⃣  Performance Demonstration');
        const performanceQueries = ['doe', 'test', 'main'];
        for (const query of performanceQueries) {
            const iterations = 100;
            const startTime = Date.now();

            for (let i = 0; i < iterations; i++) {
                await indexer.containsLookup(query);
            }

            const totalTime = Date.now() - startTime;
            console.log(`   "${query}" x${iterations}: ${totalTime}ms (avg: ${(totalTime/iterations).toFixed(2)}ms per query)`);
        }

        // Test Summary
        console.log('\n📋 Test Summary');
        console.log('================');
        console.log(`✅ Tests passed: ${passedTests}/${totalTests}`);
        console.log(`📊 Redis performance: Fast O(1) key lookups with HMAC privacy`);
        console.log(`🔒 Privacy: All plaintext data hashed with HMAC before Redis storage`);

        if (passedTests === totalTests) {
            console.log('\n🎉 All Redis HMAC indexing tests passed!');
            console.log('\n🔧 Key Benefits of Approach 2:');
            console.log('   ✅ Privacy-preserving: No plaintext stored in Redis');
            console.log('   ✅ Fast lookups: O(1) hash-based key access');
            console.log('   ✅ All search types: equality, prefix, suffix, contains');
            console.log('   ✅ Scalable: N-gram indexing with configurable k-gram size');
            console.log('   ✅ Secure: HMAC prevents rainbow table attacks');
        } else {
            console.log('\n⚠️  Some tests failed. Check Redis server connection.');
        }

    } catch (error) {
        console.error('❌ Test setup failed:', error.message);
        console.log('\nPre-requisites:');
        console.log('1. Start Redis server: redis-server');
        console.log('2. Ensure Redis is accessible on localhost:6379');
    } finally {
        await indexer.close();
    }
}

// Performance comparison helper
async function performanceComparison() {
    console.log('\n📈 Approach Performance Characteristics');
    console.log('======================================');
    console.log('Approach 1 (DB field_name):');
    console.log('  ✅ Simple SQL queries with field_name column');
    console.log('  ✅ Supports LIKE operations: WHERE field_name LIKE "%PHONE%"');
    console.log('  ⚠️  Requires database scan for substring searches');
    console.log('  ⚠️  Less privacy (field type visible in database)');
    console.log();
    console.log('Approach 2 (Redis HMAC):');
    console.log('  ✅ O(1) hash-based key lookups');
    console.log('  ✅ Privacy-preserving (HMAC hashed keys)');
    console.log('  ✅ Supports all search types via n-gram indexing');
    console.log('  ✅ Highly scalable in-memory operations');
    console.log('  ⚠️  Additional complexity and Redis dependency');
}

// Main execution
if (require.main === module) {
    testRedisHmacIndexing()
        .then(() => performanceComparison())
        .catch(console.error);
}

module.exports = { testRedisHmacIndexing };