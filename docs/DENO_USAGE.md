# Using @btc-stamps/tx-builder with Deno

## Overview

This package has **partial Deno support** through npm compatibility. Core transaction building features work, but TCP-based providers (ElectrumX) are not compatible.

## Installation Methods

### Method 1: Direct npm Import (Recommended)

```typescript
// Direct import from npm
import {
  BitcoinStampBuilder,
  ScriptBuilder,
  SRC20TokenBuilder,
  TransactionBuilder,
  // ... other exports
} from 'npm:@btc-stamps/tx-builder@^0.1.6';
```

### Method 2: Import Map

Create a `deno.json` or import map file:

```json
{
  "imports": {
    "@btc-stamps/tx-builder": "npm:@btc-stamps/tx-builder@^0.1.6",
    "@btc-stamps/tx-builder/": "npm:/@btc-stamps/tx-builder@^0.1.6/"
  }
}
```

Then import normally:

```typescript
import { TransactionBuilder } from '@btc-stamps/tx-builder';
import { ScriptBuilder } from '@btc-stamps/tx-builder/core';
```

### Method 3: From JSR (When Published)

```typescript
import { TransactionBuilder } from 'jsr:@btc-stamps/tx-builder@^0.1.6';
```

## What Works ✅

### Core Transaction Building

```typescript
import { TransactionBuilder } from "npm:@btc-stamps/tx-builder@^0.1.6";
import * as bitcoin from "npm:bitcoinjs-lib@^6.1.5";

const builder = new TransactionBuilder({
  network: bitcoin.networks.bitcoin,
  dustThreshold: 546,
  defaultFeeRate: 15
});

// Build PSBTs
const psbt = await builder.create({
  inputs: [...],
  outputs: [...],
  changeAddress: "bc1q..."
});
```

### Bitcoin Stamps

```typescript
import { BitcoinStampBuilder } from 'npm:@btc-stamps/tx-builder@^0.1.6';

const stampBuilder = new BitcoinStampBuilder(network);

// Create stamp transactions (provide your own UTXOs)
const stampTx = await stampBuilder.buildStampTransaction(
  utxos, // You need to fetch these separately
  recipientAddress,
  stampData,
  changeAddress,
  feeRate,
);
```

### SRC-20 Tokens

```typescript
import { SRC20TokenBuilder } from 'npm:@btc-stamps/tx-builder@^0.1.6';

const tokenBuilder = new SRC20TokenBuilder(network);

// Build token transactions
const tokenTx = await tokenBuilder.buildSendTransaction(
  utxos, // Provide your own
  recipientAddress,
  amount,
  ticker,
  changeAddress,
);
```

### Script Building

```typescript
import { ScriptBuilder } from 'npm:@btc-stamps/tx-builder@^0.1.6';

const scriptBuilder = new ScriptBuilder();
const multisigScript = scriptBuilder.createMultisigScript(2, publicKeys);
```

### UTXO Selection Algorithms

```typescript
import {
  AccumulativeSelector,
  BlackjackSelector,
  BranchAndBoundSelector,
} from 'npm:@btc-stamps/tx-builder@^0.1.6';

const selector = new AccumulativeSelector();
const result = selector.select(utxos, {
  targetValue: 100000,
  feeRate: 15,
  maxInputs: 10,
  dustThreshold: 546,
});
```

## What Doesn't Work ❌

### TCP-Based Providers

```typescript
// ❌ These will NOT work in Deno
import { ElectrumXProvider } from 'npm:@btc-stamps/tx-builder@^0.1.6';

// node:net and node:tls are not compatible
const provider = new ElectrumXProvider(); // Will throw error
```

## Alternative: HTTP-Based UTXO Fetching

Since ElectrumX TCP providers don't work, use HTTP APIs instead:

### Option 1: Fetch from Blockchain APIs

```typescript
// Use any HTTP-based blockchain API
const response = await fetch(`https://api.blockcypher.com/v1/btc/main/addrs/${address}/full`);
const data = await response.json();

// Transform to UTXO format
const utxos = data.txrefs.map((tx) => ({
  txid: tx.tx_hash,
  vout: tx.tx_output_n,
  value: tx.value,
  scriptPubKey: tx.script,
  confirmations: tx.confirmations,
}));
```

### Option 2: Use Stampchain API

```typescript
// If you have stampchain-api running
const response = await fetch(`https://stampchain.io/api/v2/utxos/${address}`);
const utxos = await response.json();

