# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-08-16

### Added

- Initial public release of @btc-stamps/tx-builder
- Core transaction building functionality with PSBT support
- Multiple UTXO selection algorithms:
  - Branch and Bound (optimal selection)
  - Knapsack (combination-based selection)
  - Single Random Draw (SRD)
  - Consolidation (UTXO consolidation)
  - Output Group (privacy-preserving)
  - Tax-optimized (FIFO/LIFO strategies)
  - Protection-aware (ordinals/inscriptions/stamps protection)
- Provider abstractions:
  - ElectrumX provider with real-time fee estimation
  - Mempool.space provider
  - Blockstream provider
  - Fallback provider with automatic failover
- Data encoders:
  - Bitcoin Stamps encoder (full protocol support)
  - SRC-20 encoder (deploy, mint, transfer operations)
  - OP_RETURN encoder
  - P2WSH encoder for witness scripts
  - Counterparty encoding support
- Asset validation service:
  - CPID validation and generation
  - Counterparty API integration
  - Collision-free asset name generation
- Enhanced error handling:
  - Structured selection results
  - Detailed failure reasons
  - Recovery suggestions
- Comprehensive TypeScript types and interfaces
- Support for both Node.js and Deno runtimes
- Extensive test coverage (448+ tests)
- Documentation and examples

### Features

- **UTXO Protection**: Built-in protection for valuable ordinals, inscriptions, and stamps
- **Fee Optimization**: Multiple fee estimation providers with fallback support
- **SRC-20 Support**: Full support for SRC-20 token operations
- **Asset Validation**: Automatic CPID validation and generation
- **Performance**: Parallel UTXO selection with algorithm comparison
- **Type Safety**: Full TypeScript support with strict typing
- **Cross-Platform**: Works in Node.js, Deno, and browsers

### Architecture

- Clean architecture with dependency injection
- Separation of concerns between core logic, providers, selectors, and encoders
- Extensible design for custom implementations
- Performance monitoring and optimization
- Robust error handling and recovery

### Documentation

- Comprehensive README with quick start guide
- API documentation with TypeDoc
- Multiple usage examples for all features
- Architecture documentation in docs/
- Migration guides and best practices
