# @btc-stamps/tx-builder 🚀

<div align="center">

[![npm version](https://img.shields.io/npm/v/@btc-stamps/tx-builder.svg)](https://www.npmjs.com/package/@btc-stamps/tx-builder)
[![npm downloads](https://img.shields.io/npm/dm/@btc-stamps/tx-builder.svg)](https://www.npmjs.com/package/@btc-stamps/tx-builder)
[![npm package size](https://img.shields.io/npm/unpacked-size/@btc-stamps/tx-builder)](https://www.npmjs.com/package/@btc-stamps/tx-builder?activeTab=code)
[![JSR](https://jsr.io/badges/@btc-stamps/tx-builder)](https://jsr.io/@btc-stamps/tx-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js CI](https://img.shields.io/github/actions/workflow/status/btc-stamps/tx-builder/ci.yml?branch=main)](https://github.com/btc-stamps/tx-builder/actions)
[![codecov](https://codecov.io/gh/btc-stamps/tx-builder/graph/badge.svg?token=AWB6I9Z0AQ)](https://codecov.io/gh/btc-stamps/tx-builder)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/btc-stamps/tx-builder/graphs/commit-activity)
[![Dependencies Status](https://img.shields.io/librariesio/release/npm/@btc-stamps/tx-builder)](https://libraries.io/npm/@btc-stamps%2Ftx-builder)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat)](https://github.com/btc-stamps/tx-builder/pulls)

**The Bitcoin transaction builder for Bitcoin Stamps and SRC-20 metaprotocols**

Build Bitcoin transactions with native support for **Bitcoin Stamps**, **SRC-20 tokens**, **Ordinals protection**, and extensible metaprotocol support.

[Installation](#-installation) • [Quick Start](#-quick-start) • [Examples](https://github.com/btc-stamps/tx-builder/tree/main/docs/examples) • [Documentation](https://btc-stamps.github.io/tx-builder) • [API Reference](https://btc-stamps.github.io/tx-builder/api)

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
- **🌳 Tree-Shakeable**: Optimized for modern bundlers with `sideEffects: false`
- **📦 Lightweight**: Minimal dependencies, maximum performance
- **🧪 Battle-Tested**: Comprehensive test suite with 430+ tests
- **🔒 Type-Safe**: Full TypeScript support with detailed types

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
import { TransactionBuilder } from 'npm:@btc-stamps/tx-builder@^0.1.6';
```

### Requirements

- **Node.js** >= 18.0.0 or **Bun** >= 1.0.0
- TypeScript >= 5.0.0 (for TypeScript users)
- **Deno**: Partial support via npm compatibility ([see guide](docs/DENO_USAGE.md))

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
    enableOrdinalsDetection: true, // Detect inscriptions and runes
    enableCounterpartyDetection: true, // Detect UTXO attached assets
    enableStampsDetection: true, // Detect UTXO attached stamps
  },
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

- 📖 **[Documentation Site](https://btc-stamps.github.io/tx-builder)** - Interactive documentation
- 🔌 **[API Reference](https://btc-stamps.github.io/tx-builder/api)** - Complete API documentation
- 💡 **[Examples](https://github.com/btc-stamps/tx-builder/tree/main/docs/examples)** - Ready-to-use code examples
- 🛡️ **[UTXO Protection Guide](https://github.com/btc-stamps/tx-builder/blob/main/docs/examples/advanced-transaction-building.ts)** - Essential for production
- 🏗️ **[Architecture Overview](https://github.com/btc-stamps/tx-builder/blob/main/docs/examples/README.md)** - Technical deep dive
- 📦 **[NPM Package](https://www.npmjs.com/package/@btc-stamps/tx-builder)** - View on npm registry
- 🦕 **[JSR Package](https://jsr.io/@btc-stamps/tx-builder)** - View on JSR (Deno/TypeScript)

---

## 🧪 Testing

```bash
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:coverage # Coverage report
```

## 🤝 Contributing

Contributions welcome! See [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/btc-stamps/tx-builder.git
cd tx-builder

# Install dependencies
npm install

# Run tests
npm test

# Build the package
npm run build
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

## 🙏 Acknowledgments

Built on top of excellent libraries:

- [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) - Bitcoin protocol implementation
- [tiny-secp256k1](https://github.com/bitcoinjs/tiny-secp256k1) - Elliptic curve cryptography
- [bip32](https://github.com/bitcoinjs/bip32) - HD wallet support

## 💬 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/btc-stamps/tx-builder/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/btc-stamps/tx-builder/discussions)
- **Telegram**: [@BitcoinStamps](https://t.me/BitcoinStamps)

---

<div align="center">

**GitHub**: [btc-stamps/tx-builder](https://github.com/btc-stamps/tx-builder) • **NPM**: [@btc-stamps/tx-builder](https://www.npmjs.com/package/@btc-stamps/tx-builder) • **JSR**: [@btc-stamps/tx-builder](https://jsr.io/@btc-stamps/tx-builder) • **Telegram**: [@BitcoinStamps](https://t.me/BitcoinStamps)

**Built with ❤️ by the Stampchain team**

[![Star on GitHub](https://img.shields.io/github/stars/btc-stamps/tx-builder.svg?style=social)](https://github.com/btc-stamps/tx-builder)

</div>
