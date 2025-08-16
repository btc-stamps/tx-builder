/**
 * Base UTXO Selector
 * Common functionality for all selection algorithms
 */

import type { UTXO } from '../interfaces/provider.interface.ts';
import type { IUTXOSelector, SelectionOptions } from '../interfaces/selector.interface.ts';
import type {
  EnhancedSelectionResult,
  SelectionSuccess,
} from '../interfaces/selector-result.interface.ts';
import { SelectionFailureReason } from '../interfaces/selector-result.interface.ts';

export abstract class BaseSelector implements IUTXOSelector {
  protected readonly DUST_THRESHOLD = 546;
  protected readonly INPUT_SIZE = 148; // Approximate size of a legacy input
  protected readonly OUTPUT_SIZE = 34; // Approximate size of a P2PKH output
  protected readonly TRANSACTION_OVERHEAD = 10; // Version + locktime + counts

  abstract select(
    utxos: UTXO[],
    options: SelectionOptions,
  ): EnhancedSelectionResult;
  abstract getName(): string;

  /**
   * Filter UTXOs based on confirmation requirements
   */
  protected filterUTXOs(utxos: UTXO[], minConfirmations = 0): UTXO[] {
    return utxos.filter((utxo) => (utxo.confirmations ?? 0) >= minConfirmations);
  }

  /**
   * Filter UTXOs with protection and confirmation checks
   */
  protected filterEligibleUTXOs(utxos: UTXO[], options: SelectionOptions): UTXO[] {
    let eligible = this.filterUTXOs(utxos, options.minConfirmations);

    // Filter out protected UTXOs if detector is provided
    if (options.protectedUTXODetector) {
      try {
        eligible = eligible.filter((utxo) => {
          try {
            return !options.protectedUTXODetector!.isProtected(utxo);
          } catch {
            // If detector fails, treat as unprotected
            return true;
          }
        });
      } catch {
        // If detector is broken, continue with unfiltered UTXOs
      }
    }

    return eligible;
  }

  /**
   * Sort UTXOs by value (ascending)
   */
  protected sortByValue(utxos: UTXO[], descending = false): UTXO[] {
    return [...utxos].sort((
      a,
      b,
    ) => (descending ? b.value - a.value : a.value - b.value));
  }

  /**
   * Sort UTXOs by confirmations (most confirmed first)
   */
  protected sortByConfirmations(utxos: UTXO[]): UTXO[] {
    return [...utxos].sort((a, b) => (b.confirmations ?? 0) - (a.confirmations ?? 0));
  }

  /**
   * Calculate total value of UTXOs
   */
  protected sumUTXOs(utxos: UTXO[]): number {
    return utxos.reduce((sum, utxo) => sum + utxo.value, 0);
  }

  /**
   * Estimate transaction fee
   */
  estimateFee(numInputs: number, numOutputs: number, feeRate: number): number {
    const size = this.estimateTransactionSize(numInputs, numOutputs);
    return Math.ceil(size * feeRate);
  }

  /**
   * Estimate transaction size in vBytes
   */
  protected estimateTransactionSize(
    numInputs: number,
    numOutputs: number,
  ): number {
    return this.TRANSACTION_OVERHEAD + numInputs * this.INPUT_SIZE +
      numOutputs * this.OUTPUT_SIZE;
  }

  /**
   * Check if amount is dust
   */
  protected isDust(amount: number, dustThreshold?: number): boolean {
    return amount < (dustThreshold ?? this.DUST_THRESHOLD);
  }

  /**
   * Calculate change amount
   */
  protected calculateChange(
    inputValue: number,
    targetValue: number,
    fee: number,
  ): number {
    return inputValue - targetValue - fee;
  }

  /**
   * Create selection result
   */
  protected createResult(
    inputs: UTXO[],
    targetValue: number,
    feeRate: number,
    hasChange: boolean,
  ): SelectionSuccess {
    const totalValue = this.sumUTXOs(inputs);
    const numOutputs = hasChange ? 2 : 1; // Target + optional change
    const fee = this.estimateFee(inputs.length, numOutputs, feeRate);
    const change = hasChange ? this.calculateChange(totalValue, targetValue, fee) : 0;
    const estimatedVSize = this.estimateTransactionSize(inputs.length, numOutputs);

    return {
      success: true,
      inputs,
      totalValue,
      change: hasChange ? (change > 0 ? change : 0) : 0,
      fee,
      inputCount: inputs.length,
      outputCount: numOutputs,
      estimatedVSize,
      effectiveFeeRate: fee / estimatedVSize,
    };
  }

  /**
   * Validate selection options
   */
  protected validateOptions(options: SelectionOptions): void {
    if (options.targetValue <= 0) {
      throw new Error('Target value must be positive');
    }

    if (options.feeRate <= 0) {
      throw new Error('Fee rate must be positive');
    }

    if (options.maxInputs !== undefined && options.maxInputs <= 0) {
      throw new Error('Max inputs must be positive');
    }
  }

  /**
   * Check if options are valid and return failure result if not
   */
  protected checkOptionsValidity(options: SelectionOptions): EnhancedSelectionResult | null {
    if (options.targetValue <= 0) {
      return {
        success: false,
        reason: SelectionFailureReason.INVALID_OPTIONS,
        message: 'Target value must be positive',
        details: { targetValue: options.targetValue },
      };
    }

    if (options.feeRate <= 0) {
      return {
        success: false,
        reason: SelectionFailureReason.INVALID_OPTIONS,
        message: 'Fee rate must be positive',
        details: { feeRate: options.feeRate },
      };
    }

    if (options.maxInputs !== undefined && options.maxInputs <= 0) {
      return {
        success: false,
        reason: SelectionFailureReason.INVALID_OPTIONS,
        message: 'Max inputs must be positive',
        details: { maxInputs: options.maxInputs },
      };
    }

    return null; // Options are valid
  }

  /**
   * Calculate waste metric for coin selection
   * Lower waste is better
   */
  protected calculateWaste(
    inputs: UTXO[],
    targetValue: number,
    feeRate: number,
    longTermFeeRate: number = 10,
  ): number {
    const totalValue = this.sumUTXOs(inputs);
    const currentFee = this.estimateFee(inputs.length, 2, feeRate);
    const change = totalValue - targetValue - currentFee;

    // Cost of creating change now vs spending it later
    const changeCost = this.OUTPUT_SIZE * feeRate +
      this.INPUT_SIZE * longTermFeeRate;

    // Excess value that could have been saved with better selection
    const excess = change > this.DUST_THRESHOLD ? 0 : change;

    // Cost difference between current and long-term fee rates
    const inputWaste = inputs.reduce((waste, _input) => {
      const currentCost = this.INPUT_SIZE * feeRate;
      const futureCost = this.INPUT_SIZE * longTermFeeRate;
      return waste + (currentCost - futureCost);
    }, 0);

    return changeCost + excess + inputWaste;
  }
}
