/**
 * @module Selectors
 * @description Advanced UTXO selection algorithms for optimizing Bitcoin transactions. This module provides
 * a comprehensive suite of selection strategies to minimize fees, reduce transaction size, optimize for
 * privacy, and handle various transaction scenarios including consolidation, tax optimization, and
 * protection-aware selection.
 *
 * Available Selection Algorithms:
 * - **AccumulativeSelector**: Simple first-fit algorithm for basic transactions
 * - **BranchAndBoundSelector**: Exact-match algorithm to minimize change outputs
 * - **BlackjackSelector**: Optimized selection targeting specific amounts
 * - **WasteOptimizedSelector**: Minimizes long-term UTXO set growth
 * - **ProtectionAwareSelector**: Avoids spending protected UTXOs (Stamps, tokens)
 * - **KnapsackSelector**: Classic dynamic programming approach
 * - **TaxOptimizedSelector**: Optimizes for tax implications (FIFO/LIFO)
 * - **ConsolidationSelector**: Efficiently consolidates many small UTXOs
 *
 * @example Basic UTXO selection
 * ```typescript
 * import { AccumulativeSelector } from '@btc-stamps/tx-builder/selectors';
 *
 * const selector = new AccumulativeSelector();
 * const result = selector.select(utxos, {
 *   targetAmount: 100000, // 0.001 BTC
 *   feeRate: 10, // sats/vbyte
 *   minConfirmations: 1
 * });
 *
 * if (result.success) {
 *   console.log(`Selected ${result.selectedUTXOs.length} UTXOs`);
 *   console.log(`Total input: ${result.totalInput} sats`);
 *   console.log(`Change: ${result.change} sats`);
 * }
 * ```
 *
 * @example Advanced selection with protection awareness
 * ```typescript
 * import { ProtectionAwareSelector, SelectorFactory } from '@btc-stamps/tx-builder/selectors';
 *
 * // Using factory for algorithm selection
 * const selector = SelectorFactory.create('protection-aware', {
 *   fallbackAlgorithm: 'waste-optimized'
 * });
 *
 * const result = selector.select(utxos, {
 *   targetAmount: 50000,
 *   feeRate: 15,
 *   protectedUTXODetector: {
 *     isProtected: (utxo) => utxo.value === 546 // Protect dust UTXOs
 *   }
 * });
 * ```
 *
 * @example Tax-optimized selection
 * ```typescript
 * import { TaxOptimizedSelector } from '@btc-stamps/tx-builder/selectors';
 *
 * const selector = new TaxOptimizedSelector();
 * const result = selector.select(utxos, {
 *   targetAmount: 200000,
 *   feeRate: 20,
 *   taxStrategy: 'FIFO', // or 'LIFO'
 *   preferLongTerm: true // Prefer UTXOs > 1 year old
 * });
 * ```
 *
 * @example UTXO consolidation
 * ```typescript
 * import { ConsolidationSelector } from '@btc-stamps/tx-builder/selectors';
 *
 * const selector = new ConsolidationSelector();
 * const result = selector.select(smallUtxos, {
 *   targetAmount: 0, // Consolidate all
 *   feeRate: 1, // Use low fee rate for consolidation
 *   maxInputs: 500 // Limit transaction size
 * });
 * ```
 */

// Core algorithms
export { BaseSelector } from './base-selector.ts';
export { AccumulativeSelector } from './accumulative.ts';
export { BranchAndBoundSelector } from './branch-and-bound.ts';
export { BlackjackSelector } from './blackjack.ts';
export { WasteOptimizedSelector } from './waste-optimized.ts';

// New advanced algorithms
export { ProtectionAwareSelector } from './protection-aware-selector.ts';
export { KnapsackSelector } from './knapsack-selector.ts';
export { OutputGroupSelector } from './output-group-selector.ts';
export { TaxOptimizedSelector } from './tax-optimized-selector.ts';
export { SingleRandomDrawSelector } from './single-random-draw-selector.ts';
export { ConsolidationSelector } from './consolidation-selector.ts';

// Factory and utilities
export { SelectorFactory } from './selector-factory.ts';

// Re-export commonly used types
export type { UTXO } from '../interfaces/provider.interface.ts';
export type {
  IUTXOSelector,
  SelectionOptions,
  SelectionResult,
  SelectorAlgorithm,
} from '../interfaces/selector.interface.ts';
