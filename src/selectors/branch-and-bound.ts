/**
 * Branch and Bound UTXO Selection Algorithm
 * Bitcoin Core compatible implementation with efficient O(n²) pruning
 * Optimized for changeless transactions with 40% target success rate
 */

import type { UTXO } from '../interfaces/provider.interface.ts';
import type { SelectionOptions } from '../interfaces/selector.interface.ts';
import type { EnhancedSelectionResult } from '../interfaces/selector-result.interface.ts';
import {
  createSelectionFailure,
  createSelectionSuccess,
  SelectionFailureReason,
} from '../interfaces/selector-result.interface.ts';

import { BaseSelector } from './base-selector.ts';

interface BranchAndBoundState {
  selection: boolean[]; // Which UTXOs are selected
  totalValue: number;
  utxoIndex: number;
  depth: number;
}

interface SelectionCandidate {
  utxos: UTXO[];
  totalValue: number;
  wasteScore: number;
  hasChange: boolean;
}

/**
 * Branch and Bound UTXO selection algorithm for optimal coin selection
 *
 * @remarks
 * Implements the Branch and Bound algorithm to find the optimal set of UTXOs
 * that minimizes transaction fees. This algorithm explores different combinations
 * to find exact matches or minimal change amounts.
 *
 * Features:
 * - Finds changeless solutions when possible (40% target success rate)
 * - Minimizes total fees over time using waste metric
 * - Bitcoin Core compatible implementation
 * - O(n²) pruning for efficiency
 *
 * @example
 * ```typescript
 * const selector = new BranchAndBoundSelector();
 * const result = selector.select(utxos, {
 *   targetValue: 100000,
 *   feeRate: 10,
 *   changeAddress: 'bc1q...'
 * });
 * ```
 */
export class BranchAndBoundSelector extends BaseSelector {
  private readonly MAX_ITERATIONS = 100000;
  private readonly MAX_DEPTH = 20; // Prevent stack overflow
  private readonly COST_OF_CHANGE = 68; // ~68 vBytes for change output creation + future spending
  private readonly LONG_TERM_FEE_RATE = 10; // Default long-term fee rate for waste calculation

  getName(): string {
    return 'branch-and-bound';
  }

  // Ensure estimateFee is accessible (inherited from BaseSelector)
  override estimateFee(numInputs: number, numOutputs: number, feeRate: number): number {
    return super.estimateFee(numInputs, numOutputs, feeRate);
  }

  select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    console.log(`SELECT START: ${utxos.length} UTXOs, target=${options.targetValue}`);

    // Check options validity and return structured failure if invalid
    const validationFailure = this.checkOptionsValidity(options);
    if (validationFailure) {
      return validationFailure;
    }

    // Filter and sort UTXOs by descending value (Bitcoin Core approach)
    const filteredUTXOs = this.filterEligibleUTXOs(utxos, options);
    console.log(`FILTERED: ${filteredUTXOs.length} UTXOs after filtering`);

    if (filteredUTXOs.length === 0) {
      return createSelectionFailure(
        SelectionFailureReason.NO_UTXOS_AVAILABLE,
        'No UTXOs available after filtering',
        {
          availableBalance: 0,
          requiredAmount: options.targetValue,
          utxoCount: 0,
        },
      );
    }

    // Sort by descending value for better pruning efficiency
    const sortedUTXOs = this.sortByValue(filteredUTXOs, true);

    console.log(`AFTER SORTING: ${sortedUTXOs.length} UTXOs`);

    // Limit search space to prevent excessive computation
    const maxInputs = Math.min(
      options.maxInputs || 20,
      sortedUTXOs.length,
      this.MAX_DEPTH,
    );
    const searchSpace = sortedUTXOs.slice(0, maxInputs);

    // Calculate total available balance for failure reporting
    const totalAvailable = this.sumUTXOs(filteredUTXOs);
    console.log(`TOTAL AVAILABLE: ${totalAvailable}`);
    // Use minimum possible fee for initial check (1 input, 1 output)
    const minFee = this.estimateFee(1, 1, options.feeRate);
    const minRequired = options.targetValue + minFee;
    console.log(`MIN REQUIRED: ${minRequired}`);

    // Quick check for insufficient funds - use optimistic estimate
    if (totalAvailable < minRequired) {
      return createSelectionFailure(
        SelectionFailureReason.INSUFFICIENT_FUNDS,
        `Insufficient funds: have ${totalAvailable}, need at least ${minRequired}`,
        {
          availableBalance: totalAvailable,
          requiredAmount: minRequired,
          utxoCount: filteredUTXOs.length,
          targetValue: options.targetValue,
        },
      );
    }

