/**
 * Blackjack UTXO Selection Algorithm
 * Exact value matching algorithm inspired by the card game
 * Optimized for finding combinations that match target exactly
 */

import type { UTXO } from '../interfaces/provider.interface.ts';
import type { SelectionOptions } from '../interfaces/selector.interface.ts';
import type { EnhancedSelectionResult } from '../interfaces/selector-result.interface.ts';
import { SelectionFailureReason } from '../interfaces/selector-result.interface.ts';

import { BaseSelector } from './base-selector.ts';

interface BlackjackCandidate {
  utxos: UTXO[];
  totalValue: number;
  exactness: number; // How close to target (lower is better)
}

/**
 * Blackjack UTXO Selection Algorithm - Exact value matching optimization
 *
 * The Blackjack algorithm is inspired by the card game where the goal is to get as close
 * to a target value as possible without going over. This selector prioritizes finding UTXO
 * combinations that exactly match the target amount plus fees, minimizing change outputs
 * and transaction waste.
 *
 * @remarks
 * The algorithm works in two phases:
 * 1. **Exact Match Phase**: Systematically searches for combinations that create changeless
 *    transactions (total input = target + fee exactly)
 * 2. **Closest Match Phase**: If no exact match exists, finds the combination closest to the
 *    target while still covering the required amount
 *
 * Key features:
 * - Prioritizes changeless transactions to minimize fees and UTXO set bloat
 * - Uses combinatorial search with configurable limits (MAX_COMBINATIONS = 10,000)
 * - Supports both single-output (no change) and dual-output (with change) transactions
 * - Implements "exactness" scoring to measure how close combinations are to the target
 * - Falls back to subset sum dynamic programming for optimization
 * - Handles dust threshold validation to prevent unspendable outputs
 *
 * Performance characteristics:
 * - Excellent for small to medium UTXO sets (< 20 UTXOs)
 * - May be slower for large UTXO sets due to combinatorial complexity
 * - Optimal when exact matches are likely (e.g., consolidation scenarios)
 *
 * @example
 * ```typescript
 * const selector = new BlackjackSelector();
 * const result = selector.select(utxos, {
 *   targetValue: 100000, // 100,000 satoshis
 *   feeRate: 10,        // 10 sat/vB
 *   maxInputs: 5,       // Limit search space
 *   dustThreshold: 546  // Bitcoin dust threshold
 * });
 *
 * if (result.success) {
 *   console.log(`Selected ${result.inputCount} UTXOs`);
 *   console.log(`Change: ${result.change} satoshis`);
 *   console.log(`Fee: ${result.fee} satoshis`);
 * }
 * ```
 */
export class BlackjackSelector extends BaseSelector {
  private readonly MAX_COMBINATIONS = 10000;
  private readonly EXACT_MATCH_TOLERANCE = 0; // Satoshis tolerance for "exact" match

  getName(): string {
    return 'blackjack';
  }

  select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    const validationFailure = this.checkOptionsValidity(options);
    if (validationFailure) return validationFailure;

    // Filter and validate UTXOs
    const filteredUTXOs = this.filterEligibleUTXOs(utxos, options);
    if (filteredUTXOs.length === 0) {
      return {
        success: false,
        reason: SelectionFailureReason.NO_UTXOS_AVAILABLE,
        message: 'No UTXOs available after filtering',
        details: {
          availableBalance: 0,
          requiredAmount: options.targetValue,
          utxoCount: 0,
        },
      };
    }

    // Calculate total available balance for failure reporting
    const totalAvailable = this.sumUTXOs(filteredUTXOs);

    // Use optimistic fee estimate for initial check (1 input, 1 output)
    // The main algorithm will determine if a more complex transaction is needed
    const minFee = this.estimateFee(1, 1, options.feeRate);
    const minRequiredAmount = options.targetValue + minFee;

