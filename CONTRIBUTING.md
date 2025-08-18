# Contributing to @btc-stamps/tx-builder

We welcome contributions to the Bitcoin Transaction Builder! This document
provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 18+ or Deno 1.40+
- Git
- Basic understanding of Bitcoin transactions and TypeScript

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/stampchain-io/tx-builder.git
   cd tx-builder
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or for Deno
   deno task deps
   ```

3. **Run tests to verify setup**
   ```bash
   npm test
   # or for Deno
   deno task test
   ```

4. **Start development**
   ```bash
   npm run build:watch
   # Runs TypeScript compiler in watch mode
   ```

## Project Structure

```
src/
├── core/           # Core transaction building logic
│   ├── transaction-builder.ts
│   ├── psbt-builder.ts
│   └── script-builder.ts
├── providers/      # UTXO provider implementations
│   ├── base-provider.ts
│   ├── electrum-provider.ts
│   └── mempool-provider.ts
├── selectors/      # UTXO selection algorithms
│   ├── base-selector.ts
│   ├── branch-and-bound.ts
│   └── accumulative.ts
├── encoders/       # Data encoding protocols
│   ├── stamp-encoder.ts
│   └── src20-encoder.ts
├── interfaces/     # TypeScript interfaces
├── utils/          # Utility functions
└── errors/         # Custom error classes

tests/
├── unit/           # Unit tests
├── integration/    # Integration tests
└── e2e/           # End-to-end tests

examples/           # Usage examples
docs/              # Documentation
```

## Development Guidelines

### Code Style

We use ESLint and Prettier for consistent code formatting:

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### TypeScript Standards

- Use strict TypeScript configuration
- Provide comprehensive JSDoc comments for public APIs
- Export interfaces for all public types
- Use dependency injection patterns

Example:

```typescript
/**
 * Select UTXOs for a transaction using Branch & Bound algorithm
 * @param utxos - Available UTXOs to select from
 * @param options - Selection criteria and constraints
 * @returns Selection result or null if impossible
 */
export function selectUTXOs(
  utxos: UTXO[],
  options: SelectionOptions,
): SelectionResult | null {
  // Implementation
}
```

### Testing Requirements

All contributions must include appropriate tests:

- **Unit tests**: Test individual functions and classes
- **Integration tests**: Test component interactions
- **Property-based tests**: For algorithm correctness

Test naming convention:

```typescript
describe('BranchAndBoundSelector', () => {
  describe('select', () => {
    it('should find changeless solution when possible', () => {
      // Test implementation
    });

    it('should handle insufficient funds gracefully', () => {
      // Test implementation
    });
  });
});
```

### Performance Considerations

- Algorithm implementations should handle 1000+ UTXOs efficiently
- Use lazy evaluation where appropriate
- Include performance benchmarks for new algorithms
- Memory usage should be reasonable for large UTXO sets

## Contribution Types

### Bug Fixes

1. Create an issue describing the bug
2. Write failing tests that demonstrate the bug
3. Fix the bug ensuring tests pass
4. Update documentation if needed

### New Features

1. Discuss the feature in an issue first
2. Follow the existing architecture patterns
3. Implement comprehensive tests
4. Add examples to demonstrate usage
5. Update documentation

### Algorithm Implementations

New UTXO selection algorithms should:

1. Extend `BaseSelector` class
2. Implement the `IUTXOSelector` interface
3. Include comprehensive unit tests
4. Add performance benchmarks
5. Provide usage examples

Example structure:

```typescript
export class NewAlgorithmSelector extends BaseSelector {
  getName(): string {
    return 'new-algorithm';
  }

  select(utxos: UTXO[], options: SelectionOptions): SelectionResult | null {
    // Algorithm implementation
    return this.createResult(selectedUTXOs, targetValue, feeRate, hasChange);
  }
}
```

### Provider Implementations

New UTXO providers should:

1. Implement the `IUTXOProvider` interface
2. Extend `BaseProvider` if applicable
3. Include comprehensive error handling
4. Add integration tests
5. Document API endpoints used

## Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow coding standards
   - Include tests
   - Update documentation

3. **Test thoroughly**
   ```bash
   npm run test
   npm run test:integration
   npm run lint
   npm run type-check
   ```

4. **Commit with clear messages**
   ```bash
   git commit -m "feat: add new UTXO selection algorithm"
   ```

   Use conventional commit format:
   - `feat:` New features
   - `fix:` Bug fixes
   - `docs:` Documentation changes
   - `test:` Test additions/modifications
   - `refactor:` Code refactoring
   - `perf:` Performance improvements

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **PR Requirements**
   - Clear title and description
   - Link related issues
   - Include test results
   - Update CHANGELOG.md
   - Request review from maintainers

## Testing Guidelines

### Unit Tests

Focus on testing individual functions and classes in isolation:

```typescript
import { AccumulativeSelector } from '../src/selectors';

