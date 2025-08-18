/**
 * Accumulative UTXO Selection Algorithm
 * Simple selection that accumulates UTXOs until target is met
 */

import type { UTXO } from '../interfaces/provider.interface.ts';
import type {
  SelectionOptions,
  SelectionResult as _SelectionResult,
} from '../interfaces/selector.interface.ts';
import type { EnhancedSelectionResult } from '../interfaces/selector-result.interface.ts';
import { SelectionFailureReason } from '../interfaces/selector-result.interface.ts';

import { BaseSelector } from './base-selector.ts';

/**
 * Simple accumulative UTXO selection algorithm
 *
 * @remarks
 * Selects UTXOs in order (typically largest first) until the target amount is reached.
 * This is the simplest and fastest selection algorithm, suitable for most basic transactions.
 *
 * Features:
 * - Fast O(n) selection
 * - Deterministic results
 * - Minimal computational overhead
 * - Good for time-sensitive operations
 *
 * @example
 * ```typescript
 * const selector = new AccumulativeSelector();
 * const result = selector.select(utxos, {
 *   targetValue: 100000,
 *   feeRate: 10
 * });
 * ```
 */
export class AccumulativeSelector extends BaseSelector {
  getName(): string {
    return 'accumulative';
  }

  select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    // Check for invalid options and return failure if needed
    const validationFailure = this.checkOptionsValidity(options);
    if (validationFailure) {
      return validationFailure;
    }

    // Filter UTXOs by confirmation and protection requirements
    const eligibleUTXOs = this.filterEligibleUTXOs(utxos, options);
    if (eligibleUTXOs.length === 0) {
      return {
        success: false,
        reason: SelectionFailureReason.NO_UTXOS_AVAILABLE,
        message: 'No eligible UTXOs available (confirmations/protection)',
        details: {
          utxoCount: utxos.length,
          minConfirmations: options.minConfirmations,
        },
      };
    }

    // Sort by value (descending) to minimize inputs
    const sortedUTXOs = this.sortByValue(eligibleUTXOs, true);

    const selected: UTXO[] = [];
    let accumulated = 0;

    // Calculate initial target including estimated fees
    let estimatedFee = this.estimateFee(1, 2, options.feeRate); // Assume change output
    let target = options.targetValue + estimatedFee;

    for (const utxo of sortedUTXOs) {
      // Check max inputs constraint
      if (options.maxInputs && selected.length >= options.maxInputs) {
        break;
      }

      selected.push(utxo);
      accumulated += utxo.value;

      // Recalculate fee with actual number of inputs
      estimatedFee = this.estimateFee(selected.length, 2, options.feeRate);
      target = options.targetValue + estimatedFee;

      // Check if we have enough
      if (accumulated >= target) {
        // Check if change would be dust
        const change = accumulated - options.targetValue - estimatedFee;

        if (change < (options.dustThreshold ?? this.DUST_THRESHOLD)) {
          // Change is dust, recalculate fee without change output
          estimatedFee = this.estimateFee(selected.length, 1, options.feeRate);
          target = options.targetValue + estimatedFee;

          // Verify we still have enough
          if (accumulated >= target) {
            return this.createResult(
              selected,
              options.targetValue,
              options.feeRate,
              false, // No change output
            );
          }
          // Continue accumulating if we don't have enough
        } else {
          // We have enough with change
          return this.createResult(
            selected,
            options.targetValue,
            options.feeRate,
            true, // Has change output
          );
        }
      }
    }

    // Check if we accumulated enough
    if (accumulated >= target) {
      const change = accumulated - options.targetValue - estimatedFee;
      const hasChange = change >= (options.dustThreshold ?? this.DUST_THRESHOLD);

      return this.createResult(
        selected,
        options.targetValue,
        options.feeRate,
        hasChange,
      );
    }