    // Quick check for insufficient funds with optimistic estimate
    if (totalAvailable < minRequiredAmount) {
      return {
        success: false,
        reason: SelectionFailureReason.INSUFFICIENT_FUNDS,
        message: `Insufficient funds: have ${totalAvailable}, need at least ${minRequiredAmount}`,
        details: {
          availableBalance: totalAvailable,
          requiredAmount: minRequiredAmount,
          utxoCount: filteredUTXOs.length,
          targetValue: options.targetValue,
        },
      };
    }

    // Sort by value for better search efficiency
    const sortedUTXOs = this.sortByValue(filteredUTXOs, false); // Ascending

    // Try to find exact match first
    const exactMatch = this.findExactMatch(sortedUTXOs, options);
    if (exactMatch.success) {
      return exactMatch;
    }

    // If no exact match, find closest match
    const closestMatch = this.findClosestMatch(sortedUTXOs, options);

    // If still no solution, return enriched failure information
    if (!closestMatch.success) {
      // Estimate a reasonable required amount for error reporting
      const estimatedFee = this.estimateFee(2, 2, options.feeRate);
      const estimatedRequired = options.targetValue + estimatedFee;

      return {
        success: false,
        reason: SelectionFailureReason.SELECTION_FAILED,
        message: 'Blackjack algorithm failed to find suitable UTXOs',
        details: {
          availableBalance: totalAvailable,
          requiredAmount: estimatedRequired,
          utxoCount: filteredUTXOs.length,
          targetValue: options.targetValue,
        },
      };
    }

