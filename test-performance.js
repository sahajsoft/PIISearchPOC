#!/usr/bin/env node

// Quick Performance Testing Script
// Usage: node test-performance.js

const { SearchPerformanceTester } = require('./src/search-performance-tester.js');

async function quickPerformanceTest() {
    console.log('🚀 Quick Performance Test');
    console.log('========================\n');

    const tester = new SearchPerformanceTester();

    try {
        await tester.initialize();

        // Quick test scenarios (updated for Indian names and k-gram minimum)
        const quickTests = [
            { field: 'FIRST_NAME', operation: 'contains', value: 'raj', description: 'Common substring search (3+ chars)' },
            { field: 'EMAIL', operation: 'contains', value: 'gmail', description: 'Email domain search' },
            { field: 'FIRST_NAME', operation: 'startsWith', value: 'Aarav', description: 'Prefix search with Indian name' }
        ];

        console.log(`Running ${quickTests.length} quick performance tests...\n`);

        const results = [];
        for (let i = 0; i < quickTests.length; i++) {
            const test = quickTests[i];
            console.log(`🔍 Test ${i + 1}: ${test.description}`);

            const result = await tester.runSingleComparison(test.field, test.operation, test.value);
            results.push(result);

            // Brief pause between tests
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Quick summary
        let totalSpeedup = 0;
        let validTests = 0;

        results.forEach(result => {
            if (result.dbResult.executionTime && result.redisResult.executionTime) {
                totalSpeedup += result.dbResult.executionTime / result.redisResult.executionTime;
                validTests++;
            }
        });

        if (validTests > 0) {
            const avgSpeedup = (totalSpeedup / validTests).toFixed(2);
            console.log(`\n🎯 Quick Test Summary:`);
            console.log(`   Average speedup: ${avgSpeedup}x faster with Redis`);
            console.log(`   Tests completed: ${validTests}/${quickTests.length}`);
        }

        console.log(`\n💡 Next Steps:`);
        console.log(`   • Run comprehensive test: npm run perf-test`);
        console.log(`   • Test specific query: npm run perf-test-single FIRST_NAME contains "ram"`);
        console.log(`   • Test complex queries: npm run perf-test-complex`);

    } catch (error) {
        console.error('❌ Quick test failed:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('   • Ensure Redis server is running: redis-server');
        console.log('   • Ensure Vault server is running with dev mode');
        console.log('   • Ensure database is accessible and populated');
        console.log('   • Run the pipeline first: npm run pipeline');
    } finally {
        await tester.close();
    }
}

// Run quick test
if (require.main === module) {
    quickPerformanceTest().catch(console.error);
}