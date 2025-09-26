-- ===============================================
-- PII Search Index Table Optimization Script
-- Optimizes existing pii_search_index table structure
-- ===============================================

-- This script works with your existing table structure:
-- hmac_key (PRIMARY KEY), token_set, field_type, created_at, retention_until

-- ===============================================
-- Add Missing Columns (if needed)
-- ===============================================

-- Add default values to existing columns if they don't have them
ALTER TABLE pii_search_index
ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE pii_search_index
ALTER COLUMN retention_until SET DEFAULT (NOW() + INTERVAL '1 year');

-- Make essential columns NOT NULL if they aren't already
-- (These will fail if there's existing NULL data - check first)
-- ALTER TABLE pii_search_index ALTER COLUMN token_set SET NOT NULL;
-- ALTER TABLE pii_search_index ALTER COLUMN field_type SET NOT NULL;
-- ALTER TABLE pii_search_index ALTER COLUMN created_at SET NOT NULL;
-- ALTER TABLE pii_search_index ALTER COLUMN retention_until SET NOT NULL;

-- Add optional compliance tracking column (if desired)
-- ALTER TABLE pii_search_index ADD COLUMN IF NOT EXISTS compliance_version VARCHAR(10) DEFAULT '1.0';

-- ===============================================
-- Verify/Add Performance Indexes
-- ===============================================

-- Your existing indexes (already present):
-- "pii_search_index_pkey" PRIMARY KEY, btree (hmac_key) ✓
-- "idx_pii_search_field_type" btree (field_type) ✓
-- "idx_pii_search_retention" btree (retention_until) ✓
-- "idx_pii_search_field_hmac" btree (field_type, hmac_key) ✓

-- Add creation timestamp index for audit queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_pii_search_created_at ON pii_search_index(created_at);

-- Add composite index for efficient GDPR cleanup queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_pii_search_cleanup ON pii_search_index(retention_until, field_type)
WHERE retention_until IS NOT NULL;

-- ===============================================
-- GDPR Compliance Functions
-- ===============================================

-- Function to clean up expired entries (works with your table structure)
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

-- Function to get comprehensive statistics (works with your table structure)
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
    ),
    size_stats AS (
        SELECT
            ROUND(pg_total_relation_size('pii_search_index') / 1024.0 / 1024.0, 2) as table_size_mb
    )
    SELECT
        (SELECT COUNT(*) FROM pii_search_index)::BIGINT as total_keys,
        (SELECT total_token_count FROM token_count)::BIGINT as total_tokens,
        (SELECT json_object_agg(operation_type, op_count) FROM operation_stats) as keys_by_operation,
        (SELECT json_object_agg(field_type, field_count) FROM field_stats) as field_distribution,
        (SELECT json_build_object('expired', expired_entries, 'active', active_entries) FROM retention_stats) as retention_summary,
        (SELECT MIN(created_at) FROM pii_search_index) as oldest_entry,
        (SELECT MAX(created_at) FROM pii_search_index) as newest_entry,
        (SELECT table_size_mb FROM size_stats) as index_size_mb;
END;
$$ LANGUAGE plpgsql;

-- Function to search for tokens by HMAC keys (optimized for your structure)
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

-- Function to get token intersection for complex searches
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
-- Audit and Compliance Support
-- ===============================================

-- Create audit log table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS pii_search_audit_log (
    id BIGSERIAL PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    records_affected INTEGER DEFAULT 0,
    field_types_affected TEXT[],
    compliance_certificate UUID DEFAULT gen_random_uuid(),
    details JSONB,
    performed_by VARCHAR(100) DEFAULT 'system'
);

