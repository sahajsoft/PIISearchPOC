const { createHmac } = require('crypto');
const { createClient } = require('redis');

// Load environment variables
require('dotenv').config();

// HMAC-based n-gram indexer for privacy-preserving search
// Based on the specification provided - implements deterministic hashed indexing

class RedisHmacIndexer {
    constructor(redisConfig = {}, secret = null) {
        // Validate required environment variables if not provided as parameters
        if (!secret && !process.env.REDIS_HMAC_SECRET) {
            console.error('❌ Missing REDIS_HMAC_SECRET environment variable');
            console.error('Please copy .env.template to .env and configure all required variables.');
            process.exit(1);
        }

        if (!redisConfig.host && !process.env.REDIS_HOST) {
            console.error('❌ Missing REDIS_HOST environment variable');
            console.error('Please copy .env.template to .env and configure all required variables.');
            process.exit(1);
        }

        if (!redisConfig.port && !process.env.REDIS_PORT) {
            console.error('❌ Missing REDIS_PORT environment variable');
            console.error('Please copy .env.template to .env and configure all required variables.');
            process.exit(1);
        }

        this.redis = null;
        this.secret = secret || process.env.REDIS_HMAC_SECRET;
        this.redisConfig = {
            host: redisConfig.host || process.env.REDIS_HOST,
            port: redisConfig.port || parseInt(process.env.REDIS_PORT),
            password: redisConfig.password || process.env.REDIS_PASSWORD || null
        };
        this.k = 3; // Default k-gram size
    }

    async initialize() {
        try {
            this.redis = createClient(this.redisConfig);
            await this.redis.connect();
            console.log('✅ Redis HMAC Indexer connected');
            return true;
        } catch (error) {
            console.error('❌ Redis connection failed:', error.message);
            throw error;
        }
    }

    // HMAC hash function: H(s) = base64url(HMAC_SHA256(secret_key, s))
    H(s) {
        return createHmac('sha256', this.secret).update(s).digest('base64url');
    }

    // Normalization: lowercase + Unicode NFKC
    norm(s) {
        return s.normalize('NFKC').toLowerCase();
    }

    // Generate k-grams (sliding window)
    grams(s, k = this.k) {
        return (s.length < k) ? [] : Array.from({length: s.length - k + 1}, (_, i) => s.slice(i, i + k));
    }

    // Generate all prefixes for starts-with support
    prefixes(s) {
        return Array.from({length: s.length}, (_, i) => s.slice(0, i + 1));
    }

    // Generate all index keys for a phrase
    idxKeys(phrase, k = this.k) {
        const n = this.norm(phrase);
        const r = [...n].reverse().join('');

        return {
            eq: `idx:eq:${this.H(n)}`,                              // Equality: eq:{H(phrase)}
            pres: this.prefixes(n).map(x => `idx:pre:${this.H(x)}`),   // Prefixes: pre:{H(prefix)}
            sufs: this.prefixes(r).map(x => `idx:suf:${this.H(x)}`),   // Suffixes: suf:{H(reverse_prefix)}
            gk: this.grams(n, k).map(x => `idx:g${k}:${this.H(x)}`)    // K-grams: g3:{H(gram)}
        };
    }

    // Add phrase → token mapping to all relevant index keys
    async addPhraseToken(phrase, token, k = this.k) {
        try {
            const {eq, pres, sufs, gk} = this.idxKeys(phrase, k);
            const pipe = this.redis.multi();

            // Add token to all relevant sets
            pipe.sAdd(eq, token);
            pres.forEach(key => pipe.sAdd(key, token));
            sufs.forEach(key => pipe.sAdd(key, token));
            gk.forEach(key => pipe.sAdd(key, token));

            await pipe.exec();

            // Reduced logging - only log occasionally
            return true;
        } catch (error) {
            console.error(`❌ Failed to index phrase "${phrase}":`, error.message);
            throw error;
        }
    }

