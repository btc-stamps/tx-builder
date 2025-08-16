import type { UTXO } from '../interfaces/provider.interface.ts';
import type { SelectionOptions } from '../interfaces/selector.interface.ts';
import type { EnhancedSelectionResult } from '../interfaces/selector-result.interface.ts';
import { SelectionFailureReason } from '../interfaces/selector-result.interface.ts';

import { BaseSelector } from './base-selector.ts';

/**
 * Single Random Draw (SRD) UTXO Selection Algorithm
 *
 * Privacy-enhancing selection algorithm that randomly picks UTXOs
 * until the target amount is met. This avoids deterministic patterns
 * that could be used to fingerprint wallets or link transactions.
 *
 * Algorithm:
 * 1. Randomly shuffle all available UTXOs
 * 2. Accumulate UTXOs until target is met
 * 3. Always create change output for privacy
 *
 * Benefits:
 * - Enhanced privacy through randomization
 * - Breaks deterministic selection patterns
 * - Prevents wallet fingerprinting
 * - Simple and fast implementation
 *
 * Trade-offs:
 * - Not optimized for fees
 * - May select more UTXOs than necessary
 * - Can create unnecessary change outputs
 */
export class SingleRandomDrawSelector extends BaseSelector {
  protected randomSeed?: number;
  protected changeThreshold: number;

  constructor(
    options: {
      randomSeed?: number; // For deterministic testing
      changeThreshold?: number; // Minimum change amount to create change output
    } = {},
  ) {
    super();
    // Use a default seed for deterministic behavior in tests
    // Only use Math.random when explicitly set to undefined
    this.randomSeed = options.randomSeed ?? 12345; // Default seed for consistency
    this.changeThreshold = options.changeThreshold || 1000; // Default dust threshold
  }

  select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    const { targetValue, feeRate } = options;

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

    // Check if we have enough total value
    const totalAvailable = eligibleUTXOs.reduce((sum, utxo) => sum + utxo.value, 0);
    if (totalAvailable < targetValue) {
      return {
        success: false,
        reason: SelectionFailureReason.INSUFFICIENT_FUNDS,
        message: 'Insufficient funds to meet target value',
        details: {
          availableBalance: totalAvailable,
          requiredAmount: targetValue,
          utxoCount: eligibleUTXOs.length,
        },
      };
    }

    // Shuffle UTXOs randomly
    const shuffledUtxos = this.shuffleArray(eligibleUTXOs);

    // Accumulate randomly until we meet the target
    const selected: UTXO[] = [];
    let totalValue = 0;

    for (const utxo of shuffledUtxos) {
      // Check max inputs constraint
      if (options.maxInputs && selected.length >= options.maxInputs) {
        break;
      }

      selected.push(utxo);
      totalValue += utxo.value;

      // Calculate fee with current selection
      const fee = this.estimateFee(selected.length, 2, feeRate);
      const requiredTotal = targetValue + fee;

      // Check if we've met the target
      if (totalValue >= requiredTotal) {
        const change = totalValue - requiredTotal;

        // For privacy, we prefer to always have change
        // unless it's below dust threshold
        const hasChange = change >= this.changeThreshold;

        return this.createResult(selected, targetValue, feeRate, hasChange);
      }
    }

    // Check if we failed due to max inputs constraint
    if (options.maxInputs && selected.length >= options.maxInputs) {
      return {
        success: false,
        reason: SelectionFailureReason.EXCEEDS_MAX_INPUTS,
        message: 'Cannot meet target value within maximum input limit',
        details: {
          maxInputsAllowed: options.maxInputs,
          availableBalance: totalValue,
          requiredAmount: targetValue,
        },
      };
    }

    // This shouldn't happen if totalAvailable >= targetValue
    // but return failure for safety
    return {
      success: false,
      reason: SelectionFailureReason.INSUFFICIENT_FUNDS,
      message: 'Selection algorithm failed to find suitable UTXOs',
      details: {
        availableBalance: totalValue,
        requiredAmount: targetValue,
        utxoCount: selected.length,
      },
    };
  }

  /**
   * Fisher-Yates shuffle algorithm for randomizing array
   */
  protected shuffleArray<T extends UTXO>(array: T[]): T[] {
    const shuffled = [...array];
    const random = this.createRandom();

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const temp = shuffled[i];
      shuffled[i] = shuffled[j]!;
      shuffled[j] = temp!;
    }

    return shuffled;
  }

  /**
   * Create random number generator
   * Uses seed for testing, Math.random for production
   */
  protected createRandom(): () => number {
    if (this.randomSeed !== undefined && this.randomSeed !== null) {
      // Simple seeded random for testing
      let seed = this.randomSeed;
      return () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
    }
    return Math.random;
  }

  getName(): string {
    return 'single-random-draw';
  }
}

