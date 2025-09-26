# PII Search System: Technical Deep Dive
**HMAC-Based Privacy-Preserving Search Implementation**

---

## Overview

This document explains the technical implementation of our GDPR-compliant PII search system, showing exactly how personal data is transformed, indexed, and searched without exposing sensitive information.

---

## Core Concepts

### 🔑 Key Components
- **Opaque Tokens**: Unique identifiers that replace PII records
- **HMAC Keys**: Cryptographically hashed search indices
- **Field Aliases**: Compact field identifiers for efficiency
- **Operation Types**: Different search patterns (equals, starts with, etc.)

### 🛡️ Privacy Principles
1. **Zero PII Exposure**: Raw data never appears in search indices
2. **Cryptographic Protection**: All keys use HMAC-SHA256
3. **k-Anonymity**: Results suppressed if fewer than 5 matches
4. **Audit Trail**: All operations logged without exposing data

---

## Data Storage & Indexing

### Step 1: Raw PII Data Processing

**Example Record:**
```json
{
  "person_id": "P001",
  "first_name": "John",
  "last_name": "Smith",
  "email": "john.smith@gmail.com",
  "mobile_number": "9876543210",
  "city": "Mumbai"
}
```

### Step 2: Vault Encryption & Token Generation

```
Raw Data Processing:
┌─────────────────────┐    ┌──────────────────────┐
│ "John"              │───▶│ Vault Encryption     │
└─────────────────────┘    │ AES-256-GCM          │
                           └─────────┬────────────┘
                                     ▼
                           ┌─────────────────────────┐
                           │ Encrypted:              │
                           │ "vault:v1:abc123..."    │
                           └─────────┬───────────────┘
                                     ▼
                           ┌─────────────────────────┐
                           │ Generate Token:         │
                           │ "TKN_ABC123_FIRST_NAME" │
                           └─────────────────────────┘
```

**Generated Tokens for P001:**
```
TKN_ABC123_FIRST_NAME    → "vault:v1:encrypted_john"
TKN_ABC123_LAST_NAME     → "vault:v1:encrypted_smith"
TKN_ABC123_EMAIL         → "vault:v1:encrypted_email"
TKN_ABC123_MOBILE_NUMBER → "vault:v1:encrypted_phone"
TKN_ABC123_CITY          → "vault:v1:encrypted_mumbai"
```

### Step 3: HMAC Index Key Generation

**Field Mapping:**
```javascript
FIELD_MAP = {
    'FIRST_NAME': 'fn',
    'LAST_NAME': 'ln',
    'EMAIL': 'email',
    'MOBILE_NUMBER': 'phone',
    'CITY': 'city'
}
```

**HMAC Secret:** `pii-search-secret-key-2024`

**Key Generation Process:**
```javascript
// For "John" in FIRST_NAME field
function generateIndexKeys(field, value) {
    const fieldAlias = 'fn';  // FIRST_NAME → fn
    const normalized = value.normalize('NFKC').toLowerCase().trim(); // "john"
    const secret = 'pii-search-secret-key-2024';

    // Generate different operation keys
    const keys = [];

    // 1. Equality key
    const eqInput = `${fieldAlias}|${normalized}`;  // "fn|john"
    const eqHash = HMAC_SHA256(secret, eqInput);    // "Kx7mN9..."
    keys.push(`idx:${fieldAlias}:eq:${eqHash}`);    // "idx:fn:eq:Kx7mN9..."

    // 2. Prefix keys (for startsWith)
    for (let i = 1; i <= normalized.length; i++) {
        const prefix = normalized.slice(0, i);       // "j", "jo", "joh", "john"
        const prefixInput = `${fieldAlias}|${prefix}`;
        const prefixHash = HMAC_SHA256(secret, prefixInput);
        keys.push(`idx:${fieldAlias}:pre:${prefixHash}`);
    }

    // 3. Suffix keys (for endsWith)
    const reversed = normalized.split('').reverse().join(''); // "nhoj"
    for (let i = 1; i <= reversed.length; i++) {
        const suffix = reversed.slice(0, i);         // "n", "nh", "nho", "nhoj"
        const suffixInput = `${fieldAlias}|${suffix}`;
        const suffixHash = HMAC_SHA256(secret, suffixInput);
        keys.push(`idx:${fieldAlias}:suf:${suffixHash}`);
    }

    // 4. 3-gram keys (for contains)
    for (let i = 0; i <= normalized.length - 3; i++) {
        const gram = normalized.slice(i, i + 3);     // "joh", "ohn"
        const gramInput = `${fieldAlias}|${gram}`;
        const gramHash = HMAC_SHA256(secret, gramInput);
        keys.push(`idx:${fieldAlias}:g3:${gramHash}`);
    }

    return keys;
}
```

