# TX-Builder Validation Scripts

This directory contains validation scripts to ensure tx-builder compatibility with production Bitcoin Stamps and SRC-20 ecosystems.

## Quick Start

```bash
# Run all validations (recommended)
npx tsx scripts/validate-all.ts

# Quick local validation only
npx tsx scripts/validate-all.ts --quick

# Full production API testing
npx tsx scripts/validate-all.ts --api
```

## Primary Validation Scripts

### 🎯 validate-all.ts

**Master validation script that runs all core validations**

```bash
# Run all validation scripts in sequence
npx tsx scripts/validate-all.ts

# Run with specific options
npx tsx scripts/validate-all.ts --quick
npx tsx scripts/validate-all.ts --api
```

**Features:**

- ✅ Orchestrates all validation scripts
- ✅ Provides comprehensive test results
- ✅ Supports quick vs full API testing
- ✅ Includes error handling and reporting

### 🔍 validate-production-endpoints.ts

**Comprehensive validation against real production endpoints**

```bash
npx tsx scripts/validate-production-endpoints.ts
```

**Features:**

- ✅ Tests against real Counterparty and Stampchain endpoints
- ✅ ElectrumX connectivity validation
- ✅ SRC-20 encoding validation
- ✅ Production API compatibility checks

### 🔍 validate-stampchain-master.ts

**Detailed API validation with extensive comparison**

```bash
npx tsx scripts/validate-stampchain-master.ts
```

**Features:**

- ✅ Comprehensive stampchain API testing
- ✅ Detailed output comparison
- ✅ Multiple parameter variations
- ✅ Real UTXO fetching via ElectrumX

### 🔍 validate-real-stampchain.ts

**Real-world stampchain compatibility validation**

```bash
npx tsx scripts/validate-real-stampchain.ts
```

**Features:**

- ✅ Tests against live stampchain.io API
- ✅ Validates transaction structure compatibility
- ✅ Compares encoding outputs
- ✅ Uses real network data

### ⚡ validate-stampchain-parity.ts

**Quick verification of core stampchain compatibility**

```bash
npx tsx scripts/validate-stampchain-parity.ts
```

**Features:**

- Fast local validation
- No external dependencies
- Good for CI/CD pipelines

### 🧪 validate-output-ordering.ts

**Test transaction output ordering**

```bash
npx tsx scripts/validate-output-ordering.ts
```

Verifies correct output ordering for DEPLOY, MINT, and TRANSFER operations.

### 🧪 validate-kevin-transfer.ts

**Tests specific KEVIN token transfers**

```bash
npx tsx scripts/validate-kevin-transfer.ts
```

**Features:**

- ✅ SRC-20 TRANSFER operation validation
- ✅ Real transaction encoding tests
- ✅ Token-specific test cases

### 🔗 validate-counterparty-encoding.ts

**Validates Counterparty protocol encoding compatibility**

```bash
npx tsx scripts/validate-counterparty-encoding.ts
```

**Features:**

- ✅ Counterparty protocol encoding validation
- ✅ Binary data encoding tests
- ✅ Protocol compliance checks

### ⚡ validate-electrumx-reliability.ts

**Tests ElectrumX connection reliability and performance**

```bash
npx tsx scripts/validate-electrumx-reliability.ts
```

**Features:**

- ✅ ElectrumX server connectivity tests
- ✅ Connection reliability validation
- ✅ Network performance measurements

### 📋 validate-import-maps.ts

**Validates Deno import map configuration**

```bash
npx tsx scripts/validate-import-maps.ts
```

**Features:**

- ✅ Import map syntax validation
- ✅ Module resolution testing
- ✅ Deno compatibility checks

## Development & Build Scripts

### 🔧 setup-local-imports.sh

**Sets up local npm link for development**

```bash
# Make executable and run
chmod +x scripts/setup-local-imports.sh
./scripts/setup-local-imports.sh
```

**Features:**

- ✅ Creates local npm link
- ✅ Builds package for development
- ✅ Enables local testing before publish

### 📝 sync-version.js

**Synchronizes versions between package.json and deno.json**

```bash
node scripts/sync-version.js
```

**Features:**

- ✅ Ensures version consistency
- ✅ Validates JSON syntax
- ✅ Automatic version synchronization

### 🚀 validate-release-setup.js

**Validates package is ready for release**

```bash
node scripts/validate-release-setup.js
```

**Features:**

- ✅ Checks required files exist
- ✅ Validates package configuration
- ✅ Pre-release verification

## Environment Variables

```bash
# Optional: Specify funded address for API testing
export FUNDED_ADDRESS="bc1qhhv6rmxvq5mj2fc3zne2gpjqduy45urapje64m"

# ElectrumX configuration (optional)
export ELECTRUMX_SERVERS="electrum.blockstream.info:50002:ssl"
```

## Required for API Testing

1. **Funded Bitcoin Address**: The default test address must have UTXOs
   - Default: `bc1qhhv6rmxvq5mj2fc3zne2gpjqduy45urapje64m`
   - Set via `FUNDED_ADDRESS` environment variable

2. **ElectrumX Connection**: For fetching UTXOs
   - Configured automatically
   - Override with `ELECTRUMX_SERVERS` if needed

3. **Internet Connection**: For stampchain.io API calls

## Validation Criteria

The scripts validate that tx-builder produces transactions with:

1. **Correct Dust Value**: 330 sats (standardized across ecosystem)
2. **Correct Length Prefix**: `[0x00, single_byte]` format
3. **Correct Output Ordering**:
   - DEPLOY: P2WPKH to sender first
   - MINT: P2WPKH to sender first
   - TRANSFER: P2WPKH to recipient first
4. **Matching Output Structure**: Same as stampchain.io API

## CI/CD Integration

For continuous integration (quick validation):

```yaml
# GitHub Actions example
- name: Validate TX-Builder Compatibility
  run: |
    npm install
    npx tsx scripts/validate-all.ts --quick
```

For full API validation in CI (requires funded address):

```yaml
- name: Full Production Validation
  env:
    FUNDED_ADDRESS: ${{ secrets.FUNDED_ADDRESS }}
  run: |
    npm install
    npx tsx scripts/validate-all.ts --api
```

For release validation:

```yaml
- name: Validate Release Setup
  run: |
    node scripts/sync-version.js
    node scripts/validate-release-setup.js
```
