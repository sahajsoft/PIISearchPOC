# HashiCorp Vault Setup Guide

## Quick Start (Development Mode)

### 1. Install Vault

**macOS (using Homebrew):**
```bash
brew tap hashicorp/tap
brew install hashicorp/tap/vault
```

**Linux:**
```bash
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo apt-key add -
sudo apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"
sudo apt-get update && sudo apt-get install vault
```

### 2. Start Vault in Development Mode

```bash
vault server -dev
```

This will output something like:
```
Root Token: hvs.6j4cuewowBGit65rheNoceI7
Unseal Key: not needed in dev mode

Export the following environment variables:
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='hvs.6j4cuewowBGit65rheNoceI7'
```

### 3. Set Environment Variables

In another terminal, export the variables shown in the output:

```bash
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='hvs.6j4cuewowBGit65rheNoceI7'  # Use your actual token
```

### 4. Verify Vault is Running

```bash
vault status
```

Should show:
```
Key             Value
---             -----
Seal Type       shamir
Initialized     true
Sealed          false
Total Shares    1
Threshold       1
Version         1.x.x
Storage Type    inmem
Cluster Name    vault-cluster-xxx
Cluster ID      xxx
HA Enabled      false
```

## Running the Encryption Script

### Option 1: Using Environment Variables
```bash
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='your-root-token-here'
node vault-encryption.js
```

### Option 2: Using Command Line Arguments
```bash
node vault-encryption.js --vault-addr http://127.0.0.1:8200 --vault-token your-token
```

### Test the Connection
```bash
node vault-encryption.js --test
```

## Common Issues and Solutions

### Issue 1: "Connection refused"
**Problem**: Vault server is not running
**Solution**: Start Vault server with `vault server -dev`

### Issue 2: "Permission denied"
**Problem**: Invalid or missing token
**Solution**: Make sure VAULT_TOKEN is set correctly

### Issue 3: "Vault is sealed"
**Problem**: Vault is sealed (production mode)
**Solution**: Unseal Vault or use development mode

### Issue 4: HTTPS/TLS errors
**Problem**: Certificate issues with HTTPS
**Solution**: Use development mode with HTTP or configure proper certificates

## Production Setup (Advanced)

For production use, you'll need to:
1. Initialize and unseal Vault properly
2. Configure authentication methods
3. Set up proper policies
4. Use HTTPS with valid certificates

See HashiCorp's official documentation for production deployment.

## Script Usage Examples

```bash
# Test encryption functionality
node vault-encryption.js --test

# Generate 100 encrypted records (default)
node vault-encryption.js

# Generate 1000 records to custom file
node vault-encryption.js --records 1000 --output large-dataset.csv

# Use custom Vault configuration
VAULT_ADDR='https://vault.company.com' VAULT_TOKEN='real-token' node vault-encryption.js
```