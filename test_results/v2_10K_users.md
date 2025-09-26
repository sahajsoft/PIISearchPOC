
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
   ⏱️  Execution Time: 4ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Records: 144

Approach 2 (Redis):
   ⏱️  Execution Time: 1ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 144

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 144 identical tokens

🚀 Performance Summary:
   Redis is 4.00x faster than Database approach
   Time saved: 3ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 2/7:
🔍 Testing: FIRST_NAME startsWith "Arjun"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database Table):
   ⏱️  Execution Time: 3ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Records: 27

Approach 2 (Redis):
   ⏱️  Execution Time: 1ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 27

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 27 identical tokens

🚀 Performance Summary:
   Redis is 3.00x faster than Database approach
   Time saved: 2ms
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
   ✅ Matching Records: 53

Approach 2 (Redis):
   ⏱️  Execution Time: 2ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 53

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 53 identical tokens

🚀 Performance Summary:
   Redis is 1.50x faster than Database approach
   Time saved: 1ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 4/7:
🔍 Testing: EMAIL contains "gmail"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database Table):
   ⏱️  Execution Time: 33ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Records: 3314

Approach 2 (Redis):
   ⏱️  Execution Time: 17ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 3314

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 3314 identical tokens

🚀 Performance Summary:
   Redis is 1.94x faster than Database approach
   Time saved: 16ms
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
   ⏱️  Execution Time: 1ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 0

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 0 identical tokens

🚀 Performance Summary:
   Redis is 2.00x faster than Database approach
   Time saved: 1ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 6/7:
🔍 Testing: CITY startsWith "Mum"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database Table):
   ⏱️  Execution Time: 2ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Records: 197

Approach 2 (Redis):
   ⏱️  Execution Time: 0ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 197

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 197 identical tokens

============================================================


📋 Test 7/7:
🔍 Testing: ADDRESS contains "Road"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database Table):
   ⏱️  Execution Time: 8ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Records: 783

Approach 2 (Redis):
   ⏱️  Execution Time: 2ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 783

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 783 identical tokens

🚀 Performance Summary:
   Redis is 4.00x faster than Database approach
   Time saved: 6ms
   ✅ Correctness: VERIFIED (same results)

============================================================

📈 Overall Performance Summary
============================

📊 Aggregate Results (6 tests):
   Database avg time: 8.83ms
   Redis avg time: 4.00ms
   Overall speedup: 2.21x
   Total decryptions avoided: 0
   Total time saved: 29ms

🔍 Result Validation Summary:
   ✅ Exact matches: 6/6 tests
   🎯 Average accuracy: 100.0%
   ✅ PERFECT: All approaches returned identical tokens

🎯 Final Result: Redis provides MODERATE performance advantage with VERIFIED correctness
🛑 Field-Aware Redis Indexer closed
🛑 PII Database Search API closed
🛑 Search Performance Tester closed
