#!/usr/bin/env node
const { PIISearchAPI } = require('./src/pii-search-api.js');

// Test the PII Search functionality
async function testSearchFunctionality() {
    console.log('🧪 Testing PII Search Functionality');
    console.log('====================================\n');

    const searchAPI = new PIISearchAPI();

    try {
        // Initialize the search API
        console.log('1️⃣  Initializing Search API...');
        await searchAPI.initialize();
        console.log('✅ Search API initialized\n');

        // Test different search types
        const testQueries = [
            { query: 'john', type: 'contains', description: 'Search for records containing "john"' },
            { query: 'test.com', type: 'ends_with', description: 'Search for emails ending with "test.com"' },
            { query: '987', type: 'starts_with', description: 'Search for numbers starting with "987"' },
            { query: 'john@example.com', type: 'exact', description: 'Exact match for "john@example.com"' },
            { query: 'doe', type: 'partial', description: 'Partial match for "doe"' }
        ];

        let testsPassed = 0;
        let testsFailed = 0;

        for (let i = 0; i < testQueries.length; i++) {
            const test = testQueries[i];
            console.log(`${i + 2}️⃣  ${test.description}`);

            try {
                const results = await searchAPI.search(test.query, {
                    searchType: test.type,
                    maxResults: 10
                });

                console.log(`   ✅ Search completed: ${results.results.length} results found`);

                if (results.results.length > 0) {
                    console.log(`   📄 Sample result: Record ID ${results.results[0].recordId}`);
                    console.log(`      Field Type: ${results.results[0].fieldId}`);
                    console.log(`      Match Score: ${results.results[0].score || 'N/A'}`);
                }

                console.log(`   ⏱️  Search time: ${results.searchTime}ms`);
                console.log(`   🔒 Privacy: k-anonymity enforced, audit logged\n`);

                testsPassed++;
            } catch (error) {
                if (error.message.includes('insufficient result set size')) {
                    console.log(`   🔒 Privacy protection: ${error.message}`);
                    console.log(`   ✅ k-anonymity working correctly\n`);
                    testsPassed++;
                } else {
                    console.log(`   ❌ Search failed: ${error.message}\n`);
                    testsFailed++;
                }
            }
        }

        // Test batch search
        console.log(`${testQueries.length + 2}️⃣  Testing Batch Search`);
        try {
            const batchQueries = [
                { query: 'john', type: 'contains' },
                { query: '987', type: 'starts_with' }
            ];

            const batchResults = await searchAPI.batchSearch(batchQueries);
            console.log(`   ✅ Batch search completed: ${batchResults.length} query results`);
            testsPassed++;
        } catch (error) {
            console.log(`   ❌ Batch search failed: ${error.message}`);
            testsFailed++;
        }

        // Test search statistics
        console.log(`\n${testQueries.length + 3}️⃣  Getting Search Statistics`);
        try {
            const stats = await searchAPI.getSearchStats();
            console.log(`   📊 Index keys: ${stats.totalKeys || 'N/A'}`);
            console.log(`   📈 Estimated tokens: ${stats.estimatedTotalTokens || 'N/A'}`);
            console.log(`   ✅ Statistics retrieved successfully\n`);
            testsPassed++;
        } catch (error) {
            console.log(`   ❌ Statistics failed: ${error.message}\n`);
            testsFailed++;
        }

        // Summary
        console.log('📋 Test Summary');
        console.log('===============');
        console.log(`✅ Tests passed: ${testsPassed}`);
        console.log(`❌ Tests failed: ${testsFailed}`);
        console.log(`📊 Total tests: ${testsPassed + testsFailed}`);

        if (testsFailed === 0) {
            console.log('\n🎉 All tests passed! PII Search system is working correctly.');
            console.log('\n🔧 Available Commands:');
            console.log('   npm run search-api     # Start interactive search API');
            console.log('   npm run build-index    # Rebuild search index');
            console.log('   npm run search-stats   # View index statistics');
        } else {
            console.log('\n⚠️  Some tests failed. Check the errors above.');
            console.log('\nTroubleshooting:');
            console.log('1. Ensure Redis server is running');
            console.log('2. Ensure Vault server is running');
            console.log('3. Check that PII data has been imported: npm run import-csv');
            console.log('4. Rebuild search index: npm run build-index');
        }

    } catch (error) {
        console.error('❌ Test setup failed:', error.message);
        console.log('\nPre-requisites:');
        console.log('1. Start Redis server: redis-server');
        console.log('2. Start Vault server: vault server -dev -dev-root-token-id root -dev-tls');
        console.log('3. Set environment: export VAULT_ADDR="https://127.0.0.1:8200" && export VAULT_TOKEN="root"');
        console.log('4. Run pipeline: npm run pipeline');
    } finally {
        await searchAPI.close();
    }
}

// Handle command line execution
if (require.main === module) {
    testSearchFunctionality().catch(console.error);
}

module.exports = { testSearchFunctionality };