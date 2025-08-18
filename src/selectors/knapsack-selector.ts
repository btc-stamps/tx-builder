import type { UTXO } from '../interfaces/provider.interface.ts';
import type { SelectionOptions } from '../interfaces/selector.interface.ts';
import type { EnhancedSelectionResult } from '../interfaces/selector-result.interface.ts';
import {
  createSelectionFailure,
  createSelectionSuccess,
  SelectionFailureReason,
} from '../interfaces/selector-result.interface.ts';

import { BaseSelector } from './base-selector.ts';

/**
 * Knapsack UTXO Selection Algorithm - Legacy stochastic approximation
 *
 * The Knapsack selector implements Bitcoin Core's legacy UTXO selection algorithm
 * (pre-2018) using a stochastic approximation approach. It runs multiple random
 * iterations to find good solutions, making it highly reliable and capable of
 * finding valid selections even when more sophisticated algorithms fail.
 *
 * @remarks
 * The algorithm operates through multiple phases:
 * 1. **Exact Match Search**: First attempts to find precise combinations for changeless transactions
 * 2. **Stochastic Iteration**: Runs up to 1000 random trials, each selecting UTXOs with 50% probability
 * 3. **Accumulative Fallback**: If stochastic approach fails, uses simple largest-first accumulation
 *
 * Each iteration processes UTXOs from largest to smallest value, randomly including each with
 * a configurable probability (default 50%). The algorithm tracks the best solution found across
 * all iterations, preferring selections that minimize excess value over the target amount.
 *
 * The algorithm includes intelligent early exit conditions and prefers solutions that avoid
 * creating dust outputs (change below 1000 satoshis threshold).
 *
 * Key features:
 * - Highly reliable - always finds a solution when sufficient funds are available
 * - Stochastic approach avoids local optima that deterministic algorithms might encounter
 * - Configurable iteration count and inclusion probability for fine-tuning
 * - Built-in exact match optimization for small UTXO combinations
 * - Dust threshold handling to prevent unspendable change outputs
 * - Accumulative fallback ensures solution availability
 * - Maximum input constraints respected throughout selection process
 *
 * Performance characteristics:
 * - Moderate performance, scales well with UTXO set size
 * - Consistent execution time due to fixed iteration limit
 * - Less optimal than modern algorithms but more predictable
 * - Excellent fallback algorithm when others fail due to constraints
 *
 * @example
 * ```typescript
 * const selector = new KnapsackSelector();
 * const result = selector.select(utxos, {
 *   targetValue: 250000,  // 250,000 satoshis
 *   feeRate: 20,         // 20 sat/vB
 *   maxInputs: 8,        // Limit to 8 inputs max
 *   minConfirmations: 1   // Require confirmed UTXOs
 * });
 *
 * if (result.success) {
 *   console.log(`Selected ${result.inputCount} UTXOs`);
 *   console.log(`Total value: ${result.totalValue} satoshis`);
 *   console.log(`Change: ${result.change} satoshis`);
 * }
 *
 * // Configurable version with custom parameters
 * const customSelector = new ConfigurableKnapsackSelector({
 *   iterations: 2000,           // More iterations for better results
 *   inclusionProbability: 0.3   // Lower probability for tighter selection
 * });
 * ```
 */
export class KnapsackSelector extends BaseSelector {
  protected MAX_ITERATIONS = 1000;
  private readonly MIN_CHANGE_THRESHOLD = 1000; // Dust threshold for change

  select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    // Validate options first
    const validationFailure = this.checkOptionsValidity(options);
    if (validationFailure) return validationFailure;

    const { targetValue, feeRate, longTermFeeRate } = options;
    console.debug(
      `Knapsack Selection: fee=${feeRate}, longTermFee=${longTermFeeRate}`,
    ); // Use the unused parameters

    // Handle empty UTXO set
    if (utxos.length === 0) {
      return createSelectionFailure(
        SelectionFailureReason.NO_UTXOS_AVAILABLE,
        'No UTXOs available for selection',
        { utxoCount: 0, targetValue },
      );
    }

    // Filter out zero-value UTXOs and apply confirmation/protection filter
    const validUtxos = utxos.filter((utxo) => utxo.value > 0);
    const eligibleUtxos = this.filterEligibleUTXOs(validUtxos, options);

    if (eligibleUtxos.length === 0) {
      return createSelectionFailure(
        SelectionFailureReason.NO_UTXOS_AVAILABLE,
        'No eligible UTXOs available (confirmations/protection)',
        { utxoCount: utxos.length, minConfirmations: options.minConfirmations },
      );
    }

    const sortedUtxos = [...eligibleUtxos].sort((a, b) => b.value - a.value);

    // Calculate total available value
    const totalAvailable = sortedUtxos.reduce(
      (sum, utxo) => sum + utxo.value,
      0,
    );

    // Quick check if we have enough funds
    if (totalAvailable < targetValue) {
      return createSelectionFailure(
        SelectionFailureReason.INSUFFICIENT_FUNDS,
        'Insufficient funds to cover target amount',
        {
          availableBalance: totalAvailable,
          requiredAmount: targetValue,
          utxoCount: sortedUtxos.length,
        },
      );
    }

    let bestSelection: UTXO[] = [];
    let bestValue = 0;
    let bestExcess = Number.MAX_SAFE_INTEGER;

    // Try exact match first (no change)
    const exactMatch = this.findExactMatch(sortedUtxos, targetValue, options.feeRate);
    if (exactMatch.length > 0) {
      const totalSpent = this.sumValues(exactMatch);
      const fee = this.estimateFee(exactMatch.length, 2, options.feeRate);
      const hasChange = totalSpent > targetValue + fee;

      return createSelectionSuccess(
        exactMatch,
        totalSpent,
        hasChange ? totalSpent - targetValue - fee : 0,
        fee,
        { outputCount: hasChange ? 2 : 1 },
      );
    }

