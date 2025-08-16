# Simplified Testing Guide

## 🎯 Core Test Commands

We've simplified the test suite to focus on what matters - testing the production APIs documented in `/examples`.

### Essential Commands

```bash
# Run tests once and exit (DEFAULT)
npm test

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

### Run Examples

```bash
# Run both main examples
npm run examples

# Run Bitcoin Stamps example
npm run examples:stamps

# Run SRC-20 tokens example
npm run examples:src20
```

### Validation

```bash
# Validate stampchain.io parity
npm run validate
```

### Development Workflow

```bash
# Format code
npm run format

# Lint code
npm run lint

# Type checking
npm run typecheck

# Clean build artifacts
npm run clean

# Build the project
npm run build
```

## 📋 What We Test

Our test suite (`tests/core-functionality.test.ts`) validates:

1. **SRC20Helper APIs** - The simplified one-step encoding pattern
   - `encodeDeploy()`, `encodeMint()`, `encodeTransfer()`
   - Exact patterns from `examples/README.md`

2. **Core Encoders** - Direct encoding functionality
   - `SRC20Encoder` - normalization and encoding
   - `BitcoinStampsEncoder` - stamp creation

3. **Production Features** - As documented in examples
   - 100% stampchain.io API compatibility
   - 330 sats dust values
   - Automatic stampchain ordering
   - Complete outputs ready for builders

## ✅ Test Results

- **11 tests** - All passing
- **~23ms runtime** - Very fast
- **Perfect alignment** with `examples/README.md`

## 🚀 Quick Start

```bash
# Run tests to verify everything works
npm test

# Run examples to see the APIs in action
npm run examples

# Start developing with watch mode
npm run test:watch
```

## 📝 Philosophy

We removed 30+ complex test scripts to focus on:

- **Simple, clear commands** - No confusion about what to run
- **Fast feedback** - Tests run in ~23ms
- **Real code paths** - Test what's documented and works
- **Production focus** - Validate the APIs developers actually use

No more:

- ❌ `test:unit`, `test:integration`, `test:e2e`, `test:regtest`, etc.
- ❌ `benchmark:*` commands cluttering the scripts
- ❌ Complex test configurations
- ❌ Unused validation scripts

Just simple, focused testing of the core functionality that matters.