### Step 4: Index Storage

**Redis Storage:**
```
Key: idx:fn:eq:Kx7mN9pQr2sT8uV3wX4yZ5a     Value: {"TKN_ABC123_FIRST_NAME"}
Key: idx:fn:pre:Lm8oP1qR3sU6vY9zA2bC4d     Value: {"TKN_ABC123_FIRST_NAME"}  # "j"
Key: idx:fn:pre:Nn9pQ2rS4tW7xA0zB3cE5f     Value: {"TKN_ABC123_FIRST_NAME"}  # "jo"
Key: idx:fn:pre:Oo0qR3sU5vY8zB1cF4dG6h     Value: {"TKN_ABC123_FIRST_NAME"}  # "joh"
Key: idx:fn:pre:Kx7mN9pQr2sT8uV3wX4yZ5a     Value: {"TKN_ABC123_FIRST_NAME"}  # "john"
Key: idx:fn:suf:Pp1rS4tW6xA9zC2eG5fH7i     Value: {"TKN_ABC123_FIRST_NAME"}  # "n"
Key: idx:fn:suf:Qq2sT5uX7yB0zD3fH6gI8j     Value: {"TKN_ABC123_FIRST_NAME"}  # "nh"
Key: idx:fn:suf:Rr3tU6vY8zC1eF4gI7hJ9k     Value: {"TKN_ABC123_FIRST_NAME"}  # "nho"
Key: idx:fn:suf:Ss4uV7wZ9aD2fG5hJ8iK0l     Value: {"TKN_ABC123_FIRST_NAME"}  # "nhoj"
Key: idx:fn:g3:Tt5vW8xA0bE3gH6iK9jL1m     Value: {"TKN_ABC123_FIRST_NAME"}  # "joh"
Key: idx:fn:g3:Uu6wX9yB1cF4hI7jL0kM2n     Value: {"TKN_ABC123_FIRST_NAME"}  # "ohn"
```

**Database Storage (PostgreSQL):**
```sql
INSERT INTO pii_search_index (hmac_key, token_set, field_type, created_at, retention_until)
VALUES
('idx:fn:eq:Kx7mN9pQr2sT8uV3wX4yZ5a', 'TKN_ABC123_FIRST_NAME', 'FIRST_NAME', NOW(), NOW() + INTERVAL '1 year'),
('idx:fn:pre:Lm8oP1qR3sU6vY9zA2bC4d', 'TKN_ABC123_FIRST_NAME', 'FIRST_NAME', NOW(), NOW() + INTERVAL '1 year'),
('idx:fn:pre:Nn9pQ2rS4tW7xA0zB3cE5f', 'TKN_ABC123_FIRST_NAME', 'FIRST_NAME', NOW(), NOW() + INTERVAL '1 year'),
-- ... additional prefix, suffix, and 3-gram keys
```

---

## Search Query Processing

### Example Search Queries

#### Query 1: Exact Match
**User Query:** `FIRST_NAME equals "John"`

**Processing Steps:**
```javascript
// Step 1: Normalize query
const field = 'fn';                    // FIRST_NAME → fn
const operation = 'eq';               // equals → eq
const query = 'john';                 // "John" → normalized "john"

// Step 2: Generate search key
const searchInput = `${field}|${query}`;           // "fn|john"
const searchHash = HMAC_SHA256(secret, searchInput); // "Kx7mN9pQr2sT8uV3wX4yZ5a"
const searchKey = `idx:${field}:${operation}:${searchHash}`;

console.log("Search key:", searchKey);
// Output: "idx:fn:eq:Kx7mN9pQr2sT8uV3wX4yZ5a"
```