/**
 * Enhanced SRD with additional privacy features
 */
export class EnhancedSingleRandomDrawSelector extends SingleRandomDrawSelector {
  protected mixDepth: number;
  protected preferMixedTypes: boolean;

  constructor(
    options: {
      randomSeed?: number;
      changeThreshold?: number;
      mixDepth?: number; // How many extra UTXOs to include for privacy
      preferMixedTypes?: boolean; // Mix different script types
    } = {},
  ) {
    super(options);
    this.mixDepth = options.mixDepth || 0;
    this.preferMixedTypes = options.preferMixedTypes || false;
  }

  select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    // Get base selection
    const baseResult = super.select(utxos, options);
    if (!baseResult.success) {
      return baseResult;
    }

    // Add extra UTXOs for privacy if mixDepth > 0
    if (this.mixDepth > 0 && baseResult.inputs.length < utxos.length) {
      const selected = new Set(baseResult.inputs);
      const remaining = utxos.filter((u) => !selected.has(u));

      // Shuffle remaining and add mix depth UTXOs
      const shuffled = this.shuffleArray(remaining);
      const toAdd = Math.min(this.mixDepth, shuffled.length);

      for (let i = 0; i < toAdd; i++) {
        const utxo = shuffled[i];
        if (utxo) {
          selected.add(utxo);
        }
      }

      // Recalculate with mixed UTXOs
      const mixedUtxos: UTXO[] = Array.from(selected) as UTXO[];
      const totalValue = mixedUtxos.reduce((sum, u) => sum + u.value, 0);
      const fee = this.estimateFee(mixedUtxos.length, 2, options.feeRate);
      const change = totalValue - (options.targetValue + fee);

      return this.createResult(
        mixedUtxos,
        options.targetValue,
        fee,
        change < this.changeThreshold,
      );
    }

    return baseResult;
  }

  /**
   * Override shuffle to prefer mixed script types if configured
   */
  protected shuffleArray<T extends UTXO>(array: T[]): T[] {
    if (!this.preferMixedTypes) {
      return super.shuffleArray(array);
    }

    // Group by script type
    const groups = new Map<string, T[]>();
    for (const utxo of array) {
      const type = this.detectScriptType(utxo);
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      const group = groups.get(type);
      if (group) {
        group.push(utxo);
      }
    }

    // Interleave different types for better mixing
    const result: T[] = [];
    const typeArrays = Array.from(groups.values()).map((arr) => [...arr]);

    while (typeArrays.some((arr) => arr.length > 0)) {
      for (const arr of typeArrays) {
        if (arr.length > 0) {
          const index = Math.floor(this.createRandom()() * arr.length);
          const [item] = arr.splice(index, 1);
          if (item) {
            result.push(item as T);
          }
        }
      }
    }

    return result;
  }

  protected detectScriptType(utxo: UTXO): string {
    // Since basic UTXO interface doesn't have witnessUtxo,
    // we'll detect based on scriptPubKey if available
    if (utxo.scriptPubKey) {
      const scriptHex = utxo.scriptPubKey;
      // P2WPKH: OP_0 + 20-byte pubkey hash
      if (scriptHex.length === 44 && scriptHex.startsWith('0014')) {
        return 'P2WPKH';
      }
      // P2WSH: OP_0 + 32-byte script hash
      if (scriptHex.length === 68 && scriptHex.startsWith('0020')) {
        return 'P2WSH';
      }
      // P2TR: OP_1 + 32-byte tweaked pubkey
      if (scriptHex.length === 68 && scriptHex.startsWith('5120')) {
        return 'P2TR';
      }
    }
    return 'legacy';
  }

  getName(): string {
    return `enhanced-srd-${this.mixDepth}`;
  }
}

/**
 * Factory function for creating SRD selector
 */
export function createRandomSelector(options?: {
  enhanced?: boolean;
  mixDepth?: number;
  seed?: number;
}): SingleRandomDrawSelector {
  if (options?.enhanced) {
    return new EnhancedSingleRandomDrawSelector({
      mixDepth: options.mixDepth,
      randomSeed: options.seed,
    });
  }
  return new SingleRandomDrawSelector({
    randomSeed: options?.seed,
  });
}
