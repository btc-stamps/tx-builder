# Architectural Decision: Deno Support Scope

**Date**: August 2025\
**Status**: Decided\
**Decision**: Partial support only (via npm: compatibility)

## Full Deno Support Analysis

## Current Blockers

### 1. Node.js Import Style (60+ files)

```typescript
// Current (everywhere in codebase)
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import * as zlib from 'node:zlib';

// Deno needs
import { Buffer } from 'npm:buffer';
// OR with proper import maps
```

### 2. TCP Networking (ElectrumX Providers)

```typescript
// Current - uses node:net and node:tls
import * as net from 'node:net';
import * as tls from 'node:tls';

// Deno - has Deno.connect() but different API
```

### 3. File System Operations

```typescript
// Current
import * as fs from 'node:fs';
import * as path from 'node:path';

// Deno - has Deno.readFile() but different API
```

## What Would Full Deno Support Require?

### Option A: Minimal Changes (~1 week)

**Use npm: specifiers everywhere**

```typescript
// Change all imports from:
import { Buffer } from 'node:buffer';
// To:
import { Buffer } from 'npm:buffer@6';
```

**Effort**:

- Update 60+ import statements
- Test everything still works
- Document Deno usage

**Problems**:

- TCP providers still won't work
- Not "native" Deno (using npm compatibility layer)
- Requires `--allow-read --allow-net` permissions

### Option B: Compatibility Layer (~2 weeks)

**Create abstraction for Node.js APIs**

```typescript
// src/compat/buffer.ts
export const Buffer = globalThis.Buffer ||
  (await import('npm:buffer@6')).Buffer;

// src/compat/crypto.ts
export const createHash = globalThis.crypto?.subtle
  ? denoCreateHash
  : (await import('node:crypto')).createHash;
```

**Effort**:

- Create compat layer for all Node APIs
- Update all imports to use compat layer
- Maintain two code paths

**Benefits**:

- Works in both Node and Deno
- Can optimize for each platform
- Still one codebase

### Option C: Full Native Deno (~4-6 weeks)

**Rewrite using Deno-native APIs**

```typescript
// Use Deno's built-in APIs
const data = await Deno.readFile('./config.json');
const conn = await Deno.connectTls({ hostname, port });

// Use Web Crypto API
const hash = await crypto.subtle.digest('SHA-256', data);
```

**Effort**:

- Rewrite TCP providers for Deno.connect()
- Replace Buffer with Uint8Array everywhere
- Use Web Crypto API instead of node:crypto
- Create Deno-specific build

**This is essentially the same as migrating to bitcoinjs-lib v7!**

## The TCP Provider Problem

The biggest blocker is ElectrumX TCP connections:

### Node.js Version

```typescript
const socket = tls.connect(port, host);
socket.write(JSON.stringify(request) + '\n');
```

### Deno Version Would Need

```typescript
const conn = await Deno.connectTls({ hostname, port });
const writer = conn.writable.getWriter();
await writer.write(new TextEncoder().encode(JSON.stringify(request) + '\n'));
```

**This would require**:

- Separate provider implementations
- Different error handling
- Different stream APIs

## Realistic Assessment

### Is Full Deno Support Worth It?

**No, probably not** because:

1. **Huge effort** - 2-6 weeks depending on approach
2. **TCP providers** - Would need complete rewrite
3. **Small benefit** - Deno users can use Node compatibility mode
4. **Better alternative** - They could use HTTP-based providers

### What We Could Do Instead

#### 1. Document Deno Usage with npm: (1 hour)

```typescript
// deno.json
{
  "imports": {
    "@btc-stamps/tx-builder": "npm:@btc-stamps/tx-builder"
  }
}

// Usage
import { TransactionBuilder } from "@btc-stamps/tx-builder";
// Works but no TCP providers
```

#### 2. Create HTTP-Only Build (1 week)

- Extract core transaction building
- Remove TCP providers
- Create Deno-friendly entry point
- Use fetch() instead of TCP

#### 3. Wait for Better Tooling

- Deno's Node compatibility improves constantly
- Maybe `node:` imports will work natively soon
- Let the ecosystem solve it

## Recommendation

**Don't pursue full Deno support now**. Instead:

1. **Document current limitations** ✅ (already done in README)
2. **Suggest alternatives** for Deno users:
   - Use HTTP-based UTXO providers
   - Use the package for transaction building only
   - Fetch UTXOs separately
3. **Consider HTTP-only build** if demand exists
4. **Wait for ecosystem** to standardize on Uint8Array

The effort (2-6 weeks) doesn't justify the benefit when:

- Bun works perfectly as a Node alternative
- Deno users can use npm: compatibility
- Core features work, just not TCP

## Summary

**Full Deno support = Big lift? YES**

- Minimum 2 weeks for hacky support
- 4-6 weeks for proper native support
- TCP providers need complete rewrite
- Essentially same work as bitcoinjs-lib v7 migration

**Better to**: Keep current approach, document limitations, let Deno users use npm: compatibility for core features.
