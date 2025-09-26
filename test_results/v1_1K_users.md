
> pii_eval_v1@1.0.0 perf-test
> node src/search-performance-tester.js --comprehensive

⚡ PII Search Performance Testing Tool
=====================================

🚀 Initializing Search Performance Tester...
✅ Database connected
✅ Vault connected
✅ Field-Aware Redis Indexer connected
✅ Redis indexer connected
🎯 Search Performance Tester ready

🧪 Running Comprehensive Performance Test Suite
===============================================


📋 Test 1/7:
🔍 Testing: FIRST_NAME contains "Aar"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database):
   ⏱️  Execution Time: 2948ms
   📄 Records Scanned: 1000
   🔓 Decryption Calls: 1000
   ✅ Matching Records: 10

Approach 2 (Redis):
   ⏱️  Execution Time: 1ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 10

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 10 identical tokens

🚀 Performance Summary:
   Redis is 2948.00x faster than Database approach
   Time saved: 2947ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 2/7:
🔍 Testing: FIRST_NAME startsWith "Arjun"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database):
   ⏱️  Execution Time: 3099ms
   📄 Records Scanned: 1000
   🔓 Decryption Calls: 1000
   ✅ Matching Records: 1

Approach 2 (Redis):
   ⏱️  Execution Time: 1ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 1

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 1 identical tokens

🚀 Performance Summary:
   Redis is 3099.00x faster than Database approach
   Time saved: 3098ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 3/7:
🔍 Testing: LAST_NAME endsWith "mar"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database):
   ⏱️  Execution Time: 3165ms
   📄 Records Scanned: 1000
   🔓 Decryption Calls: 1000
   ✅ Matching Records: 5

Approach 2 (Redis):
   ⏱️  Execution Time: 2ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 5

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 5 identical tokens

🚀 Performance Summary:
   Redis is 1582.50x faster than Database approach
   Time saved: 3163ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 4/7:
🔍 Testing: EMAIL contains "gmail"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database):
   ⏱️  Execution Time: 3302ms
   📄 Records Scanned: 1000
   🔓 Decryption Calls: 1000
   ✅ Matching Records: 335

Approach 2 (Redis):
   ⏱️  Execution Time: 5ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 335

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 335 identical tokens

🚀 Performance Summary:
   Redis is 660.40x faster than Database approach
   Time saved: 3297ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 5/7:
🔍 Testing: EMAIL eq "priya.sharma@example.com"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database):
   ⏱️  Execution Time: 3341ms
   📄 Records Scanned: 1000
   🔓 Decryption Calls: 1000
   ✅ Matching Records: 0

Approach 2 (Redis):
   ⏱️  Execution Time: 4ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 0

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 0 identical tokens

🚀 Performance Summary:
   Redis is 835.25x faster than Database approach
   Time saved: 3337ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 6/7:
🔍 Testing: CITY startsWith "Mum"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database):
   ⏱️  Execution Time: 3261ms
   📄 Records Scanned: 1000
   🔓 Decryption Calls: 1000
   ✅ Matching Records: 14

Approach 2 (Redis):
   ⏱️  Execution Time: 1ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 14

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 14 identical tokens

🚀 Performance Summary:
   Redis is 3261.00x faster than Database approach
   Time saved: 3260ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 7/7:
🔍 Testing: ADDRESS contains "Road"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database):
   ⏱️  Execution Time: 3269ms
   📄 Records Scanned: 1000
   🔓 Decryption Calls: 1000
   ✅ Matching Records: 91

Approach 2 (Redis):
   ⏱️  Execution Time: 4ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 91

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 91 identical tokens

🚀 Performance Summary:
   Redis is 817.25x faster than Database approach
   Time saved: 3265ms
   ✅ Correctness: VERIFIED (same results)

============================================================

📈 Overall Performance Summary
============================

📊 Aggregate Results (7 tests):
   Database avg time: 3197.86ms
   Redis avg time: 2.57ms
   Overall speedup: 1243.61x
   Total decryptions avoided: 7000
   Total time saved: 22367ms

🔍 Result Validation Summary:
   ✅ Exact matches: 7/7 tests
   🎯 Average accuracy: 100.0%
   ✅ PERFECT: All approaches returned identical tokens

🎯 Final Result: Redis provides SIGNIFICANT performance advantage with VERIFIED correctness
🛑 Field-Aware Redis Indexer closed
🛑 Search Performance Tester closed