describe('AccumulativeSelector', () => {
  let selector: AccumulativeSelector;

  beforeEach(() => {
    selector = new AccumulativeSelector();
  });

  it('should select UTXOs until target is reached', () => {
    const utxos = [
      { txid: '1', vout: 0, value: 10000, scriptPubKey: '...' },
      { txid: '2', vout: 0, value: 20000, scriptPubKey: '...' },
    ];

    const result = selector.select(utxos, {
      targetValue: 25000,
      feeRate: 10,
    });

    expect(result).toBeDefined();
    expect(result!.totalValue).toBeGreaterThanOrEqual(25000);
  });
});
```

### Integration Tests

Test component interactions and real-world scenarios:

```typescript
describe('TransactionBuilder Integration', () => {
  it('should build complete transaction with UTXO selection', async () => {
    const provider = new MockProvider();
    const builder = createTransactionBuilder(networks.testnet);

    // Test full transaction building process
  });
});
```

### Performance Tests

Include benchmarks for critical algorithms:

```typescript
describe('Selection Performance', () => {
  it('should handle 1000 UTXOs in under 50ms', () => {
    const utxos = generateMockUTXOs(1000);
    const selector = new BranchAndBoundSelector();

    const start = performance.now();
    selector.select(utxos, { targetValue: 100000, feeRate: 10 });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
  });
});
```

## Documentation

### API Documentation

Use JSDoc comments for all public APIs:

````typescript
/**
 * Creates a new transaction builder instance
 *
 * @param network - Bitcoin network (mainnet, testnet, regtest)
 * @returns Configured transaction builder
 *
 * @example
 * ```typescript
 * const builder = createTransactionBuilder(networks.bitcoin);
 * ```
 */
export function createTransactionBuilder(network: Network): TransactionBuilder {
  // Implementation
}
````

### Examples

Include practical examples for new features:

```typescript
// examples/new-feature.ts
import { NewFeature } from '@btc-stamps/tx-builder';

async function demonstrateNewFeature() {
  // Clear, working example
}
```

## Release Process

We use a dual-branch strategy (`dev` → `main`) with automated releases to npm and JSR.

**For detailed release instructions, see [docs/publishing/RELEASING.md](docs/publishing/RELEASING.md)**

### Quick Release Guide

#### 1. Feature Development

```bash
# Create feature branch from dev
git checkout dev && git pull origin dev
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: your feature description"
```

#### 2. Merge Feature to Dev

```bash
# Push feature branch
git push origin feature/your-feature-name

# Create PR to dev branch
gh pr create --base dev --head feature/your-feature-name \
  --title "feat: your feature" \
  --body "Description of changes"

# Review and merge (regular merge is fine for dev)
gh pr merge [PR-NUMBER] --merge
```

#### 3. Prepare Release from Dev to Main

```bash
# Ensure dev is up to date
git checkout dev && git pull origin dev

# Create PR from dev to main
gh pr create --base main --head dev \
  --title "chore: release vX.X.X" \
  --body "Release notes describing all changes"

# IMPORTANT: Always squash merge to keep main clean
gh pr merge [PR-NUMBER] --squash --admin
```

#### 4. Sync Dev After Squash

```bash
# Note: This is now automated via post-release-sync.yml workflow
# Manual sync only needed if automation fails:
git checkout main && git pull origin main
git checkout dev
git reset --hard origin/main
git push origin dev --force-with-lease
```

#### 5. Run Release

```bash
# From main branch, trigger release workflow
gh workflow run release.yml --field version_bump=patch --field dry_run=false
```

The workflow automatically handles versioning, publishing, and creates a PR with updates.
See [docs/publishing/RELEASING.md](docs/publishing/RELEASING.md) for full details.

## Getting Help

- **Issues**: Report bugs or request features
- **Discussions**: Ask questions or propose ideas
- **Discord**: Join our community (link in README)
- **Email**: Contact maintainers for security issues

## Code of Conduct

This project follows the
[Contributor Covenant](https://www.contributor-covenant.org/) code of conduct.
Be respectful and inclusive in all interactions.

## Recognition

Contributors will be recognized in:

- CHANGELOG.md for their contributions
- README.md contributors section
- Git commit history

Thank you for contributing to @btc-stamps/tx-builder! 🚀