    // Not enough funds
    return {
      success: false,
      reason: SelectionFailureReason.INSUFFICIENT_FUNDS,
      message: 'Insufficient funds to meet target value',
      details: {
        availableBalance: accumulated,
        requiredAmount: target,
        utxoCount: selected.length,
      },
    };
  }

  /**
   * Variant that prioritizes older UTXOs (FIFO)
   */
  selectFIFO(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    // Check for invalid options and return failure if needed
    const validationFailure = this.checkOptionsValidity(options);
    if (validationFailure) {
      return validationFailure;
    }

    // Filter and sort by confirmations (oldest first)
    const eligibleUTXOs = this.filterEligibleUTXOs(utxos, options);
    if (eligibleUTXOs.length === 0) {
      return {
        success: false,
        reason: SelectionFailureReason.NO_UTXOS_AVAILABLE,
        message: 'No eligible UTXOs available (confirmations/protection)',
        details: {
          utxoCount: utxos.length,
          minConfirmations: options.minConfirmations,
        },
      };
    }

    const sortedUTXOs = this.sortByConfirmations(eligibleUTXOs);

    // Use regular accumulation logic with confirmation-sorted UTXOs
    return this.selectFromSorted(sortedUTXOs, options);
  }

  /**
   * Variant that consolidates UTXOs
   */
  selectForConsolidation(
    utxos: UTXO[],
    options: SelectionOptions,
  ): EnhancedSelectionResult {
    // Check for invalid options and return failure if needed
    const validationFailure = this.checkOptionsValidity(options);
    if (validationFailure) {
      return validationFailure;
    }

    // For consolidation, use all eligible UTXOs up to max
    const eligibleUTXOs = this.filterEligibleUTXOs(utxos, options);
    if (eligibleUTXOs.length === 0) {
      return {
        success: false,
        reason: SelectionFailureReason.NO_UTXOS_AVAILABLE,
        message: 'No eligible UTXOs available for consolidation',
        details: {
          utxoCount: utxos.length,
          minConfirmations: options.minConfirmations,
        },
      };
    }

    // Sort by value (ascending) to consolidate small UTXOs first
    const sortedUTXOs = this.sortByValue(eligibleUTXOs, false);

    const maxInputs = options.maxInputs ?? Math.min(100, sortedUTXOs.length);
    const selected = sortedUTXOs.slice(0, maxInputs);
    const accumulated = this.sumUTXOs(selected);

    // Calculate fee for consolidation transaction
    const estimatedFee = this.estimateFee(selected.length, 1, options.feeRate);

    // Check if consolidation makes sense
    const outputValue = accumulated - estimatedFee;
    if (outputValue < options.targetValue) {
      return {
        success: false,
        reason: SelectionFailureReason.INSUFFICIENT_FUNDS,
        message: 'Insufficient funds after fees for consolidation',
        details: {
          availableBalance: outputValue,
          requiredAmount: options.targetValue,
          utxoCount: selected.length,
        },
      };
    }

    // Return result using createResult helper to ensure proper format
    return this.createResult(
      selected,
      outputValue, // Use output value as target
      options.feeRate,
      false, // No change in consolidation
    );
  }

  /**
   * Helper method to select from pre-sorted UTXOs
   */
  private selectFromSorted(
    sortedUTXOs: UTXO[],
    options: SelectionOptions,
  ): EnhancedSelectionResult {
    const selected: UTXO[] = [];
    let accumulated = 0;
    let estimatedFee = this.estimateFee(1, 2, options.feeRate);
    let target = options.targetValue + estimatedFee;

    for (const utxo of sortedUTXOs) {
      if (options.maxInputs && selected.length >= options.maxInputs) {
        break;
      }

      selected.push(utxo);
      accumulated += utxo.value;

      estimatedFee = this.estimateFee(selected.length, 2, options.feeRate);
      target = options.targetValue + estimatedFee;

      if (accumulated >= target) {
        const change = accumulated - options.targetValue - estimatedFee;
        const hasChange = change >= (options.dustThreshold ?? this.DUST_THRESHOLD);

        if (!hasChange) {
          estimatedFee = this.estimateFee(selected.length, 1, options.feeRate);
          target = options.targetValue + estimatedFee;
        }

        if (accumulated >= target) {
          return this.createResult(
            selected,
            options.targetValue,
            options.feeRate,
            hasChange,
          );
        }
      }
    }

    return {
      success: false,
      reason: SelectionFailureReason.INSUFFICIENT_FUNDS,
      message: 'Insufficient funds to meet target value',
      details: {
        availableBalance: accumulated,
        requiredAmount: target,
        utxoCount: selected.length,
      },
    };
  }
}
