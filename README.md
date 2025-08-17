# @btc-stamps/tx-builder 🚀

<div align="center">

[![npm version](https://img.shields.io/npm/v/@btc-stamps/tx-builder.svg)](https://www.npmjs.com/package/@btc-stamps/tx-builder)
[![JSR](https://jsr.io/badges/@btc-stamps/tx-builder)](https://jsr.io/@btc-stamps/tx-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js CI](https://img.shields.io/github/actions/workflow/status/btc-stamps/tx-builder/ci.yml?branch=main)](https://github.com/btc-stamps/tx-builder/actions)
[![codecov](https://codecov.io/gh/btc-stamps/tx-builder/graph/badge.svg?token=AWB6I9Z0AQ)](https://codecov.io/gh/btc-stamps/tx-builder)

**The Bitcoin transaction builder for Bitcoin Stamps and SRC-20 metaprotocols**

Build Bitcoin transactions with native support for **Bitcoin Stamps**, **SRC-20 tokens**, **Ordinals protection**, and extensible metaprotocol support.

[Installation](#-installation) • [Quick Start](#-quick-start) • [Examples](https://github.com/btc-stamps/tx-builder/tree/main/docs/examples) • [Documentation](https://btc-stamps.github.io/tx-builder)

</div>

---

## 🎯 Why tx-builder?

`@btc-stamps/tx-builder` is the **only** transaction builder with first-class support for Bitcoin Stamp metaprotocols. This can be extended to support other metaprotocols like Runes or BRC-20.

### ✨ Key Features

- **🖼️ Bitcoin Stamps**: Complete Bitcoin Stamp metaprotocol support
- **🪙 SRC-20 Tokens**: Full lifecycle support (deploy, mint, transfer)
- **🛡️ UTXO Protection**: Automatic protection of Ordinals, Inscriptions, Stamps & Counterparty assets
- **⚡ Smart Selection**: 6 UTXO selection algorithms with optimization
- **🔌 Zero Config**: Works out-of-the-box with reliable defaults
- **🧪 Battle-Tested**: Comprehensive test suite with 430+ tests

---

## 📦 Installation

### Node.js / TypeScript

```bash
npm install @btc-stamps/tx-builder
# or
yarn add @btc-stamps/tx-builder
# or
pnpm add @btc-stamps/tx-builder
```

### Deno

```typescript
import { createTransactionBuilder } from 'https://deno.land/x/bitcoin_tx_builder/mod.ts';
```

---

## 🚀 Quick Start

### Bitcoin Stamps with UTXO Protection

```typescript
import { BitcoinStampBuilder, SelectorFactory } from '@btc-stamps/tx-builder';

// Zero-config setup with automatic UTXO protection
const selectorFactory = SelectorFactory.getInstance();
const builder = new BitcoinStampBuilder(network, selectorFactory);

// Build stamp transaction - automatically protects:
// ✅ Ordinals (sats with inscriptions or runes)
// ✅ Bitcoin Stamps (all types)
// ✅ Counterparty assets (XCP, PEPECASH, etc.)
// ✅ SRC-20 tokens
const result = await builder.buildStampTransaction(utxos, {
  stampData: {
    imageData: imageBuffer,
    filename: 'my-stamp.png',
  },
  fromAddress: 'bc1q...',
  feeRate: 20,
  algorithm: 'protection-aware', // Optional: explicitly use protection-aware selection
});
```

### SRC-20 Tokens

```typescript
import { SRC20Encoder, SRC20TokenBuilder } from '@btc-stamps/tx-builder';

const encoder = new SRC20Encoder();

// Deploy new token
const deployData = await encoder.encode({
  p: 'SRC-20',
  op: 'DEPLOY',
  tick: 'KEVIN',
  max: '21000000',
  lim: '1000',
});

// Build transaction
const psbt = await new SRC20TokenBuilder().buildSRC20Transaction({
  encodedData: deployData,
  utxos: selectedUTXOs,
  changeAddress: 'bc1q...',
  feeRate: 15,
});
```

## 🛡️ Advanced UTXO Protection

**Built-in protection** for **Ordinals**, **Inscriptions**, **Stamps**, **Counterparty assets**, and **SRC-20 tokens** is automatic in all builders.

```typescript
// For custom protection configuration:
const selector = selectorFactory.createSelector('protection-aware', {
  protectionConfig: {
    enableOrdinalsDetection: true,     // Detect inscriptions and runes
    enableCounterpartyDetection: true, // Detect UTXO attached assets 
    enableStampsDetection: true,       // Detect UTXO attached stamps
  }
});

// Use with any builder
builder.setSelector(selector);
```

## ⚡ UTXO Selection Algorithms

Optimize transaction fees with multiple selection strategies:

```typescript
import {
  AccumulativeSelector, // Fast selection
  BlackjackSelector, // Target exact amounts
  BranchAndBoundSelector, // Optimal selection
  WasteOptimizedSelector, // Long-term optimization
} from '@btc-stamps/tx-builder';
```

## 🌐 Network Support

**Zero-configuration** with reliable defaults:

```typescript
// Works immediately - no setup required
const provider = new ElectrumXProvider(); // Uses blockstream.info, fortress.qtornado.com, etc.
```

**Networks**: Mainnet, Testnet, Regtest with automatic server selection

---

## 📚 Learn More

- 📖 **[Full Documentation](https://btc-stamps.github.io/tx-builder)** - Complete guides and API reference
- 💡 **[Examples](https://github.com/btc-stamps/tx-builder/tree/main/docs/examples)** - Ready-to-use code examples
- 🛡️ **[UTXO Protection Guide](https://github.com/btc-stamps/tx-builder/blob/main/docs/examples/advanced-transaction-building.ts)** - Essential for production
- 🏗️ **[Architecture Overview](https://github.com/btc-stamps/tx-builder/blob/main/docs/examples/README.md)** - Technical deep dive

---

## 🧪 Testing

```bash
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:coverage # Coverage report
```

## 🤝 Contributing

Contributions welcome! See [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

---

<div align="center">

**GitHub**: [btc-stamps/tx-builder](https://github.com/btc-stamps/tx-builder) • **NPM**: [@btc-stamps/tx-builder](https://www.npmjs.com/package/@btc-stamps/tx-builder) • **JSR**: [@btc-stamps/tx-builder](https://jsr.io/@btc-stamps/tx-builder) • **Telegram**: [@BitcoinStamps](https://t.me/BitcoinStamps)

**Built with ❤️ by the Stampchain team**

</div>
