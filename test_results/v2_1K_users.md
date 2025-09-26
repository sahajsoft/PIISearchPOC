
> pii_eval_v1@1.0.0 perf-test
> node src/search-performance-tester.js --comprehensive

⚡ PII Search Performance Testing Tool
=====================================

🚀 Initializing Search Performance Tester...
✅ Database connected
✅ Vault connected
✅ Field-Aware Redis Indexer connected
✅ Redis indexer connected
🔍 Initializing PII Database Search API...
✅ Database connected
✅ Using Redis-compatible HMAC secret
🚀 PII Database Search API ready
✅ Database search API connected
🎯 Search Performance Tester ready

🧪 Running Comprehensive Performance Test Suite
===============================================


📋 Test 1/7:
🔍 Testing: FIRST_NAME contains "Aar"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database Table):
   ⏱️  Execution Time: 6ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Records: 15

Approach 2 (Redis):
   ⏱️  Execution Time: 1ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 15

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 15 identical tokens

🚀 Performance Summary:
   Redis is 6.00x faster than Database approach
   Time saved: 5ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 2/7:
🔍 Testing: FIRST_NAME startsWith "Arjun"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database Table):
   ⏱️  Execution Time: 2ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Records: 4

Approach 2 (Redis):
   ⏱️  Execution Time: 2ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 4

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 4 identical tokens

🚀 Performance Summary:
   Redis is 1.00x faster than Database approach
   Time saved: 0ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 3/7:
🔍 Testing: LAST_NAME endsWith "mar"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database Table):
   ⏱️  Execution Time: 3ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Records: 2

Approach 2 (Redis):
   ⏱️  Execution Time: 1ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 2

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 2 identical tokens

🚀 Performance Summary:
   Redis is 3.00x faster than Database approach
   Time saved: 2ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 4/7:
🔍 Testing: EMAIL contains "gmail"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database Table):
   ⏱️  Execution Time: 14ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Records: 327

Approach 2 (Redis):
   ⏱️  Execution Time: 3ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 327

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 327 identical tokens

🚀 Performance Summary:
   Redis is 4.67x faster than Database approach
   Time saved: 11ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 5/7:
🔍 Testing: EMAIL eq "priya.sharma@example.com"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database Table):
   ⏱️  Execution Time: 2ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Records: 0

Approach 2 (Redis):
   ⏱️  Execution Time: 2ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 0

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 0 identical tokens

🚀 Performance Summary:
   Redis is 1.00x faster than Database approach
   Time saved: 0ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 6/7:
🔍 Testing: CITY startsWith "Mum"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database Table):
   ⏱️  Execution Time: 1ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Records: 19

Approach 2 (Redis):
   ⏱️  Execution Time: 1ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 19

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 19 identical tokens

🚀 Performance Summary:
   Redis is 1.00x faster than Database approach
   Time saved: 0ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 7/7:
🔍 Testing: ADDRESS contains "Road"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database Table):
   ⏱️  Execution Time: 4ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Records: 86

Approach 2 (Redis):
   ⏱️  Execution Time: 1ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 86

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 86 identical tokens

🚀 Performance Summary:
   Redis is 4.00x faster than Database approach
   Time saved: 3ms
   ✅ Correctness: VERIFIED (same results)

============================================================

📈 Overall Performance Summary
============================

📊 Aggregate Results (7 tests):
   Database avg time: 4.57ms
   Redis avg time: 1.57ms
   Overall speedup: 2.91x
   Total decryptions avoided: 0
   Total time saved: 21ms

🔍 Result Validation Summary:
   ✅ Exact matches: 7/7 tests
   🎯 Average accuracy: 100.0%
   ✅ PERFECT: All approaches returned identical tokens

🎯 Final Result: Redis provides MODERATE performance advantage with VERIFIED correctness
🛑 Field-Aware Redis Indexer closed
🛑 PII Database Search API closed
🛑 Search Performance Tester closed
