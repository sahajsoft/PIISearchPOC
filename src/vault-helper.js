#!/usr/bin/env node

const https = require('https');
const http = require('http');

// Function to test Vault connection
async function testVaultConnection(addr, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(addr + '/v1/sys/health');
        const options = {
            method: 'GET',
            headers: token ? { 'X-Vault-Token': token } : {},
            rejectUnauthorized: false // Allow self-signed certificates
        };

        const client = url.protocol === 'https:' ? https : http;

        const req = client.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        data: response,
                        success: res.statusCode < 400
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        data: data,
                        success: res.statusCode < 400
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Connection timeout'));
        });

        req.end();
    });
}

async function main() {
    console.log('🔍 HashiCorp Vault Connection Helper');
    console.log('====================================\n');

    const addresses = [
        'http://127.0.0.1:8200',
        'https://127.0.0.1:8200'
    ];

    for (const addr of addresses) {
        console.log(`Testing connection to: ${addr}`);

        try {
            const result = await testVaultConnection(addr);

            if (result.success) {
                console.log(`✅ Connection successful!`);
                console.log(`   Status: ${result.statusCode}`);
                console.log(`   Sealed: ${result.data.sealed || 'unknown'}`);
                console.log(`   Version: ${result.data.version || 'unknown'}\n`);

                // Show environment setup
                console.log('🔧 Environment setup:');
                console.log(`export VAULT_ADDR="${addr}"`);
                console.log('export VAULT_TOKEN="root"\n');

                // If it's the dev server
                if (addr.includes('http://') && !result.data.sealed) {
                    console.log('💡 This appears to be a development server.');
                    console.log('   For dev mode, use the root token provided when you started Vault.\n');
                }

                break;
            } else {
                console.log(`❌ Connection failed (${result.statusCode})`);
                if (result.data.errors) {
                    console.log(`   Error: ${result.data.errors.join(', ')}`);
                }
            }
        } catch (error) {
            console.log(`❌ Connection failed: ${error.message}`);
        }
        console.log('');
    }

    // Show how to start Vault in dev mode
    console.log('📖 If Vault is not running, start it in development mode:');
    console.log('   vault server -dev');
    console.log('');
    console.log('   This will output a root token that you can use.');
    console.log('');

    // Show next steps
    console.log('🚀 Next steps:');
    console.log('1. Set the environment variables shown above');
    console.log('2. Test with: node vault-encryption.js --test');
    console.log('3. Generate encrypted data: node vault-encryption.js');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testVaultConnection };