    return closestMatch;
  }

  /**
   * Find exact match for changeless transaction
   */
  private findExactMatch(
    utxos: UTXO[],
    options: SelectionOptions,
  ): EnhancedSelectionResult {
    const maxInputs = Math.min(options.maxInputs || 10, utxos.length);

    // Try different combination sizes, starting with smaller ones
    for (let size = 1; size <= maxInputs; size++) {
      const exactMatch = this.findExactCombination(utxos, options, size);
      if (exactMatch) {
        return exactMatch;
      }
    }

    const totalValue = this.sumUTXOs(utxos);
    const estimatedFee = this.estimateFee(1, 1, options.feeRate);
    const requiredAmount = options.targetValue + estimatedFee;

    return {
      success: false,
      reason: SelectionFailureReason.NO_SOLUTION_FOUND,
      message: 'No exact match found',
      details: {
        availableBalance: totalValue,
        requiredAmount: requiredAmount,
        utxoCount: utxos.length,
        targetValue: options.targetValue,
      },
    };
  }

  /**
   * Find exact combination of specific size
   */
  private findExactCombination(
    utxos: UTXO[],
    options: SelectionOptions,
    size: number,
  ): EnhancedSelectionResult {
    const combinations = this.generateCombinations(utxos, size);
    let bestCandidate: BlackjackCandidate | null = null;

    for (const combination of combinations) {
      const totalValue = this.sumUTXOs(combination);
      const fee = this.estimateFee(combination.length, 1, options.feeRate);
      const required = options.targetValue + fee;
      const exactness = Math.abs(totalValue - required);

      // Check if this is an exact match
      if (exactness <= this.EXACT_MATCH_TOLERANCE) {
        const candidate: BlackjackCandidate = {
          utxos: combination,
          totalValue,
          exactness,
        };

        if (!bestCandidate || exactness < bestCandidate.exactness) {
          bestCandidate = candidate;
        }
      }
    }

    if (bestCandidate) {
      return this.createResult(
        bestCandidate.utxos,
        options.targetValue,
        options.feeRate,
        false, // No change for exact match
      );
    }

    const totalValue = this.sumUTXOs(utxos);
    const estimatedFee = this.estimateFee(1, 1, options.feeRate);
    const requiredAmount = options.targetValue + estimatedFee;

    return {
      success: false,
      reason: SelectionFailureReason.NO_SOLUTION_FOUND,
      message: 'No exact combination found',
      details: {
        availableBalance: totalValue,
        requiredAmount: requiredAmount,
        utxoCount: utxos.length,
        targetValue: options.targetValue,
      },
    };
  }

  /**
   * Find closest match when exact match is not possible
   */
  private findClosestMatch(
    utxos: UTXO[],
    options: SelectionOptions,
  ): EnhancedSelectionResult {
    const maxInputs = Math.min(options.maxInputs || 15, utxos.length);
    let bestCandidate: BlackjackCandidate | null = null;

    // Try different combination sizes
    for (let size = 1; size <= maxInputs; size++) {
      const candidate = this.findBestCombinationOfSize(utxos, options, size);

      if (candidate && this.isValidCandidate(candidate, options)) {
        if (
          !bestCandidate ||
          this.isBetterCandidate(candidate, bestCandidate, options)
        ) {
          bestCandidate = candidate;
        }
      }
    }

    if (!bestCandidate) {
      const totalValue = this.sumUTXOs(utxos);
      const estimatedFee = this.estimateFee(1, 2, options.feeRate);
      const requiredAmount = options.targetValue + estimatedFee;

      return {
        success: false,
        reason: SelectionFailureReason.NO_SOLUTION_FOUND,
        message: 'No suitable closest match found',
        details: {
          availableBalance: totalValue,
          requiredAmount: requiredAmount,
          utxoCount: utxos.length,
          targetValue: options.targetValue,
        },
      };
    }

    // Determine if result has change
    const fee = this.estimateFee(
      bestCandidate.utxos.length,
      2,
      options.feeRate,
    );
    const change = bestCandidate.totalValue - options.targetValue - fee;
    const dustThreshold = options.dustThreshold || this.DUST_THRESHOLD;
    const hasChange = change >= dustThreshold;

    if (!hasChange) {
      // Recalculate with single output
      const singleOutputFee = this.estimateFee(
        bestCandidate.utxos.length,
        1,
        options.feeRate,
      );
      const requiredForSingleOutput = options.targetValue + singleOutputFee;

      if (bestCandidate.totalValue >= requiredForSingleOutput) {
        return this.createResult(
          bestCandidate.utxos,
          options.targetValue,
          options.feeRate,
          false,
        );
      }
    }

    if (hasChange) {
      const result = this.createResult(
        bestCandidate.utxos,
        options.targetValue,
        options.feeRate,
        true,
      );

      // Add waste metric
      result.wasteMetric = this.calculateWaste(
        bestCandidate.utxos,
        options.targetValue,
        options.feeRate,
      );

      return result;
    }

    const totalValue = this.sumUTXOs(utxos);
    const estimatedFee = this.estimateFee(1, 2, options.feeRate);
    const requiredAmount = options.targetValue + estimatedFee;

    return {
      success: false,
      reason: SelectionFailureReason.DUST_OUTPUT,
      message: 'Cannot create valid output - would create dust',
      details: {
        availableBalance: totalValue,
        requiredAmount: requiredAmount,
        utxoCount: utxos.length,
        targetValue: options.targetValue,
        dustThreshold: options.dustThreshold || this.DUST_THRESHOLD,
      },
    };
  }

  /**
   * Find best combination of specific size
   */
  private findBestCombinationOfSize(
    utxos: UTXO[],
    options: SelectionOptions,
    size: number,
  ): BlackjackCandidate | null {
    const combinations = this.generateCombinations(utxos, size);
    let bestCandidate: BlackjackCandidate | null = null;

    for (const combination of combinations) {
      const totalValue = this.sumUTXOs(combination);

      // Calculate exactness for both changeless and change scenarios
      const changelessFee = this.estimateFee(
        combination.length,
        1,
        options.feeRate,
      );
      const changelessRequired = options.targetValue + changelessFee;
      const changelessExactness = Math.abs(totalValue - changelessRequired);

      const withChangeFee = this.estimateFee(
        combination.length,
        2,
        options.feeRate,
      );
      const withChangeRequired = options.targetValue + withChangeFee;
      const withChangeExactness = totalValue >= withChangeRequired
        ? Math.abs(totalValue - withChangeRequired)
        : Infinity;

      // Choose better exactness (prefer changeless if close)
      const exactness = changelessExactness <= withChangeExactness
        ? changelessExactness
        : withChangeExactness;

      const candidate: BlackjackCandidate = {
        utxos: combination,
        totalValue,
        exactness,
      };

      if (!bestCandidate || exactness < bestCandidate.exactness) {
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  /**
   * Generate combinations of UTXOs
   */
  private generateCombinations(utxos: UTXO[], size: number): UTXO[][] {
    const combinations: UTXO[][] = [];
    const maxCombinations = Math.min(
      this.MAX_COMBINATIONS,
      this.binomialCoefficient(utxos.length, size),
    );

    this.generateCombinationsRecursive(
      utxos,
      size,
      0,
      [],
      combinations,
      maxCombinations,
    );

    return combinations;
  }

  /**
   * Recursive combination generation with limit
   */
  private generateCombinationsRecursive(
    utxos: UTXO[],
    size: number,
    startIndex: number,
    current: UTXO[],
    results: UTXO[][],
    maxResults: number,
  ): void {
    if (results.length >= maxResults) return;

    if (current.length === size) {
      results.push([...current]);
      return;
    }

    const remaining = size - current.length;
    const available = utxos.length - startIndex;

    if (remaining > available) return;

    for (
      let i = startIndex;
      i <= utxos.length - remaining && results.length < maxResults;
      i++
    ) {
      current.push(utxos[i]!);
      this.generateCombinationsRecursive(
        utxos,
        size,
        i + 1,
        current,
        results,
        maxResults,
      );
      current.pop();
    }
  }

  /**
   * Calculate binomial coefficient (n choose k)
   */
  private binomialCoefficient(n: number, k: number): number {
    if (k > n) return 0;
    if (k === 0 || k === n) return 1;

    k = Math.min(k, n - k); // Take advantage of symmetry

    let result = 1;
    for (let i = 0; i < k; i++) {
      result = (result * (n - i)) / (i + 1);
    }

    return Math.floor(result);
  }

  /**
   * Check if candidate is valid for transaction
   */
  private isValidCandidate(
    candidate: BlackjackCandidate,
    options: SelectionOptions,
  ): boolean {
    // Check minimum value requirement
    const minFee = this.estimateFee(candidate.utxos.length, 1, options.feeRate);
    const minRequired = options.targetValue + minFee;

    return candidate.totalValue >= minRequired;
  }

  /**
   * Compare two candidates to determine which is better
   */
  private isBetterCandidate(
    candidate1: BlackjackCandidate,
    candidate2: BlackjackCandidate,
    options: SelectionOptions,
  ): boolean {
    // Blackjack principle: prefer the candidate that's closest to target but over it

    // Check if either candidate is very close to exact (within tolerance)
    const isVeryExact1 = candidate1.exactness <= this.EXACT_MATCH_TOLERANCE;
    const isVeryExact2 = candidate2.exactness <= this.EXACT_MATCH_TOLERANCE;

    // Strongly prefer very exact matches over everything else
    if (isVeryExact1 !== isVeryExact2) {
      return isVeryExact1; // Exact match wins over non-exact, regardless of change
    }

    // For blackjack strategy: prefer smaller total values that meet the requirement
    // This ensures we pick 51000 over 100000 when target is 50000

    // First check if both candidates meet the minimum requirement
    const minFee1 = this.estimateFee(candidate1.utxos.length, 1, options.feeRate);
    const minRequired1 = options.targetValue + minFee1;
    const meetsMin1 = candidate1.totalValue >= minRequired1;

    const minFee2 = this.estimateFee(candidate2.utxos.length, 1, options.feeRate);
    const minRequired2 = options.targetValue + minFee2;
    const meetsMin2 = candidate2.totalValue >= minRequired2;

    // If only one meets minimum requirement, prefer that one
    if (meetsMin1 !== meetsMin2) {
      return meetsMin1;
    }

    // If both meet minimum requirement, prefer smaller total (closer to target)
    if (meetsMin1 && meetsMin2) {
      if (candidate1.totalValue !== candidate2.totalValue) {
        return candidate1.totalValue < candidate2.totalValue;
      }
    }

    // If both have same exactness category, prefer more exact matches
    if (candidate1.exactness !== candidate2.exactness) {
      return candidate1.exactness < candidate2.exactness;
    }

    // If exactness is equal, prefer fewer inputs
    if (candidate1.utxos.length !== candidate2.utxos.length) {
      return candidate1.utxos.length < candidate2.utxos.length;
    }

    // Final tiebreaker: prefer smaller total value
    return candidate1.totalValue < candidate2.totalValue;
  }

  /**
   * Optimized selection for specific target amounts
   * Uses dynamic programming approach for better performance
   */
  selectOptimized(
    utxos: UTXO[],
    options: SelectionOptions,
  ): EnhancedSelectionResult {
    const validationFailure = this.checkOptionsValidity(options);
    if (validationFailure) return validationFailure;

    const filteredUTXOs = this.filterEligibleUTXOs(utxos, options);
    if (filteredUTXOs.length === 0) {
      return {
        success: false,
        reason: SelectionFailureReason.NO_UTXOS_AVAILABLE,
        message: 'No UTXOs available after filtering',
        details: {
          availableBalance: 0,
          requiredAmount: options.targetValue,
          utxoCount: 0,
        },
      };
    }

    // Use subset sum approach for exact target matching
    const targetWithFee = options.targetValue +
      this.estimateFee(2, 1, options.feeRate); // Estimate

    const result = this.subsetSum(
      filteredUTXOs,
      targetWithFee,
      options.maxInputs || 10,
    );

    if (result.length > 0) {
      return this.createResult(
        result,
        options.targetValue,
        options.feeRate,
        false,
      );
    }

    // Fallback to regular blackjack algorithm
    return this.select(utxos, options);
  }

  /**
   * Subset sum algorithm for exact matching
   */
  private subsetSum(
    utxos: UTXO[],
    target: number,
    maxInputs: number,
  ): UTXO[] {
    const n = Math.min(utxos.length, maxInputs);

    // DP table: dp[i][sum] = true if sum is possible with first i UTXOs
    const dp: boolean[][] = Array(n + 1)
      .fill(null)
      .map(() => Array(target + 1).fill(false));

    // Base case: sum 0 is always possible with 0 UTXOs
    for (let i = 0; i <= n; i++) {
      dp[i]![0] = true;
    }

    // Fill DP table
    for (let i = 1; i <= n; i++) {
      const utxo = utxos[i - 1]!;
      for (let sum = 1; sum <= target; sum++) {
        // Don't include current UTXO
        dp[i]![sum] = dp[i - 1]![sum] || false;

        // Include current UTXO if possible
        if (sum >= utxo.value && dp[i - 1]![sum - utxo.value]) {
          dp[i]![sum] = true;
        }
      }
    }

    // If target sum is not possible
    if (!dp[n]![target]) {
      return [];
    }

    // Backtrack to find the actual subset
    const result: UTXO[] = [];
    let currentSum = target;

    for (let i = n; i > 0 && currentSum > 0; i--) {
      // If current sum was not possible without UTXOs[i-1], include it
      if (!dp[i - 1]![currentSum]) {
        result.push(utxos[i - 1]!);
        currentSum -= utxos[i - 1]!.value;
      }
    }

    return result.reverse(); // Return in original order
  }

  /**
   * Get algorithm statistics
   */
  getStats(): {
    maxCombinations: number;
    exactMatchTolerance: number;
  } {
    return {
      maxCombinations: this.MAX_COMBINATIONS,
      exactMatchTolerance: this.EXACT_MATCH_TOLERANCE,
    };
  }
}
