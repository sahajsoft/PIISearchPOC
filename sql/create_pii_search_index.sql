-- ===============================================
-- PII Search Index Table Creation Script
-- GDPR-Compliant Privacy-Preserving Search Index
-- ===============================================
-- POC Version: Simplified for demonstration purposes

-- Drop existing table if it exists (for development/testing)
-- CAUTION: This will delete all existing search index data
DROP TABLE IF EXISTS pii_search_index CASCADE;

-- ===============================================
-- Main Search Index Table (Simplified)
-- ===============================================

CREATE TABLE pii_search_index (
    -- HMAC-based search key as PRIMARY KEY (simplified approach)
    -- Example: "idx:fn:eq:Kx7mN9pQr2sT8uV3wX4yZ5a"
    hmac_key VARCHAR(255) PRIMARY KEY,

    -- Comma-separated list of opaque tokens that match this HMAC key
    -- Example: "TKN_ABC123_FIRST_NAME,TKN_XYZ789_FIRST_NAME"
    token_set TEXT NOT NULL,

    -- Original field type for audit purposes
    -- Examples: FIRST_NAME, EMAIL, MOBILE_NUMBER, ADDRESS
    field_type VARCHAR(50) NOT NULL,

    -- Timestamp when this index entry was created
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- GDPR retention - when this entry should be automatically deleted
    retention_until TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '1 year')
);

-- ===============================================
-- Performance Indexes
-- ===============================================

-- Field type analysis index
CREATE INDEX idx_pii_search_field_type ON pii_search_index(field_type);

-- GDPR retention cleanup index
CREATE INDEX idx_pii_search_retention ON pii_search_index(retention_until);

-- Composite index for efficient field + HMAC queries
CREATE INDEX idx_pii_search_field_hmac ON pii_search_index(field_type, hmac_key);

-- Composite index for efficient GDPR cleanup queries
CREATE INDEX idx_pii_search_cleanup ON pii_search_index(retention_until, field_type)
WHERE retention_until IS NOT NULL;

-- ===============================================
-- Essential GDPR Compliance Functions
-- ===============================================

-- Automated GDPR retention cleanup function
CREATE OR REPLACE FUNCTION gdpr_cleanup_search_index()
RETURNS TABLE(
    deleted_count INTEGER,
    cleanup_timestamp TIMESTAMP,
    affected_field_types TEXT[]
) AS $$
DECLARE
    deleted_rows INTEGER;
    affected_types TEXT[];