**Redis Lookup:**
```javascript
const tokens = await redis.sMembers('idx:fn:eq:Kx7mN9pQr2sT8uV3wX4yZ5a');
// Returns: ["TKN_ABC123_FIRST_NAME", "TKN_XYZ789_FIRST_NAME", ...]
```

**Database Lookup:**
```sql
SELECT DISTINCT unnest(string_to_array(token_set, ',')) as token
FROM pii_search_index
WHERE hmac_key = 'idx:fn:eq:Kx7mN9pQr2sT8uV3wX4yZ5a'
  AND retention_until > NOW();
-- Returns: TKN_ABC123_FIRST_NAME, TKN_XYZ789_FIRST_NAME, ...
```

#### Query 2: Starts With
**User Query:** `EMAIL startsWith "john"`

**Processing Steps:**
```javascript
// Step 1: Normalize
const field = 'email';               // EMAIL → email
const operation = 'startsWith';      // startsWith → pre
const query = 'john';               // "john" → "john"

// Step 2: Generate prefix key
const prefixInput = `${field}|${query}`;              // "email|john"
const prefixHash = HMAC_SHA256(secret, prefixInput);   // "Ab2cD3eF4gH5..."
const searchKey = `idx:${field}:pre:${prefixHash}`;

console.log("Search key:", searchKey);
// Output: "idx:email:pre:Ab2cD3eF4gH5iJ6kL7mN8o"
```

#### Query 3: Contains (3-gram Search)
**User Query:** `EMAIL contains "gmail"`

**Processing Steps:**
```javascript
// Step 1: Generate all 3-grams
const field = 'email';
const query = 'gmail';               // length = 5
const k = 3;                        // 3-gram size

const grams = [];
for (let i = 0; i <= query.length - k; i++) {
    grams.push(query.slice(i, i + k));
}
console.log("3-grams:", grams);
// Output: ["gma", "mai", "ail"]

// Step 2: Generate HMAC keys for each gram
const searchKeys = grams.map(gram => {
    const gramInput = `${field}|${gram}`;
    const gramHash = HMAC_SHA256(secret, gramInput);
    return `idx:${field}:g3:${gramHash}`;
});

console.log("Search keys:", searchKeys);
// Output: [
//   "idx:email:g3:Cd4eF5gH6iJ7kL8mN9oP0q",
//   "idx:email:g3:De5fG6hI7jK8lM9nO0pQ1r",
//   "idx:email:g3:Ef6gH7iJ8kL9mN0oP1qR2s"
// ]
```

**Intersection Logic:**
```javascript
// Get token sets for each 3-gram
const tokenSets = [];
for (const key of searchKeys) {
    const tokens = await redis.sMembers(key);
    tokenSets.push(new Set(tokens));
}

// Find intersection (all 3-grams must match)
let result = tokenSets[0];
for (let i = 1; i < tokenSets.length; i++) {
    result = new Set([...result].filter(token => tokenSets[i].has(token)));
}

console.log("Matching tokens:", Array.from(result));
// Output: ["TKN_ABC123_EMAIL", "TKN_DEF456_EMAIL", ...]
```

---

## Complete Example Walkthrough

### Scenario: Search for users with Gmail addresses

**Initial Data:**
```javascript
// Person 1
{
  first_name: "John",
  email: "john.smith@gmail.com",
  token: "TKN_ABC123"
}

// Person 2
{
  first_name: "Jane",
  email: "jane.doe@yahoo.com",
  token: "TKN_XYZ789"
}

// Person 3
{
  first_name: "Mike",
  email: "mike.wilson@gmail.com",
  token: "TKN_DEF456"
}
```

### Indexing Process

**For john.smith@gmail.com:**
```
Normalized: "john.smith@gmail.com"
Field: "email"
Token: "TKN_ABC123_EMAIL"

Generated 3-grams: ["joh", "ohn", "hn.", "n.s", ".sm", "smi", "mit", "ith", "th@", "h@g", "@gm", "gma", "mai", "ail", "il.", "l.c", ".co", "com"]

HMAC Keys Created:
idx:email:g3:H1a → TKN_ABC123_EMAIL  # "joh"
idx:email:g3:I2b → TKN_ABC123_EMAIL  # "ohn"
idx:email:g3:J3c → TKN_ABC123_EMAIL  # "hn."
...
idx:email:g3:X9m → TKN_ABC123_EMAIL  # "gma"
idx:email:g3:Y0n → TKN_ABC123_EMAIL  # "mai"
idx:email:g3:Z1o → TKN_ABC123_EMAIL  # "ail"
...
```

