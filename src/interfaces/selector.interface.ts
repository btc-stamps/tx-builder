/**
 * UTXO Selection Strategy Interface
 * Defines algorithms for selecting UTXOs for transactions
 */

import type { UTXO } from './provider.interface.ts';
import type {
  EnhancedSelectionResult,
  SelectionFailure,
  SelectionSuccess,
} from './selector-result.interface.ts';

export type { EnhancedSelectionResult, SelectionFailure, SelectionSuccess, UTXO };

// Clean SelectionResult type - just re-export from selector-result
export type SelectionResult = EnhancedSelectionResult;

export interface SelectionOptions {
  targetValue: number;
  feeRate: number; // sat/vB
  longTermFeeRate?: number | undefined; // Expected future fee rate for waste calculation
  changeAddress?: string | undefined;
  minConfirmations?: number | undefined;
  maxInputs?: number | undefined;
  dustThreshold?: number | undefined;
  consolidate?: boolean | undefined;
  protectedUTXODetector?: {
    isProtected(utxo: UTXO): boolean;
  } | undefined;
}

export interface IUTXOSelector {
  /**
   * Select UTXOs for a transaction
   * Always returns a structured result (never null)
   */
  select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult;

  /**
   * Get the name of the selection algorithm
   */
  getName(): string;

  /**
   * Estimate fee for given inputs and outputs
   */
  estimateFee(numInputs: number, numOutputs: number, feeRate: number): number;
}

export type SelectorAlgorithm =
  | 'branch-and-bound'
  | 'knapsack'
  | 'single-random-draw'
  | 'blackjack'
  | 'accumulative'
  | 'fifo'
  | 'lifo'
  | 'waste-optimized';

export interface SelectorFactory {
  create(algorithm: SelectorAlgorithm): IUTXOSelector;
}
