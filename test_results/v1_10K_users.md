
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
   ⏱️  Execution Time: 28587ms
   📄 Records Scanned: 10000
   🔓 Decryption Calls: 10000
   ✅ Matching Records: 127

Approach 2 (Redis):
   ⏱️  Execution Time: 1ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 127

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 127 identical tokens

🚀 Performance Summary:
   Redis is 28587.00x faster than Database approach
   Time saved: 28586ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 2/7:
🔍 Testing: FIRST_NAME startsWith "Arjun"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database):
   ⏱️  Execution Time: 28082ms
   📄 Records Scanned: 10000
   🔓 Decryption Calls: 10000
   ✅ Matching Records: 30

Approach 2 (Redis):
   ⏱️  Execution Time: 8ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 30

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 30 identical tokens

🚀 Performance Summary:
   Redis is 3510.25x faster than Database approach
   Time saved: 28074ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 3/7:
🔍 Testing: LAST_NAME endsWith "mar"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database):
   ⏱️  Execution Time: 27329ms
   📄 Records Scanned: 10000
   🔓 Decryption Calls: 10000
   ✅ Matching Records: 56

Approach 2 (Redis):
   ⏱️  Execution Time: 1ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 56

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 56 identical tokens

🚀 Performance Summary:
   Redis is 27329.00x faster than Database approach
   Time saved: 27328ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 4/7:
🔍 Testing: EMAIL contains "gmail"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database):
   ⏱️  Execution Time: 25779ms
   📄 Records Scanned: 10000
   🔓 Decryption Calls: 10000
   ✅ Matching Records: 3360

Approach 2 (Redis):
   ⏱️  Execution Time: 11ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 3360

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 3360 identical tokens

🚀 Performance Summary:
   Redis is 2343.55x faster than Database approach
   Time saved: 25768ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 5/7:
🔍 Testing: EMAIL eq "priya.sharma@example.com"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database):
   ⏱️  Execution Time: 18430ms
   📄 Records Scanned: 10000
   🔓 Decryption Calls: 10000
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
   Redis is 9215.00x faster than Database approach
   Time saved: 18428ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 6/7:
🔍 Testing: CITY startsWith "Mum"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database):
   ⏱️  Execution Time: 16226ms
   📄 Records Scanned: 10000
   🔓 Decryption Calls: 10000
   ✅ Matching Records: 194

Approach 2 (Redis):
   ⏱️  Execution Time: 3ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 194

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 194 identical tokens

🚀 Performance Summary:
   Redis is 5408.67x faster than Database approach
   Time saved: 16223ms
   ✅ Correctness: VERIFIED (same results)

============================================================


📋 Test 7/7:
🔍 Testing: ADDRESS contains "Road"
============================================================

📊 Performance Comparison Results:

Approach 1 (Database):
   ⏱️  Execution Time: 16772ms
   📄 Records Scanned: 10000
   🔓 Decryption Calls: 10000
   ✅ Matching Records: 858

Approach 2 (Redis):
   ⏱️  Execution Time: 4ms
   🔑 Hash Lookups: O(1) or O(k) for intersections
   🔓 Decryption Calls: 0
   ✅ Matching Tokens: 858

🔍 Result Validation:
   ✅ Results MATCH: Both approaches found same tokens
   🎯 Correctness: 858 identical tokens

🚀 Performance Summary:
   Redis is 4193.00x faster than Database approach
   Time saved: 16768ms
   ✅ Correctness: VERIFIED (same results)

============================================================

📈 Overall Performance Summary
============================

📊 Aggregate Results (7 tests):
   Database avg time: 23029.29ms
   Redis avg time: 4.29ms
   Overall speedup: 5373.50x
   Total decryptions avoided: 70000
   Total time saved: 161175ms

🔍 Result Validation Summary:
   ✅ Exact matches: 7/7 tests
   🎯 Average accuracy: 100.0%
   ✅ PERFECT: All approaches returned identical tokens

🎯 Final Result: Redis provides SIGNIFICANT performance advantage with VERIFIED correctness
🛑 Field-Aware Redis Indexer closed
🛑 Search Performance Tester closed
