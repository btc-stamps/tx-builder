/**
 * Adapter to convert existing selectors to use EnhancedSelectionResult
 * This provides a clean migration path for v0.1.0
 */

import type { UTXO } from '../interfaces/provider.interface.ts';
import type {
  EnhancedSelectionResult,
  IUTXOSelector,
  SelectionOptions,
} from '../interfaces/selector.interface.ts';
import {
  createSelectionFailure,
  createSelectionSuccess,
  SelectionFailureReason,
} from '../interfaces/selector-result.interface.ts';

/**
 * Wraps an existing selector that returns SelectionResult | null
 * and converts it to always return EnhancedSelectionResult
 */
export function adaptSelector(
  legacySelector: {
    select(utxos: UTXO[], options: SelectionOptions): any | null;
    getName(): string;
    estimateFee(numInputs: number, numOutputs: number, feeRate: number): number;
  },
): IUTXOSelector {
  return {
    select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
      // Input validation
      if (!utxos || utxos.length === 0) {
        return createSelectionFailure(
          SelectionFailureReason.NO_UTXOS_AVAILABLE,
          'No UTXOs provided for selection',
          {
            utxoCount: 0,
            targetValue: options.targetValue,
          },
        );
      }

      if (options.targetValue <= 0) {
        return createSelectionFailure(
          SelectionFailureReason.INVALID_OPTIONS,
          'Target value must be positive',
          {
            targetValue: options.targetValue,
          },
        );
      }

      // Calculate available balance
      const availableBalance = utxos.reduce((sum, utxo) => sum + utxo.value, 0);

      try {
        // Call the legacy selector
        const result = legacySelector.select(utxos, options);

        // Convert null to structured failure
        if (!result) {
          // Determine the most likely reason for failure
          if (availableBalance < options.targetValue) {
            return createSelectionFailure(
              SelectionFailureReason.INSUFFICIENT_FUNDS,
              `Insufficient funds: have ${availableBalance}, need ${options.targetValue}`,
              {
                availableBalance,
                requiredAmount: options.targetValue,
                utxoCount: utxos.length,
              },
            );
          }

          return createSelectionFailure(
            SelectionFailureReason.NO_SOLUTION_FOUND,
            'No valid UTXO combination found for the target value',
            {
              availableBalance,
              targetValue: options.targetValue,
              utxoCount: utxos.length,
              maxInputsAllowed: options.maxInputs,
            },
          );
        }

        // Convert successful result
        const inputCount = result.inputs.length;
        const outputCount = result.change > 0 ? 2 : 1;
        const estimatedVSize = legacySelector.estimateFee(inputCount, outputCount, 1);

        return createSelectionSuccess(
          result.inputs,
          result.totalValue,
          result.change,
          result.fee,
          {
            wasteMetric: result.wasteMetric,
            outputCount,
            estimatedVSize,
          },
        );
      } catch (error) {
        // Handle any errors from the selector
        return createSelectionFailure(
          SelectionFailureReason.INVALID_OPTIONS,
          `Selection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          {
            availableBalance,
            targetValue: options.targetValue,
            utxoCount: utxos.length,
          },
        );
      }
    },

    getName(): string {
      return legacySelector.getName();
    },

    estimateFee(numInputs: number, numOutputs: number, feeRate: number): number {
      return legacySelector.estimateFee(numInputs, numOutputs, feeRate);
    },
  };
}