-- Add indexes for audit log (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON pii_search_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON pii_search_audit_log(action_type);

-- ===============================================
-- Utility Functions for Your Table Structure
-- ===============================================

-- Function to analyze HMAC key patterns
CREATE OR REPLACE FUNCTION analyze_hmac_key_patterns()
RETURNS TABLE(
    pattern_type VARCHAR(20),
    sample_key TEXT,
    key_count BIGINT,
    avg_tokens_per_key NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH pattern_analysis AS (
        SELECT
            CASE
                WHEN hmac_key LIKE 'idx:%:eq:%' THEN 'equality'
                WHEN hmac_key LIKE 'idx:%:pre:%' THEN 'prefix'
                WHEN hmac_key LIKE 'idx:%:suf:%' THEN 'suffix'
                WHEN hmac_key LIKE 'idx:%:g3:%' THEN '3-gram'
                WHEN hmac_key LIKE 'idx:%:g4:%' THEN '4-gram'
                ELSE 'unknown'
            END as pattern,
            hmac_key,
            CASE
                WHEN token_set IS NOT NULL AND token_set != ''
                THEN array_length(string_to_array(token_set, ','), 1)
                ELSE 0
            END as token_count
        FROM pii_search_index
    )
    SELECT
        pa.pattern::VARCHAR(20),
        (array_agg(pa.hmac_key))[1] as sample_key,
        COUNT(*)::BIGINT as key_count,
        ROUND(AVG(pa.token_count), 2) as avg_tokens_per_key
    FROM pattern_analysis pa
    GROUP BY pa.pattern
    ORDER BY key_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to find potential duplicate or problematic entries
CREATE OR REPLACE FUNCTION find_index_issues()
RETURNS TABLE(
    issue_type TEXT,
    issue_count BIGINT,
    sample_hmac_key TEXT
) AS $$
BEGIN
    RETURN QUERY
    -- Empty token sets
    SELECT
        'empty_token_set'::TEXT,
        COUNT(*)::BIGINT,
        (array_agg(hmac_key))[1]
    FROM pii_search_index
    WHERE token_set IS NULL OR token_set = ''
    HAVING COUNT(*) > 0

    UNION ALL

    -- Expired entries that should be cleaned up
    SELECT
        'expired_entries'::TEXT,
        COUNT(*)::BIGINT,
        (array_agg(hmac_key))[1]
    FROM pii_search_index
    WHERE retention_until < NOW()
    HAVING COUNT(*) > 0

    UNION ALL

    -- Entries with suspicious token counts (> 1000 tokens per key)
    SELECT
        'high_token_count'::TEXT,
        COUNT(*)::BIGINT,
        (array_agg(hmac_key))[1]
    FROM pii_search_index
    WHERE array_length(string_to_array(token_set, ','), 1) > 1000
    HAVING COUNT(*) > 0;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- Performance Monitoring Views
-- ===============================================

-- Create a view for easy monitoring (read-only)
CREATE OR REPLACE VIEW pii_search_index_summary AS
SELECT
    field_type,
    COUNT(*) as total_keys,
    SUM(
        CASE
            WHEN token_set IS NOT NULL AND token_set != ''
            THEN array_length(string_to_array(token_set, ','), 1)
            ELSE 0
        END
    ) as total_tokens,
    MIN(created_at) as oldest_entry,
    MAX(created_at) as newest_entry,
    COUNT(CASE WHEN retention_until < NOW() THEN 1 END) as expired_entries
FROM pii_search_index
GROUP BY field_type
ORDER BY total_keys DESC;

-- ===============================================
-- Sample Queries for Your Data
-- ===============================================

-- Check current table status
/*
SELECT 'Current table status:' as info;
SELECT COUNT(*) as total_records,
       COUNT(DISTINCT field_type) as field_types,
       MIN(created_at) as oldest,
       MAX(created_at) as newest
FROM pii_search_index;
*/

-- Get comprehensive statistics
-- SELECT * FROM get_search_index_stats();

-- Check for any issues
-- SELECT * FROM find_index_issues();

-- Analyze HMAC key patterns
-- SELECT * FROM analyze_hmac_key_patterns();

-- View summary by field type
-- SELECT * FROM pii_search_index_summary;

-- Test search function with actual keys from your table
-- SELECT * FROM search_tokens_by_keys(ARRAY[(SELECT hmac_key FROM pii_search_index LIMIT 1)]);

-- ===============================================
-- Maintenance Recommendations
-- ===============================================

/*
MAINTENANCE SCHEDULE:
1. Daily: SELECT * FROM gdpr_cleanup_search_index();
2. Weekly: SELECT * FROM find_index_issues();
3. Monthly: VACUUM ANALYZE pii_search_index;
4. Quarterly: SELECT * FROM get_search_index_stats();

PERFORMANCE MONITORING:
1. Monitor index size: SELECT pg_size_pretty(pg_total_relation_size('pii_search_index'));
2. Check for slow queries: Enable pg_stat_statements
3. Monitor retention cleanup: Check pii_search_audit_log

BACKUP STRATEGY:
1. Regular pg_dump of entire database
2. Separate backup of audit logs for compliance
3. Test restore procedures quarterly
*/

-- Display optimization summary
DO $$
DECLARE
    table_exists boolean;
    total_records bigint;
BEGIN
    -- Check if table exists and get record count
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'pii_search_index'
    ) INTO table_exists;

    IF table_exists THEN
        SELECT COUNT(*) INTO total_records FROM pii_search_index;

        RAISE NOTICE '=====================================';
        RAISE NOTICE 'PII Search Index Optimization Complete';
        RAISE NOTICE '=====================================';
        RAISE NOTICE 'Table: pii_search_index (% records)', total_records;
        RAISE NOTICE 'Functions added:';
        RAISE NOTICE '  ✓ gdpr_cleanup_search_index()';
        RAISE NOTICE '  ✓ get_search_index_stats()';
        RAISE NOTICE '  ✓ search_tokens_by_keys()';
        RAISE NOTICE '  ✓ search_tokens_intersection()';
        RAISE NOTICE '  ✓ analyze_hmac_key_patterns()';
        RAISE NOTICE '  ✓ find_index_issues()';
        RAISE NOTICE '';
        RAISE NOTICE 'Views added:';
        RAISE NOTICE '  ✓ pii_search_index_summary';
        RAISE NOTICE '';
        RAISE NOTICE 'Additional indexes created (if needed)';
        RAISE NOTICE 'Audit log table created (if needed)';
        RAISE NOTICE '';
        RAISE NOTICE 'Ready for optimized GDPR-compliant search!';
        RAISE NOTICE '=====================================';
    ELSE
        RAISE NOTICE 'Table pii_search_index not found!';
    END IF;
END $$;