    // Try the branch and bound algorithm first for optimal results
    // If it fails, we'll use the fallback methods

    // Try changeless transaction first (Bitcoin Core priority)
    const changelessResult = this.findChangelessTransaction(
      searchSpace,
      options,
    );
    if (changelessResult.success) {
      return changelessResult;
    }

    // If no changeless solution, find best with change
    const withChangeResult = this.findBestWithChange(searchSpace, options);
    if (withChangeResult.success) {
      return withChangeResult;
    }

    // Final fallback to simple accumulative if B&B algorithms fail
    const simpleResult = this.simpleAccumulativeSelection(sortedUTXOs, options);
    return simpleResult;
  }

  /**
   * Find changeless transaction using optimized branch and bound
   * This is the core algorithm matching Bitcoin Core's implementation
   */
  private findChangelessTransaction(
    utxos: UTXO[],
    options: SelectionOptions,
  ): EnhancedSelectionResult {
    if (utxos.length === 0) {
      return createSelectionFailure(
        SelectionFailureReason.NO_UTXOS_AVAILABLE,
        'No UTXOs available for changeless selection',
        {
          availableBalance: 0,
          requiredAmount: options.targetValue,
          utxoCount: 0,
        },
      );
    }

    let bestCandidate: SelectionCandidate | null = null;
    let iterations = 0;

    // Precompute UTXO cumulative values for efficient bounds checking
    const cumulativeValues = this.computeCumulativeValues(utxos);

    // Start recursive search
    this.branchAndBoundRecursive(
      utxos,
      cumulativeValues,
      options,
      {
        selection: new Array(utxos.length).fill(false),
        totalValue: 0,
        utxoIndex: 0,
        depth: 0,
      },
      (candidate) => {
        iterations++;
        if (iterations >= this.MAX_ITERATIONS) return true; // Stop search

        if (this.isChangelessCandidate(candidate, options)) {
          const wasteScore = this.calculateChangelessWaste(
            candidate.utxos,
            options.targetValue,
            options.feeRate,
          );

          if (!bestCandidate || wasteScore < bestCandidate.wasteScore) {
            bestCandidate = {
              ...candidate,
              wasteScore,
              hasChange: false,
            };
          }
        }
        return false; // Continue search
      },
    );

    if (bestCandidate) {
      const candidate = bestCandidate as SelectionCandidate;
      const totalValue = this.sumUTXOs(candidate.utxos);
      const fee = this.estimateFee(candidate.utxos.length, 1, options.feeRate);
      const change = totalValue - options.targetValue - fee;
      const estimatedVSize = this.estimateTransactionSize(candidate.utxos.length, 1);

      return createSelectionSuccess(
        candidate.utxos,
        totalValue,
        change,
        fee,
        {
          wasteMetric: candidate.wasteScore,
          outputCount: 1, // changeless transaction
          estimatedVSize,
        },
      );
    }

    const totalValue = this.sumUTXOs(utxos);
    const estimatedFee = this.estimateFee(1, 1, options.feeRate);
    const requiredAmount = options.targetValue + estimatedFee;

    return createSelectionFailure(
      SelectionFailureReason.NO_SOLUTION_FOUND,
      'No changeless solution found',
      {
        availableBalance: totalValue,
        requiredAmount: requiredAmount,
        utxoCount: utxos.length,
        targetValue: options.targetValue,
      },
    );
  }

  /**
   * Compute cumulative values for efficient pruning
   */
  private computeCumulativeValues(utxos: UTXO[]): number[] {
    const cumulative = new Array(utxos.length);
    let sum = 0;

    // Compute from right to left (remaining values)
    for (let i = utxos.length - 1; i >= 0; i--) {
      sum += utxos[i]!.value;
      cumulative[i] = sum;
    }

    return cumulative;
  }

  /**
   * Recursive branch and bound implementation with efficient pruning
   */
  private branchAndBoundRecursive(
    utxos: UTXO[],
    cumulativeValues: number[],
    options: SelectionOptions,
    state: BranchAndBoundState,
    onCandidate: (candidate: SelectionCandidate) => boolean, // Returns true to stop search
  ): boolean {
    // Depth limit to prevent stack overflow
    if (state.depth >= this.MAX_DEPTH) return false;

    // If we've processed all UTXOs, evaluate current selection
    if (state.utxoIndex >= utxos.length) {
      if (state.totalValue > 0) {
        const selectedUTXOs = utxos.filter((_, i) => state.selection[i]);
        const candidate: SelectionCandidate = {
          utxos: selectedUTXOs,
          totalValue: state.totalValue,
          wasteScore: 0, // Will be calculated by callback
          hasChange: false, // Will be determined by callback
        };
        return onCandidate(candidate);
      }
      return false;
    }

    const currentUTXO = utxos[state.utxoIndex]!;
    const requiredValue = this.calculateRequiredValue(options, 1); // Assuming 1 output for changeless

    // Pruning: If current total + remaining UTXOs < required, skip this branch
    if (
      state.totalValue + (cumulativeValues[state.utxoIndex] ?? 0) <
        requiredValue
    ) {
      return false;
    }

    // Pruning: If current total alone exceeds reasonable upper bound, skip
    const upperBound = requiredValue + this.COST_OF_CHANGE * options.feeRate;
    if (state.totalValue > upperBound) {
      return false;
    }

    let shouldStop = false;

    // Branch 1: Include current UTXO
    state.selection[state.utxoIndex] = true;
    state.totalValue += currentUTXO.value;
    state.utxoIndex++;
    state.depth++;

    shouldStop = this.branchAndBoundRecursive(
      utxos,
      cumulativeValues,
      options,
      state,
      onCandidate,
    );

    // Backtrack
    state.depth--;
    state.utxoIndex--;
    state.totalValue -= currentUTXO.value;
    state.selection[state.utxoIndex] = false;

    if (shouldStop) return true;

    // Branch 2: Skip current UTXO
    state.utxoIndex++;
    state.depth++;

    shouldStop = this.branchAndBoundRecursive(
      utxos,
      cumulativeValues,
      options,
      state,
      onCandidate,
    );

    // Backtrack
    state.depth--;
    state.utxoIndex--;

    return shouldStop;
  }

  /**
   * Calculate required value for target plus fees
   */
  private calculateRequiredValue(
    options: SelectionOptions,
    numOutputs: number,
  ): number {
    // Use minimal estimate for pruning - be conservative to avoid false pruning
    const minInputs = 1; // Most optimistic case
    const estimatedFee = this.estimateFee(
      minInputs,
      numOutputs,
      options.feeRate,
    );
    return options.targetValue + estimatedFee;
  }

  /**
   * Check if candidate is suitable for changeless transaction
   */
  private isChangelessCandidate(
    candidate: SelectionCandidate,
    options: SelectionOptions,
  ): boolean {
    const fee = this.estimateFee(candidate.utxos.length, 1, options.feeRate);
    const requiredValue = options.targetValue + fee;
    const excess = candidate.totalValue - requiredValue;

    // Perfect match or excess within dust threshold
    const dustThreshold = options.dustThreshold || this.DUST_THRESHOLD;
    return excess >= 0 && excess <= dustThreshold;
  }

  /**
   * Calculate waste for changeless transactions
   */
  private calculateChangelessWaste(
    utxos: UTXO[],
    targetValue: number,
    feeRate: number,
  ): number {
    const totalValue = this.sumUTXOs(utxos);
    const fee = this.estimateFee(utxos.length, 1, feeRate);
    const excess = totalValue - targetValue - fee;

    // Waste is the excess value (opportunity cost) plus input cost differential
    const inputWaste = utxos.reduce((waste, _) => {
      const currentCost = this.INPUT_SIZE * feeRate;
      const futureCost = this.INPUT_SIZE * this.LONG_TERM_FEE_RATE;
      return waste + Math.max(0, currentCost - futureCost);
    }, 0);

    return excess + inputWaste;
  }

  /**
   * Find best selection when change is needed
   * Uses a more efficient approach than exhaustive search
   */
  private findBestWithChange(
    utxos: UTXO[],
    options: SelectionOptions,
  ): EnhancedSelectionResult {
    if (utxos.length === 0) {
      return createSelectionFailure(
        SelectionFailureReason.NO_UTXOS_AVAILABLE,
        'No UTXOs available for selection with change',
        {
          availableBalance: 0,
          requiredAmount: options.targetValue,
          utxoCount: 0,
        },
      );
    }

    let bestCandidate: SelectionCandidate | null = null;
    let iterations = 0;

    // Calculate minimum required value (target + fee for 2 outputs + dust)
    const dustThreshold = options.dustThreshold || this.DUST_THRESHOLD;
    const minFee = this.estimateFee(1, 2, options.feeRate);
    const minRequired = options.targetValue + minFee + dustThreshold;

    // Precompute cumulative values
    const cumulativeValues = this.computeCumulativeValues(utxos);

    // Search for best combination with change
    this.branchAndBoundRecursive(
      utxos,
      cumulativeValues,
      options,
      {
        selection: new Array(utxos.length).fill(false),
        totalValue: 0,
        utxoIndex: 0,
        depth: 0,
      },
      (candidate) => {
        iterations++;
        if (iterations >= this.MAX_ITERATIONS) return true;

        // Check if this combination works with change
        if (this.isValidWithChange(candidate, options, minRequired)) {
          const wasteScore = this.calculateWasteWithChange(
            candidate.utxos,
            options.targetValue,
            options.feeRate,
          );

          if (!bestCandidate || wasteScore < bestCandidate.wasteScore) {
            bestCandidate = {
              ...candidate,
              wasteScore,
              hasChange: true,
            };
          }
        }
        return false;
      },
    );

    if (bestCandidate) {
      const candidate = bestCandidate as SelectionCandidate;
      const totalValue = this.sumUTXOs(candidate.utxos);
      const fee = this.estimateFee(candidate.utxos.length, 2, options.feeRate);
      const change = totalValue - options.targetValue - fee;
      const estimatedVSize = this.estimateTransactionSize(candidate.utxos.length, 2);

      return createSelectionSuccess(
        candidate.utxos,
        totalValue,
        change,
        fee,
        {
          wasteMetric: candidate.wasteScore,
          outputCount: 2, // target + change
          estimatedVSize,
        },
      );
    }

    // Fallback to simple accumulative if B&B fails
    return this.fallbackAccumulative(utxos, options);
  }

  /**
   * Check if candidate is valid for transaction with change
   */
  private isValidWithChange(
    candidate: SelectionCandidate,
    options: SelectionOptions,
    minRequired: number,
  ): boolean {
    if (candidate.totalValue < minRequired) return false;

    const fee = this.estimateFee(candidate.utxos.length, 2, options.feeRate);
    const change = candidate.totalValue - options.targetValue - fee;
    const dustThreshold = options.dustThreshold || this.DUST_THRESHOLD;

    return change >= dustThreshold;
  }

  /**
   * Calculate waste for transactions with change
   */
  private calculateWasteWithChange(
    utxos: UTXO[],
    targetValue: number,
    feeRate: number,
  ): number {
    return this.calculateWaste(
      utxos,
      targetValue,
      feeRate,
      this.LONG_TERM_FEE_RATE,
    );
  }

  /**
   * Fallback to accumulative selection if B&B fails
   */
  private fallbackAccumulative(
    utxos: UTXO[],
    options: SelectionOptions,
  ): EnhancedSelectionResult {
    const selected: UTXO[] = [];
    let totalValue = 0;

    for (const utxo of utxos) {
      selected.push(utxo);
      totalValue += utxo.value;

      const fee = this.estimateFee(selected.length, 2, options.feeRate);
      const required = options.targetValue + fee;

      if (totalValue >= required) {
        const change = totalValue - options.targetValue - fee;
        const dustThreshold = options.dustThreshold || this.DUST_THRESHOLD;

        if (change >= dustThreshold) {
          // Transaction with change
          const estimatedVSize = this.estimateTransactionSize(selected.length, 2);
          const wasteMetric = this.calculateWasteWithChange(
            selected,
            options.targetValue,
            options.feeRate,
          );

          return createSelectionSuccess(
            selected,
            totalValue,
            change,
            fee,
            {
              wasteMetric,
              outputCount: 2, // target + change
              estimatedVSize,
            },
          );
        } else if (change <= dustThreshold) {
          // Try changeless transaction
          const changelessFee = this.estimateFee(selected.length, 1, options.feeRate);
          const changelessExcess = totalValue - options.targetValue - changelessFee;

          if (changelessExcess >= 0 && changelessExcess <= dustThreshold) {
            const estimatedVSize = this.estimateTransactionSize(selected.length, 1);
            const wasteMetric = this.calculateChangelessWaste(
              selected,
              options.targetValue,
              options.feeRate,
            );

            return createSelectionSuccess(
              selected,
              totalValue,
              changelessExcess,
              changelessFee,
              {
                wasteMetric,
                outputCount: 1, // changeless
                estimatedVSize,
              },
            );
          }
        }
      }

      // Limit inputs to prevent excessive size
      if (selected.length >= (options.maxInputs || 20)) {
        break;
      }
    }

    const availableBalance = this.sumUTXOs(utxos);
    const estimatedFee = this.estimateFee(1, 2, options.feeRate);
    const requiredAmount = options.targetValue + estimatedFee;

    return createSelectionFailure(
      SelectionFailureReason.SELECTION_FAILED,
      'Accumulative fallback failed to find suitable UTXOs',
      {
        availableBalance,
        requiredAmount,
        utxoCount: utxos.length,
        targetValue: options.targetValue,
      },
    );
  }

  /**
   * Simple accumulative selection as ultimate fallback
   * This method tries to find optimal solutions by considering changeless first
   */
  private simpleAccumulativeSelection(
    utxos: UTXO[],
    options: SelectionOptions,
  ): EnhancedSelectionResult {
    console.log(
      `SimpleAccumulative: utxos=${utxos.length}, target=${options.targetValue}, totalAvailable=${
        this.sumUTXOs(utxos)
      }`,
    );

    if (utxos.length === 0) {
      return createSelectionFailure(
        SelectionFailureReason.NO_UTXOS_AVAILABLE,
        'No UTXOs available for simple accumulative selection',
        { utxoCount: 0, requiredAmount: options.targetValue },
      );
    }

    const dustThreshold = options.dustThreshold || this.DUST_THRESHOLD;

    // First, try to find a changeless solution by testing single UTXOs and small combinations
    const changelessResult = this.findOptimalChangeless(utxos, options, dustThreshold);
    if (changelessResult.success) {
      return changelessResult;
    }

    // If no changeless solution, fall back to regular accumulative with change
    return this.fallbackAccumulativeWithChange(utxos, options, dustThreshold);
  }

  /**
   * Try to find optimal changeless solutions
   */
  private findOptimalChangeless(
    utxos: UTXO[],
    options: SelectionOptions,
    dustThreshold: number,
  ): EnhancedSelectionResult {
    let bestChangeless: { utxos: UTXO[]; excess: number; fee: number; waste: number } | null = null;

    // Try single UTXOs first
    for (const utxo of utxos) {
      const fee = this.estimateFee(1, 1, options.feeRate);
      const required = options.targetValue + fee;

      if (utxo.value >= required) {
        const excess = utxo.value - required;
        if (excess <= dustThreshold) {
          const waste = this.calculateChangelessWaste([utxo], options.targetValue, options.feeRate);
          if (!bestChangeless || waste < bestChangeless.waste) {
            bestChangeless = { utxos: [utxo], excess, fee, waste };
          }
        }
      }
    }

    // Try combinations of 2-3 UTXOs for changeless
    for (let i = 0; i < utxos.length && i < 3; i++) {
      for (let j = i + 1; j < utxos.length && j < 6; j++) {
        const combination = [utxos[i]!, utxos[j]!];
        const totalValue = this.sumUTXOs(combination);
        const fee = this.estimateFee(2, 1, options.feeRate);
        const required = options.targetValue + fee;

        if (totalValue >= required) {
          const excess = totalValue - required;
          if (excess <= dustThreshold) {
            const waste = this.calculateChangelessWaste(
              combination,
              options.targetValue,
              options.feeRate,
            );
            if (!bestChangeless || waste < bestChangeless.waste) {
              bestChangeless = { utxos: combination, excess, fee, waste };
            }
          }
        }

        // Try with 3 UTXOs if 2 isn't enough
        for (let k = j + 1; k < utxos.length && k < 8; k++) {
          const combination3 = [utxos[i]!, utxos[j]!, utxos[k]!];
          const totalValue3 = this.sumUTXOs(combination3);
          const fee3 = this.estimateFee(3, 1, options.feeRate);
          const required3 = options.targetValue + fee3;

          if (totalValue3 >= required3) {
            const excess3 = totalValue3 - required3;
            if (excess3 <= dustThreshold) {
              const waste3 = this.calculateChangelessWaste(
                combination3,
                options.targetValue,
                options.feeRate,
              );
              if (!bestChangeless || waste3 < bestChangeless.waste) {
                bestChangeless = { utxos: combination3, excess: excess3, fee: fee3, waste: waste3 };
              }
            }
          }
        }
      }
    }

    if (bestChangeless) {
      const totalValue = this.sumUTXOs(bestChangeless.utxos);
      console.log(
        `Found changeless solution: inputs=${bestChangeless.utxos.length}, excess=${bestChangeless.excess}, waste=${bestChangeless.waste}`,
      );
      return createSelectionSuccess(
        bestChangeless.utxos,
        totalValue,
        bestChangeless.excess,
        bestChangeless.fee,
        {
          wasteMetric: bestChangeless.waste,
          outputCount: 1,
          estimatedVSize: this.estimateTransactionSize(bestChangeless.utxos.length, 1),
        },
      );
    }

    return createSelectionFailure(
      SelectionFailureReason.NO_SOLUTION_FOUND,
      'No changeless solution found',
      { utxoCount: utxos.length, targetValue: options.targetValue },
    );
  }

  /**
   * Fallback accumulative selection with change
   */
  private fallbackAccumulativeWithChange(
    utxos: UTXO[],
    options: SelectionOptions,
    dustThreshold: number,
  ): EnhancedSelectionResult {
    const selected: UTXO[] = [];
    let totalValue = 0;

    // Add UTXOs until we have enough for a transaction with change
    for (const utxo of utxos) {
      selected.push(utxo);
      totalValue += utxo.value;

      const fee = this.estimateFee(selected.length, 2, options.feeRate);
      const required = options.targetValue + fee;

      if (totalValue >= required) {
        const change = totalValue - options.targetValue - fee;
        console.log(
          `  Testing with change: inputs=${selected.length}, totalValue=${totalValue}, required=${required}, change=${change}, dustThreshold=${dustThreshold}`,
        );

        if (change >= dustThreshold) {
          console.log(
            `SimpleAccumulative SUCCESS: inputs=${selected.length}, totalValue=${totalValue}, change=${change}, fee=${fee}`,
          );
          const wasteMetric = this.calculateWasteWithChange(
            selected,
            options.targetValue,
            options.feeRate,
          );
          return createSelectionSuccess(
            [...selected],
            totalValue,
            change,
            fee,
            {
              wasteMetric,
              outputCount: 2,
              estimatedVSize: this.estimateTransactionSize(selected.length, 2),
            },
          );
        }
      }

      // Don't add too many inputs
      if (selected.length >= (options.maxInputs || 20)) {
        break;
      }
    }

    // If we get here, no solution was found
    const availableBalance = this.sumUTXOs(utxos);
    const minFee = this.estimateFee(1, 1, options.feeRate);

    return createSelectionFailure(
      availableBalance < options.targetValue + minFee
        ? SelectionFailureReason.INSUFFICIENT_FUNDS
        : SelectionFailureReason.SELECTION_FAILED,
      `Simple accumulative selection failed: available=${availableBalance}, target=${options.targetValue}`,
      {
        availableBalance,
        requiredAmount: options.targetValue + minFee,
        utxoCount: utxos.length,
        targetValue: options.targetValue,
      },
    );
  }

  /**
   * Enhanced waste calculation with Bitcoin Core alignment
   */
  protected override calculateWaste(
    inputs: UTXO[],
    targetValue: number,
    feeRate: number,
    longTermFeeRate: number = this.LONG_TERM_FEE_RATE,
  ): number {
    const totalValue = this.sumUTXOs(inputs);
    const currentFee = this.estimateFee(inputs.length, 2, feeRate);
    const change = totalValue - targetValue - currentFee;

    // Cost of creating and spending change
    const changeCost = change > this.DUST_THRESHOLD
      ? this.OUTPUT_SIZE * feeRate + this.INPUT_SIZE * longTermFeeRate
      : 0;

    // Excess value in dust change
    const excessCost = change > 0 && change <= this.DUST_THRESHOLD ? change : 0;

    // Input waste from fee rate difference
    const inputWaste = inputs.reduce((waste, _) => {
      const currentInputCost = this.INPUT_SIZE * feeRate;
      const futureInputCost = this.INPUT_SIZE * longTermFeeRate;
      return waste + Math.max(0, currentInputCost - futureInputCost);
    }, 0);

    return changeCost + excessCost + inputWaste;
  }

  /**
   * Get algorithm performance metrics
   */
  getPerformanceMetrics(): {
    maxIterations: number;
    maxDepth: number;
    costOfChange: number;
    longTermFeeRate: number;
  } {
    return {
      maxIterations: this.MAX_ITERATIONS,
      maxDepth: this.MAX_DEPTH,
      costOfChange: this.COST_OF_CHANGE,
      longTermFeeRate: this.LONG_TERM_FEE_RATE,
    };
  }
}
