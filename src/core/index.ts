/**
 * @module Core
 * @description Core transaction building functionality for Bitcoin transactions, including Bitcoin Stamps, SRC-20 tokens,
 * and advanced UTXO management. This module provides the fundamental building blocks for creating, validating,
 * and optimizing Bitcoin transactions with support for Replace-by-Fee (RBF), Child-Pays-for-Parent (CPFP),
 * and comprehensive UTXO selection algorithms.
 *
 * @example Basic transaction building
 * ```typescript
 * import { TransactionBuilder } from '@btc-stamps/tx-builder/core';
 *
 * const builder = new TransactionBuilder({
 *   network: bitcoin.networks.bitcoin,
 *   feeRate: 10 // sats/vbyte
 * });
 *
 * const transaction = await builder.build({
 *   inputs: utxos,
 *   outputs: [{ address: 'bc1...', value: 100000 }],
 *   changeAddress: 'bc1...'
 * });
 * ```
 *
 * @example Advanced PSBT building with performance monitoring
 * ```typescript
 * import { EnhancedPSBTBuilder, PerformanceSystem } from '@btc-stamps/tx-builder/core';
 *
 * const perfSystem = new PerformanceSystem();
 * const psbtBuilder = new EnhancedPSBTBuilder({ performanceSystem: perfSystem });
 *
 * const psbt = await psbtBuilder.createPSBT({
 *   inputs: utxos,
 *   outputs: outputs,
 *   optimizeForLowFees: true
 * });
 * ```
 *
 * @example RBF transaction acceleration
 * ```typescript
 * import { RBFBuilder } from '@btc-stamps/tx-builder/core';
 *
 * const rbfBuilder = new RBFBuilder();
 * const acceleratedTx = await rbfBuilder.createRBFTransaction({
 *   originalTxId: 'abc123...',
 *   newFeeRate: 50,
 *   utxos: additionalUtxos
 * });
 * ```
 */

export * from './transaction-builder.ts';
export * from './psbt-builder.ts';
export * from './enhanced-psbt-builder.ts';
export * from './rbf-builder.ts';
export * from './cpfp-builder.ts';
export * from './utxo-lock-manager.ts';
export * from './psbt-validator.ts';
export * from './psbt-finalizer.ts';
export * from './script-builder.ts';
// Note: These core modules are not yet implemented
// export * from './address-validator.ts';
// export * from './network-manager.ts';

// Performance monitoring and optimization
export * from './performance-monitor.ts';
export * from './utxo-cache-manager.ts';
export * from './performance-aware-selector.ts';
export * from './parallel-selector.ts';
export * from './streaming-utxo-processor.ts';
export * from './monitoring-dashboard.ts';
// Re-export everything except BenchmarkResult to avoid conflict
export {
  type MetricsUpdate,
  type PerformanceMetrics,
  PerformanceSystem,
  type PerformanceSystemConfig,
  type SelectionRequest,
  type SelectionResponse,
  type SystemHealth,
  type SystemStats,
} from './performance-system.ts';