    // Remove phrase → token mapping from all relevant index keys
    async removePhraseToken(phrase, token, k = this.k) {
        try {
            const {eq, pres, sufs, gk} = this.idxKeys(phrase, k);
            const pipe = this.redis.multi();

            // Remove token from all relevant sets
            pipe.sRem(eq, token);
            pres.forEach(key => pipe.sRem(key, token));
            sufs.forEach(key => pipe.sRem(key, token));
            gk.forEach(key => pipe.sRem(key, token));

            await pipe.exec();

            // Optional: Clean up empty sets
            await this.cleanupEmptyKeys([eq, ...pres, ...sufs, ...gk]);

            console.log(`🗑️  Removed phrase "${phrase}" → token ${token}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to remove phrase "${phrase}":`, error.message);
            throw error;
        }
    }

    // Clean up keys that have empty sets
    async cleanupEmptyKeys(keys) {
        try {
            for (const key of keys) {
                const size = await this.redis.sCard(key);
                if (size === 0) {
                    await this.redis.del(key);
                }
            }
        } catch (error) {
            console.error('❌ Cleanup failed:', error.message);
        }
    }

    // Search operations
    async equalsLookup(query) {
        const key = `idx:eq:${this.H(this.norm(query))}`;
        return await this.redis.sMembers(key);
    }

    async startsWithLookup(query) {
        const key = `idx:pre:${this.H(this.norm(query))}`;
        return await this.redis.sMembers(key);
    }

    async endsWithLookup(query) {
        const reversed = [...this.norm(query)].reverse().join('');
        const key = `idx:suf:${this.H(reversed)}`;
        return await this.redis.sMembers(key);
    }

    async containsLookup(query, k = this.k) {
        const keys = this.grams(this.norm(query), k).map(g => `idx:g${k}:${this.H(g)}`);
        if (keys.length === 0) return [];

        // Intersect all k-gram sets to find tokens containing all grams
        return await this.redis.sInter(keys);
    }

    // Batch add multiple phrases for the same token
    async addTokenPhrases(token, phrases, k = this.k) {
        const pipe = this.redis.multi();

        for (const phrase of phrases) {
            const {eq, pres, sufs, gk} = this.idxKeys(phrase, k);
            pipe.sAdd(eq, token);
            pres.forEach(key => pipe.sAdd(key, token));
            sufs.forEach(key => pipe.sAdd(key, token));
            gk.forEach(key => pipe.sAdd(key, token));
        }

        await pipe.exec();
        console.log(`📦 Batch indexed ${phrases.length} phrases for token ${token}`);
        return true;
    }

    // Get indexing statistics
    async getStats() {
        try {
            const keys = await this.redis.keys('idx:*');
            let totalTokens = 0;
            let keyTypes = { eq: 0, pre: 0, suf: 0, g3: 0, g4: 0 };

            // Sample first 100 keys for performance
            const sampleKeys = keys.slice(0, 100);

            for (const key of sampleKeys) {
                const count = await this.redis.sCard(key);
                totalTokens += count;

                // Count key types
                if (key.includes(':eq:')) keyTypes.eq++;
                else if (key.includes(':pre:')) keyTypes.pre++;
                else if (key.includes(':suf:')) keyTypes.suf++;
                else if (key.includes(':g3:')) keyTypes.g3++;
                else if (key.includes(':g4:')) keyTypes.g4++;
            }

            return {
                totalKeys: keys.length,
                keyTypes,
                sampleTokenCount: totalTokens,
                estimatedTotalTokens: Math.round((totalTokens / sampleKeys.length) * keys.length)
            };
        } catch (error) {
            console.error('❌ Stats failed:', error.message);
            return { error: error.message };
        }
    }

    // Close Redis connection
    async close() {
        if (this.redis) {
            await this.redis.quit();
            console.log('🛑 Redis HMAC Indexer closed');
        }
    }
}

module.exports = { RedisHmacIndexer };