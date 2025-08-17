# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2025-08-17

### Added
- JSR (Deno) registry support with full compatibility
- Codecov integration for test coverage reporting
- JSR badge in README
- Cross-platform timer utilities for Deno/Node compatibility

### Fixed
- Timer compatibility issues between Deno and Node.js environments
- TypeScript override modifiers for JSR compatibility
- GitHub Pages documentation links now properly point to GitHub for TypeScript source files
- README links now use absolute GitHub URLs for JSR/npm compatibility

### Changed
- Documentation links updated to work across all platforms (GitHub, npm, JSR)
- Improved Codecov configuration with proper ignore patterns
- Documentation structure cleaned up with outdated docs archived

## [0.1.2] - 2025-08-17

### Fixed
- Import extensions changed from .js to .ts for Deno compatibility
- Timer utility functions for cross-platform support
- TypeScript type casting for timer returns

### Changed
- Version sync between package.json and deno.json

## [0.1.1] - 2025-08-17

### Fixed
- Corrected import extensions from .js to .ts for module resolution
- Updated all relative imports to include .ts extension
- Fixed version synchronization between package.json and deno.json

### Changed
- Squashed commits for cleaner release history
- Initial GitHub Pages deployment
- Examples moved under docs/ directory

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

---

## Links

[0.1.3]: https://github.com/btc-stamps/tx-builder/compare/v0.1.1...v0.1.3
[0.1.2]: https://github.com/btc-stamps/tx-builder/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/btc-stamps/tx-builder/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/btc-stamps/tx-builder/releases/tag/v0.1.0
