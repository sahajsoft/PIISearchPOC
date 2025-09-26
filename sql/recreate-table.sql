-- Drop existing table and recreate with field_name column
-- WARNING: This will delete all existing data

-- Drop existing table
DROP TABLE IF EXISTS pii_token_data;

-- Create new table with field_name column
CREATE TABLE pii_token_data (
    id UUID PRIMARY KEY,
    created_by VARCHAR(255),
    creation_date TIMESTAMP,
    last_modified_date TIMESTAMP,
    modified_by VARCHAR(255),
    pii_data_point TEXT,  -- Stores Vault-encrypted ciphertext
    token VARCHAR(255) UNIQUE,
    is_active BOOLEAN,
    hash VARCHAR(255),
    field_name VARCHAR(100)  -- NEW: Stores PII type (EMAIL, PHONE, etc.)
);

-- Create indexes for better performance
CREATE INDEX idx_pii_token ON pii_token_data(token);
CREATE INDEX idx_pii_field_name ON pii_token_data(field_name);
CREATE INDEX idx_pii_is_active ON pii_token_data(is_active);
CREATE INDEX idx_pii_creation_date ON pii_token_data(creation_date);

-- Display table structure
\d pii_token_data;

-- Show success message
SELECT 'Table pii_token_data recreated successfully with field_name column' AS status;