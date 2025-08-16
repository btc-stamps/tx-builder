/**
 * UTXO Selection Algorithms
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