BEGIN
    -- Get list of field types that will be affected
    SELECT array_agg(DISTINCT field_type) INTO affected_types
    FROM pii_search_index
    WHERE retention_until < NOW();

    -- Delete expired entries
    DELETE FROM pii_search_index
    WHERE retention_until < NOW();

    -- Get count of deleted rows
    GET DIAGNOSTICS deleted_rows = ROW_COUNT;

    -- Return results
    RETURN QUERY SELECT
        deleted_rows,
        NOW()::TIMESTAMP,
        COALESCE(affected_types, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql;

-- Function to get basic index statistics
CREATE OR REPLACE FUNCTION get_search_index_stats()
RETURNS TABLE(
    total_keys BIGINT,
    total_tokens BIGINT,
    keys_by_operation JSON,
    field_distribution JSON,
    retention_summary JSON,
    oldest_entry TIMESTAMP,
    newest_entry TIMESTAMP,
    index_size_mb NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH operation_stats AS (
        SELECT
            CASE
                WHEN hmac_key LIKE '%:eq:%' THEN 'equality'
                WHEN hmac_key LIKE '%:pre:%' THEN 'prefix'
                WHEN hmac_key LIKE '%:suf:%' THEN 'suffix'
                WHEN hmac_key LIKE '%:g3:%' THEN '3-gram'
                WHEN hmac_key LIKE '%:g4:%' THEN '4-gram'
                ELSE 'other'
            END as operation_type,
            COUNT(*) as op_count
        FROM pii_search_index
        GROUP BY 1
    ),
    field_stats AS (
        SELECT field_type, COUNT(*) as field_count
        FROM pii_search_index
        GROUP BY field_type
        ORDER BY field_count DESC
    ),
    retention_stats AS (
        SELECT
            COUNT(CASE WHEN retention_until < NOW() THEN 1 END) as expired_entries,
            COUNT(CASE WHEN retention_until >= NOW() THEN 1 END) as active_entries
        FROM pii_search_index
    ),
    token_count AS (
        SELECT SUM(
            CASE
                WHEN token_set IS NOT NULL AND token_set != ''
                THEN array_length(string_to_array(token_set, ','), 1)
                ELSE 0
            END
        ) as total_token_count
        FROM pii_search_index
    )
    SELECT
        (SELECT COUNT(*) FROM pii_search_index)::BIGINT as total_keys,
        (SELECT total_token_count FROM token_count)::BIGINT as total_tokens,
        (SELECT json_object_agg(operation_type, op_count) FROM operation_stats) as keys_by_operation,
        (SELECT json_object_agg(field_type, field_count) FROM field_stats) as field_distribution,
        (SELECT json_build_object('expired', expired_entries, 'active', active_entries) FROM retention_stats) as retention_summary,
        (SELECT MIN(created_at) FROM pii_search_index) as oldest_entry,
        (SELECT MAX(created_at) FROM pii_search_index) as newest_entry,
        ROUND(pg_total_relation_size('pii_search_index') / 1024.0 / 1024.0, 2) as index_size_mb;
END;
$$ LANGUAGE plpgsql;

-- Function to search for tokens by HMAC keys (used by application)
CREATE OR REPLACE FUNCTION search_tokens_by_keys(hmac_keys TEXT[])
RETURNS TABLE(token TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT unnest(string_to_array(psi.token_set, ',')) as token
    FROM pii_search_index psi
    WHERE psi.hmac_key = ANY(hmac_keys)
      AND (psi.retention_until IS NULL OR psi.retention_until > NOW())
      AND psi.token_set IS NOT NULL
      AND psi.token_set != '';
END;
$$ LANGUAGE plpgsql;

-- Function to get token intersection (for multi-key searches)
CREATE OR REPLACE FUNCTION search_tokens_intersection(hmac_keys TEXT[])
RETURNS TABLE(token TEXT) AS $$
DECLARE
    key_count INTEGER := array_length(hmac_keys, 1);
BEGIN
    -- If no keys provided, return empty result
    IF key_count = 0 OR hmac_keys IS NULL THEN
        RETURN;
    END IF;

    -- If single key, use direct lookup
    IF key_count = 1 THEN
        RETURN QUERY SELECT * FROM search_tokens_by_keys(hmac_keys);
        RETURN;
    END IF;

    -- For multiple keys, find intersection
    RETURN QUERY
    WITH token_counts AS (
        SELECT
            unnest(string_to_array(psi.token_set, ',')) as token,
            COUNT(*) as key_matches
        FROM pii_search_index psi
        WHERE psi.hmac_key = ANY(hmac_keys)
          AND (psi.retention_until IS NULL OR psi.retention_until > NOW())
          AND psi.token_set IS NOT NULL
          AND psi.token_set != ''
        GROUP BY 1
    )
    SELECT tc.token
    FROM token_counts tc
    WHERE tc.key_matches = key_count;  -- Must match ALL provided keys
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- POC Sample Data and Usage Examples
-- ===============================================

-- Example: Insert sample HMAC keys with tokens (for POC testing)
/*
INSERT INTO pii_search_index (hmac_key, token_set, field_type) VALUES
('idx:fn:eq:Kx7mN9pQr2sT8uV3wX4yZ5a', 'TKN_ABC123_FIRST_NAME,TKN_XYZ789_FIRST_NAME', 'FIRST_NAME'),
('idx:email:g3:Pp1rS4tW6xA9zC2eG5fH7i', 'TKN_DEF456_EMAIL', 'EMAIL'),
('idx:phone:pre:Qq2sT5uX7yB0zD3fH6gI8j', 'TKN_GHI789_MOBILE_NUMBER', 'MOBILE_NUMBER');
*/

-- ===============================================
-- POC Testing Queries
-- ===============================================

-- Check current table status
-- SELECT COUNT(*) as total_records, COUNT(DISTINCT field_type) as field_types FROM pii_search_index;

-- Get comprehensive statistics
-- SELECT * FROM get_search_index_stats();

-- Test search function
-- SELECT * FROM search_tokens_by_keys(ARRAY['idx:fn:eq:Kx7mN9pQr2sT8uV3wX4yZ5a']);

-- Test complex intersection search
-- SELECT * FROM search_tokens_intersection(ARRAY['key1', 'key2']);

-- Run GDPR cleanup (test)
-- SELECT * FROM gdpr_cleanup_search_index();

-- ===============================================
-- POC Maintenance Commands
-- ===============================================

/*
POC MAINTENANCE SCHEDULE:
1. Daily: SELECT * FROM gdpr_cleanup_search_index();
2. Weekly: SELECT * FROM get_search_index_stats();
3. Monthly: VACUUM ANALYZE pii_search_index;

POC PERFORMANCE MONITORING:
1. Index size: SELECT pg_size_pretty(pg_total_relation_size('pii_search_index'));
2. Query performance: Use EXPLAIN ANALYZE on search functions
3. Memory usage: Check PostgreSQL logs for memory consumption

POC BACKUP (optional):
1. pg_dump for table backup
2. Regular snapshots for development
*/

-- Display creation summary
DO $$
DECLARE
    table_exists boolean;
BEGIN
    -- Check if table was created successfully
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'pii_search_index'
    ) INTO table_exists;

    IF table_exists THEN
        RAISE NOTICE '=====================================';
        RAISE NOTICE 'PII Search Index Table Created (POC)';
        RAISE NOTICE '=====================================';
        RAISE NOTICE 'Table: pii_search_index';
        RAISE NOTICE '  - hmac_key (PRIMARY KEY)';
        RAISE NOTICE '  - token_set, field_type';
        RAISE NOTICE '  - created_at, retention_until';
        RAISE NOTICE '';
        RAISE NOTICE 'Functions:';
        RAISE NOTICE '  ✓ gdpr_cleanup_search_index()';
        RAISE NOTICE '  ✓ get_search_index_stats()';
        RAISE NOTICE '  ✓ search_tokens_by_keys()';
        RAISE NOTICE '  ✓ search_tokens_intersection()';
        RAISE NOTICE '';
        RAISE NOTICE 'Indexes: 4 performance indexes created';
        RAISE NOTICE 'Ready for POC testing and demonstration!';
        RAISE NOTICE '=====================================';
    ELSE
        RAISE NOTICE 'ERROR: Table creation failed!';
    END IF;
END $$;