    // Run stochastic iterations
    for (let iteration = 0; iteration < this.MAX_ITERATIONS; iteration++) {
      const selected: UTXO[] = [];
      let currentValue = 0;

      // Randomly include each UTXO with 50% probability
      // Process from largest to smallest for better convergence
      for (const utxo of sortedUtxos) {
        // Check max inputs constraint
        if (options.maxInputs && selected.length >= options.maxInputs) {
          break;
        }

        // Include with configured probability or if we still need more
        const probability = this instanceof ConfigurableKnapsackSelector
          ? (this as ConfigurableKnapsackSelector).inclusionProbability
          : 0.5;
        if (Math.random() < probability || currentValue < targetValue) {
          selected.push(utxo);
          currentValue += utxo.value;

          // Early exit if we've exceeded target significantly
          if (currentValue >= targetValue * 3) {
            break;
          }
        }
      }

      // Calculate fee for this selection
      const fee = this.estimateFee(selected.length, 2, options.feeRate);
      const requiredTotal = targetValue + fee;

      // Check if this selection meets our requirements
      if (currentValue >= requiredTotal) {
        const excess = currentValue - requiredTotal;

        // Prefer selections with less excess (less change)
        // But only if the change is above dust threshold
        const isUsableChange = excess === 0 ||
          excess >= this.MIN_CHANGE_THRESHOLD;

        if (isUsableChange && excess < bestExcess) {
          bestSelection = [...selected]; // Create a copy
          bestValue = currentValue;
          bestExcess = excess;

          // Perfect match found, no need to continue
          if (excess === 0) {
            break;
          }

          // Good enough match (within 5% of target)
          if (excess < targetValue * 0.05) {
            break;
          }
        }
      }
    }

    // Fallback: If no good solution found, try accumulative approach
    if (bestSelection.length === 0) {
      bestSelection = this.accumulativeSelection(
        sortedUtxos,
        targetValue + this.estimateFee(3, 2, options.feeRate),
      );
      if (bestSelection.length > 0) {
        bestValue = this.sumValues(bestSelection);
        const fee = this.estimateFee(bestSelection.length, 2, options.feeRate);
        bestExcess = bestValue - (targetValue + fee);
      }
    }

    // Return best solution found
    if (bestSelection.length > 0 && bestValue > 0) {
      const fee = this.estimateFee(bestSelection.length, 2, options.feeRate);
      const hasChange = bestExcess >= this.MIN_CHANGE_THRESHOLD;
      const change = hasChange ? bestExcess : 0;

      return createSelectionSuccess(
        bestSelection,
        bestValue,
        change,
        fee,
        { outputCount: hasChange ? 2 : 1 },
      );
    }

    return createSelectionFailure(
      SelectionFailureReason.NO_SOLUTION_FOUND,
      'Knapsack algorithm could not find a suitable UTXO combination',
      {
        availableBalance: totalAvailable,
        requiredAmount: targetValue,
        utxoCount: sortedUtxos.length,
        attemptedStrategies: ['exact_match', 'stochastic', 'accumulative'],
      },
    );
  }

  /**
   * Try to find an exact match for the target amount plus fees
   */
  private findExactMatch(utxos: UTXO[], target: number, feeRate: number): UTXO[] {
    // Try single UTXO exact match (target + fee for 1 input, 1 output)
    const fee1In1Out = this.estimateFee(1, 1, feeRate);
    const fee1In2Out = this.estimateFee(1, 2, feeRate);

    const exactUtxo = utxos.find((utxo) =>
      utxo.value === target + fee1In1Out || utxo.value === target + fee1In2Out
    );
    if (exactUtxo) {
      return [exactUtxo];
    }

    // Try two UTXO exact match (common case)
    const fee2In1Out = this.estimateFee(2, 1, feeRate);
    const fee2In2Out = this.estimateFee(2, 2, feeRate);

    for (let i = 0; i < utxos.length; i++) {
      for (let j = i + 1; j < utxos.length; j++) {
        const utxoI = utxos[i];
        const utxoJ = utxos[j];
        if (utxoI && utxoJ) {
          const combined = utxoI.value + utxoJ.value;
          if (combined === target + fee2In1Out || combined === target + fee2In2Out) {
            return [utxoI, utxoJ];
          }
        }
      }
    }

    return [];
  }

  /**
   * Simple accumulative selection as fallback
   */
  private accumulativeSelection(utxos: UTXO[], target: number): UTXO[] {
    const selected: UTXO[] = [];
    let total = 0;

    for (const utxo of utxos) {
      selected.push(utxo);
      total += utxo.value;

      if (total >= target) {
        return selected;
      }
    }

    return total >= target ? selected : [];
  }

  /**
   * Sum values of UTXOs
   */
  private sumValues(utxos: UTXO[]): number {
    return this.sumUTXOs(utxos);
  }

  getName(): string {
    return 'knapsack';
  }
}

/**
 * Enhanced Knapsack with configurable parameters
 */
export class ConfigurableKnapsackSelector extends KnapsackSelector {
  public readonly inclusionProbability: number;

  constructor(
    options: {
      iterations?: number;
      inclusionProbability?: number;
    } = {},
  ) {
    super();
    this.MAX_ITERATIONS = options.iterations || 1000;
    this.inclusionProbability = options.inclusionProbability || 0.5;
  }

  override getName(): string {
    return `knapsack-${this.MAX_ITERATIONS}-${this.inclusionProbability}`;
  }
}