// Use with tx-builder
import { TransactionBuilder } from 'npm:@btc-stamps/tx-builder@^0.1.6';
const builder = new TransactionBuilder(config);
const psbt = builder.buildFromUTXOs(utxos, outputs, changeAddress);
```

### Option 3: ElectrumX over HTTP Proxy

```typescript
// If you have an HTTP proxy for ElectrumX
async function fetchUTXOs(address: string) {
  const response = await fetch('https://your-electrumx-proxy.com/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'blockchain.scripthash.listunspent',
      params: [getScriptHash(address)],
    }),
  });
  return await response.json();
}
```

## Complete Deno Example

```typescript
// example.ts
import { AccumulativeSelector, BitcoinStampBuilder } from 'npm:@btc-stamps/tx-builder@^0.1.6';
import * as bitcoin from 'npm:bitcoinjs-lib@^6.1.5';

// Fetch UTXOs via HTTP (not TCP)
async function getUTXOs(address: string) {
  // Use your preferred HTTP API
  const response = await fetch(`https://your-api.com/utxos/${address}`);
  return await response.json();
}

// Build a stamp transaction
async function createStamp() {
  const network = bitcoin.networks.bitcoin;
  const builder = new BitcoinStampBuilder(network);

  // Get UTXOs via HTTP
  const utxos = await getUTXOs('bc1q...');

  // Select UTXOs
  const selector = new AccumulativeSelector();
  const selection = selector.select(utxos, {
    targetValue: 600000, // Stamp value + fee
    feeRate: 15,
    maxInputs: 10,
    dustThreshold: 546,
  });

  if (!selection.success) {
    throw new Error(`Selection failed: ${selection.reason}`);
  }

  // Build stamp transaction
  const stampData = {
    dataUrl: 'data:image/png;base64,...',
  };

  const psbt = await builder.buildStampTransaction(
    selection.inputs!,
    'bc1qrecipient...',
    stampData,
    'bc1qchange...',
    15,
  );

  return psbt;
}

// Run with Deno
if (import.meta.main) {
  const psbt = await createStamp();
  console.log('PSBT created:', psbt.toBase64());
}
```

Run with:

```bash
deno run --allow-net example.ts
```

## Permissions Required

When running Deno scripts using this package:

```bash
# Minimum permissions
deno run --allow-net --allow-read your-script.ts

# If using environment variables
deno run --allow-net --allow-read --allow-env your-script.ts
```

## Common Issues and Solutions

### Issue: "Cannot find module 'node:buffer'"

**Solution**: Use npm: imports as shown above

### Issue: "ElectrumXProvider is not a constructor"

**Solution**: TCP providers don't work in Deno. Use HTTP alternatives.

### Issue: "Cannot read file"

**Solution**: Add `--allow-read` permission

### Issue: Type errors with Bitcoin libraries

**Solution**: You may need to add type declarations:

```typescript
// @deno-types="npm:@types/bitcoinjs-lib@^5.0.0"
import * as bitcoin from 'npm:bitcoinjs-lib@^6.1.5';
```

## For stampchain-api Integration

Since stampchain-api needs to use this package in Deno:

1. **Use HTTP-based UTXO fetching** (you probably already do this)
2. **Import only what you need** to minimize compatibility issues
3. **Consider creating a wrapper** that handles Deno-specific concerns

Example wrapper for stampchain-api:

```typescript
// stampchain-api/lib/tx-builder-wrapper.ts
import { 
  TransactionBuilder,
  BitcoinStampBuilder,
  SRC20TokenBuilder 
} from "npm:@btc-stamps/tx-builder@^0.1.6";

// Re-export only Deno-compatible parts
export { TransactionBuilder, BitcoinStampBuilder, SRC20TokenBuilder };

// Add stampchain-specific helpers
export async function buildStampWithHTTPProvider(
  address: string,
  stampData: any,
  options: any
) {
  // Fetch UTXOs via your existing HTTP endpoints
  const utxos = await fetch(`/api/v2/utxos/${address}`).then(r => r.json());
  
  // Use tx-builder with fetched UTXOs
  const builder = new BitcoinStampBuilder(options.network);
  return builder.buildStampTransaction(utxos, ...);
}
```

## Summary

- ✅ **Core features work** - Transaction building, PSBT creation, script generation
- ✅ **Algorithms work** - All UTXO selection strategies
- ❌ **TCP providers don't work** - Use HTTP alternatives
- 📦 **Use npm: imports** - Direct or via import map
- 🔐 **Permissions** - Need --allow-net and --allow-read minimum