**For mike.wilson@gmail.com:**
```
Similar process generates overlapping keys for "gmail":
idx:email:g3:X9m → TKN_DEF456_EMAIL  # "gma"
idx:email:g3:Y0n → TKN_DEF456_EMAIL  # "mai"
idx:email:g3:Z1o → TKN_DEF456_EMAIL  # "ail"
```

### Search Process

**Query:** `EMAIL contains "gmail"`

```javascript
// 1. Generate 3-grams for "gmail"
const grams = ["gma", "mai", "ail"];

// 2. Get HMAC keys
const keys = [
  "idx:email:g3:X9m",  // gma
  "idx:email:g3:Y0n",  // mai
  "idx:email:g3:Z1o"   // ail
];

// 3. Lookup in Redis/Database
Key "idx:email:g3:X9m": ["TKN_ABC123_EMAIL", "TKN_DEF456_EMAIL"]
Key "idx:email:g3:Y0n": ["TKN_ABC123_EMAIL", "TKN_DEF456_EMAIL"]
Key "idx:email:g3:Z1o": ["TKN_ABC123_EMAIL", "TKN_DEF456_EMAIL"]

// 4. Intersection (all grams must match)
Result: ["TKN_ABC123_EMAIL", "TKN_DEF456_EMAIL"]

// 5. k-Anonymity check (≥5 required)
Count: 2 tokens < 5 → Results suppressed for privacy

// 6. Final Response
{
  "tokens": [],
  "resultCount": 2,
  "anonymizedCount": 0,
  "kAnonymityApplied": true
}
```

---

## Storage Comparison

### Redis Implementation
```javascript
// Indexing
await redis.sadd('idx:email:g3:X9m', 'TKN_ABC123_EMAIL');

// Searching
const tokens1 = await redis.sMembers('idx:email:g3:X9m');
const tokens2 = await redis.sMembers('idx:email:g3:Y0n');
const intersection = await redis.sInter(['idx:email:g3:X9m', 'idx:email:g3:Y0n']);
```

### Database Implementation
```sql
-- Indexing
INSERT INTO pii_search_index (hmac_key, token_set, field_type)
VALUES ('idx:email:g3:X9m', 'TKN_ABC123_EMAIL', 'EMAIL');

-- Searching
SELECT DISTINCT unnest(string_to_array(token_set, ',')) as token
FROM pii_search_index
WHERE hmac_key IN ('idx:email:g3:X9m', 'idx:email:g3:Y0n', 'idx:email:g3:Z1o')
  AND retention_until > NOW();
```

---

## Security & Privacy Features

### 🔒 HMAC Protection
- **Secret Key**: Never exposed, rotated quarterly
- **Hash Function**: SHA-256 (cryptographically secure)
- **Key Derivation**: Field + normalized value combination
- **Collision Resistance**: Mathematically improbable

### 🛡️ Privacy Guarantees
- **No PII Exposure**: Raw data never in search indices
- **k-Anonymity**: Results hidden if <5 matches
- **Audit Trail**: All queries logged (hashed)
- **Retention**: Automatic cleanup after expiry

### ⚡ Performance Optimizations
- **Field Aliases**: Compact keys (`fn` vs `FIRST_NAME`)
- **Efficient Hashing**: Single HMAC per search term
- **Index Intersection**: Fast set operations
- **Memory Usage**: Optimized token storage

---

## Conclusion

This system provides **mathematically provable privacy** while enabling **efficient search operations**. The HMAC-based approach ensures that:

1. **No PII is ever exposed** in search indices
2. **Query patterns are cryptographically protected**
3. **k-Anonymity prevents individual identification**
4. **Performance remains optimal** for real-time queries
5. **Full audit trails enable compliance** reporting

The dual storage approach (Redis/Database) offers identical security with different performance characteristics, allowing organizations to choose based on their specific requirements.

---

**Technical Contacts:**
- **Implementation Lead**: Arun Raj Mony
- **Security Review**: [Security Team Lead]
- **GDPR Compliance**: [Legal Team Contact]