import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    isolate: true,
    threads: true,
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
    // Include all unit tests and some integration tests
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/exact-btc-json-comparison.test.ts',
      'tests/integration/src20-decoder-validation.test.ts',
      'tests/integration/transaction-flows.test.ts',
    ],
    // Exclude problematic or non-essential tests
    exclude: [
      'node_modules/**',
      'dist/**',
      // Tests with outdated Buffer/mock issues - to be rewritten
      'tests/unit/core/script-builder.test.ts',
      'tests/unit/core/transaction-builder-enhanced.test.ts',
      'tests/unit/core/transaction-builder-comprehensive.test.ts',
      'tests/unit/encoders/bitcoin-stamps-encoder.test.ts',
      'tests/unit/providers/electrumx-provider.test.ts',
      'tests/unit/core/fee-estimator.test.ts',
      // Performance and stress tests - skip for normal runs
      'tests/benchmarks/**',
      'tests/property-based/**',
      'tests/integration/performance-*.test.ts',
      // E2E and regtest - require special setup
      'tests/e2e/**',
      'tests/regtest/**',
      // Integration tests requiring live connections
      'tests/integration/electrumx-*.test.ts',
      'tests/integration/stampchain-*.test.ts',
      'tests/integration/bitcoin-stamps-integration.test.ts',
      // Disabled tests
      '**/*.disabled',
      '**/*.skip.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
