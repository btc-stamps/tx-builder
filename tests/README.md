# tx-builder Integration Test Suite

This comprehensive integration test suite validates the tx-builder library
through multiple testing approaches, ensuring reliability and correctness for
production use.

## Test Structure

### 📁 Directory Organization

```
tests/
├── unit/                     # Unit tests for individual components
├── integration/              # Integration tests for component interactions
├── regtest/                  # Bitcoin regtest network integration
├── benchmarks/               # Performance benchmarking tests
├── property-based/           # Fuzz testing and property validation
├── e2e/                      # End-to-end workflow tests
└── fixtures/                 # Test data and utilities
```

## 🧪 Test Categories

### 1. Unit Tests (`unit/`)

- **Coverage**: Individual functions and classes
- **Focus**: Logic correctness, error handling, edge cases
- **Speed**: Fast execution (< 1s per test)
- **Examples**: UTXO selectors, fee calculators, encoders

### 2. Integration Tests (`integration/`)

- **Coverage**: Component interactions and workflows
- **Focus**: Cross-component compatibility and data flow
- **Speed**: Medium execution (1-10s per test)
- **Examples**: Transaction building pipelines, PSBT workflows

### 3. Regtest Integration (`regtest/`)

- **Coverage**: Real Bitcoin network simulation
- **Focus**: End-to-end transaction validation
- **Speed**: Slow execution (10-60s per test)
- **Requirements**: Docker, Bitcoin Core regtest network

### 4. Performance Benchmarks (`benchmarks/`)

- **Coverage**: Performance comparison and stress testing
- **Focus**: Speed, memory usage, scalability
- **Speed**: Variable (1-300s per benchmark)
- **Comparison**: Against existing libraries

### 5. Property-Based Testing (`property-based/`)

- **Coverage**: Algorithm correctness under random conditions
- **Focus**: Mathematical invariants and edge case discovery
- **Speed**: Medium to slow (10-120s per property)
- **Approach**: Fuzz testing with property validation

## 🚀 Running Tests

### Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:regtest
npm run test:benchmarks
npm run test:property

# Run with coverage
npm run test:coverage
```

### Regtest Network Tests

Regtest tests require Docker for Bitcoin Core simulation:

```bash
# Start regtest environment
npm run regtest:start

# Run regtest integration tests
npm run test:regtest

# Stop regtest environment
npm run regtest:stop
```

### Performance Benchmarks

```bash
# Run performance comparisons
npm run test:benchmarks

# Run stress tests
npm run test:stress

# Generate performance report
npm run benchmark:report
```

## 📊 Test Coverage

### Current Coverage Targets

| Component           | Unit Tests | Integration | Regtest | Benchmarks | Property-Based |
| ------------------- | ---------- | ----------- | ------- | ---------- | -------------- |
| UTXO Selectors      | ✅ 95%+    | ✅ 90%+     | ✅ 80%+ | ✅ 100%    | ✅ 90%+        |
| Transaction Builder | ✅ 90%+    | ✅ 95%+     | ✅ 85%+ | ✅ 100%    | ✅ 85%+        |
| PSBT Builder        | ✅ 85%+    | ✅ 90%+     | ✅ 75%+ | ✅ 90%+    | ✅ 80%+        |
| Encoders            | ✅ 95%+    | ✅ 85%+     | ✅ 70%+ | ✅ 85%+    | ✅ 75%+        |
| Fee Estimation      | ✅ 90%+    | ✅ 80%+     | ✅ 85%+ | ✅ 95%+    | ✅ 85%+        |

### Coverage Reports

```bash
# Generate detailed coverage report
npm run test:coverage

# View coverage in browser
npm run coverage:view
```

## 🔧 Test Configuration

### Environment Variables

```bash
# Test configuration
TEST_TIMEOUT=30000
TEST_PARALLEL=true
TEST_VERBOSE=false

# Regtest configuration
REGTEST_AUTO_START=false
REGTEST_CLEANUP=true
REGTEST_PORT=18443

# Benchmark configuration
BENCHMARK_ITERATIONS=100
BENCHMARK_WARMUP=10
BENCHMARK_TIMEOUT=300000
```

### Vitest Configuration

Key settings in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    timeout: 30000,
    coverage: {
      reporter: ['text', 'html', 'lcov'],
      threshold: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
```

## 📋 Test Categories Detail

### Regtest Integration Tests

**Purpose**: Validate against real Bitcoin network behavior

**Setup**:

1. Bitcoin Core regtest network via Docker
2. ElectrumX server for API access
3. Automated wallet funding and block generation

**Test Scenarios**:

- End-to-end transaction building and broadcasting
- UTXO selection with real network constraints
- Fee estimation accuracy
- Multi-signature workflows
- SRC-20 token operations
- Error handling and recovery

**Example**:

```typescript
describe('Regtest Integration', () => {
  it('should build and broadcast transaction', async () => {
    const { wallet, utxos } = await regtest.createRealisticUTXOSet(10);
    const psbt = transactionBuilder.buildFromUTXOs(
      utxos,
      outputs,
      changeAddress,
    );
    const txid = await regtest.broadcastTransaction(
      psbt.extractTransaction().toHex(),
    );
    await regtest.waitForConfirmation(txid);
    expect(txid).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

### Performance Benchmarks

**Purpose**: Ensure competitive performance and identify regressions

**Metrics Tracked**:

- Execution time per operation
- Memory usage patterns
- Scalability with large UTXO sets
- Comparison with existing libraries

**Benchmark Categories**:

1. **UTXO Selection Speed**: Algorithm performance comparison
2. **Memory Efficiency**: Memory usage per UTXO processed
3. **Scalability**: Performance with 100-5000 UTXOs
4. **Real-world Scenarios**: Typical wallet operations

**Example Output**:

```
📊 UTXO Selection Benchmark (1000 UTXOs):
─────────────────────────────────────────
Algorithm        Time      Memory    Efficiency
─────────────────────────────────────────
Accumulative     45ms      2.1MB     Good
Branch & Bound   156ms     4.3MB     Excellent
Blackjack        78ms      2.8MB     Good
Waste Optimized  203ms     5.1MB     Excellent
```

### Property-Based Testing

**Purpose**: Discover edge cases and validate algorithmic correctness

**Properties Tested**:

1. **Mathematical Invariants**: Input sum ≥ output sum + fees
2. **Selection Validity**: All selected UTXOs exist in input set
3. **Determinism**: Same inputs produce same outputs
4. **Optimality**: Efficient selections when possible
5. **Consistency**: Similar behavior across algorithms

**Fuzz Testing Approach**:

- Generate random UTXO sets with realistic distributions
- Test with random target values and fee rates
- Validate properties across 100-1000 iterations
- Report violations and edge cases

**Example Property**:

```typescript
// Property: Selection should never violate value conservation
it('should maintain value conservation', () => {
  for (let i = 0; i < 1000; i++) {
    const utxos = generateRandomUTXOs();
    const result = selector.select(utxos, randomOptions());

    if (result) {
      const inputSum = result.inputs.reduce((sum, utxo) => sum + utxo.value, 0);
      const outputSum = result.targetValue + result.fee;
      expect(inputSum).toBeGreaterThanOrEqual(outputSum);
    }
  }
});
```

## 🐛 Testing Edge Cases

### Common Edge Cases Covered

1. **Insufficient Funds**
   - Target value exceeds available UTXOs
   - High fee rates consuming all value
   - Dust threshold complications

2. **Pathological UTXO Distributions**
   - All UTXOs same value
   - Exponential value distributions
   - Mixed dust and large UTXOs

3. **Extreme Parameters**
   - Very high/low fee rates
   - High minimum confirmations
   - Zero dust thresholds

4. **Network Edge Cases**
   - Unconfirmed UTXOs
   - Complex script types
   - Large transaction sizes

### Error Handling Validation

Tests ensure graceful error handling for:

- Invalid input parameters
- Network connectivity issues
- Malformed UTXO data
- Consensus rule violations

## 📈 Performance Monitoring

### Continuous Performance Tracking

Performance benchmarks run automatically to catch regressions:

```bash
# Run performance regression tests
npm run test:performance

# Compare against baseline
npm run benchmark:compare

# Update performance baselines
npm run benchmark:update-baseline
```

### Performance Alerts

Automated alerts for:

- 20% performance degradation
- Memory usage increases >50%
- Algorithm optimality decreases >10%
- Test failure rates >5%

## 🔄 CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Integration Tests
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Run Unit Tests
        run: npm run test:unit

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Start Regtest
        run: npm run regtest:start
      - name: Run Integration Tests
        run: npm run test:integration
      - name: Stop Regtest
        run: npm run regtest:stop

  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Run Benchmarks
        run: npm run test:benchmarks
      - name: Check Performance Regression
        run: npm run benchmark:check-regression
```

## 🛠️ Development Workflow

### Adding New Tests

1. **Unit Tests**: Add to appropriate `unit/` subdirectory
2. **Integration Tests**: Add to `integration/` with realistic scenarios
3. **Regtest Tests**: Add to `regtest/` for network validation
4. **Benchmarks**: Add to `benchmarks/` for performance tracking
5. **Property Tests**: Add to `property-based/` for algorithmic validation

### Test-Driven Development

1. Write failing tests for new features
2. Implement feature to pass tests
3. Add integration tests for workflows
4. Add benchmarks for performance tracking
5. Add property tests for correctness validation

### Code Quality Gates

All tests must pass before merge:

- Unit tests: 100% pass rate
- Integration tests: 100% pass rate
- Regtest tests: 95% pass rate (network variability)
- Benchmarks: No >20% performance regression
- Property tests: 95% property satisfaction rate

## 📚 Further Reading

- [Test Strategy Documentation](../docs/testing-strategy.md)
- [Performance Benchmarking Guide](../docs/performance-guide.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
- [Property-Based Testing Best Practices](../docs/property-testing.md)

## 🤝 Contributing Tests

We welcome test contributions! Please see our
[contribution guidelines](../CONTRIBUTING.md) for:

- Test writing standards
- Performance benchmarking guidelines
- Property-based testing patterns
- Regtest environment setup
- CI/CD integration requirements

For questions about the test suite, please open an issue or join our development
discussions.
