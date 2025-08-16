/**
 * UTXO Selector Factory
 * Creates selector instances based on algorithm type
 */

import type {
  IUTXOSelector,
  SelectionOptions,
  SelectorAlgorithm,
} from '../interfaces/selector.interface.ts';
import type { EnhancedSelectionResult } from '../interfaces/selector-result.interface.ts';
import { SelectionFailureReason } from '../interfaces/selector-result.interface.ts';

import { BaseSelector } from './base-selector.ts';
import { AccumulativeSelector } from './accumulative.ts';
import { BlackjackSelector } from './blackjack.ts';
import { BranchAndBoundSelector } from './branch-and-bound.ts';
import { ConsolidationSelector } from './consolidation-selector.ts';
import { KnapsackSelector } from './knapsack-selector.ts';
import { MockProtectionDetector, ProtectionAwareSelector } from './protection-aware-selector.ts';
import type { IProtectionDetector } from '../interfaces/protection.interface.ts';
import { OutputGroupSelector } from './output-group-selector.ts';
import { SingleRandomDrawSelector } from './single-random-draw-selector.ts';
import {
  TaxOptimizedSelector,
  type TaxStrategy,
  type UTXOTaxMetadata,
} from './tax-optimized-selector.ts';
import { WasteOptimizedSelector } from './waste-optimized.ts';

export class SelectorFactory {
  private static instance: SelectorFactory | null = null;
  private selectorCache = new Map<string, IUTXOSelector>();
  private protectionDetector: IProtectionDetector | null = null;
  private taxMetadata: UTXOTaxMetadata[] = [];
  private currentBTCPrice: number = 0;

  /**
   * Get singleton instance
   */
  static getInstance(): SelectorFactory {
    if (!SelectorFactory.instance) {
      SelectorFactory.instance = new SelectorFactory();
    }
    return SelectorFactory.instance;
  }

  /**
   * Configure protection detector for protection-aware selection
   */
  setProtectionDetector(detector: IProtectionDetector): void {
    this.protectionDetector = detector;
  }

  /**
   * Configure tax metadata for tax-optimized selection
   */
  setTaxMetadata(metadata: UTXOTaxMetadata[], btcPrice: number): void {
    this.taxMetadata = metadata;
    this.currentBTCPrice = btcPrice;
  }

  /**
   * Create selector instance with optional configuration
   */
  create(
    algorithm: SelectorAlgorithm | string,
    config?: {
      protectionDetector?: IProtectionDetector;
      fallbackSelector?: IUTXOSelector;
      taxStrategy?: TaxStrategy;
      taxMetadata?: UTXOTaxMetadata[];
      btcPrice?: number;
      privacyLevel?: 'low' | 'medium' | 'high';
      consolidationThreshold?: number;
      longTermFeeRate?: number;
    },
  ): IUTXOSelector {
    // Create cache key including config for advanced selectors
    const cacheKey = this.getCacheKey(algorithm, config);

    // Return cached instance if available
    if (this.selectorCache.has(cacheKey)) {
      return this.selectorCache.get(cacheKey)!;
    }

    let selector: IUTXOSelector;

    switch (algorithm) {
      case 'accumulative':
        selector = new AccumulativeSelector();
        break;
      case 'branch-and-bound':
        selector = new BranchAndBoundSelector();
        break;
      case 'blackjack':
        selector = new BlackjackSelector();
        break;
      case 'waste-optimized':
        selector = new WasteOptimizedSelector();
        break;
      case 'knapsack':
        selector = new KnapsackSelector();
        break;
      case 'single-random-draw':
        selector = new SingleRandomDrawSelector();
        break;
      case 'output-group': {
        const fallbackForOutputGroup = config?.fallbackSelector
          ? config.fallbackSelector as BaseSelector
          : new BranchAndBoundSelector();
        selector = new OutputGroupSelector(
          config?.privacyLevel || 'medium',
          fallbackForOutputGroup,
        );
        break;
      }
      case 'consolidation':
        selector = new ConsolidationSelector({
          consolidationThreshold: config?.consolidationThreshold,
          longTermFeeRate: config?.longTermFeeRate,
        });
        break;
      case 'protection-aware': {
        const detectorOrMock = config?.protectionDetector || this.protectionDetector ||
          new MockProtectionDetector();
        const fallbackSelector = config?.fallbackSelector
          ? config.fallbackSelector as BaseSelector
          : new BranchAndBoundSelector();
        selector = new ProtectionAwareSelector(detectorOrMock, fallbackSelector);
        break;
      }
      case 'tax-optimized-fifo':
      case 'tax-optimized-lifo':
      case 'tax-optimized-hifo':
      case 'tax-optimized-lofo': {
        const taxStrategy = algorithm.replace('tax-optimized-', '')
          .toUpperCase() as TaxStrategy;
        const taxMetadata = config?.taxMetadata || this.taxMetadata;
        const currentPrice = config?.btcPrice || this.currentBTCPrice;

        if (!taxMetadata.length || !currentPrice) {
          throw new Error(
            'Tax-optimized selector requires tax metadata and BTC price',
          );
        }

        const fallbackSelector = config?.fallbackSelector
          ? config.fallbackSelector as BaseSelector
          : new BranchAndBoundSelector();
        selector = new TaxOptimizedSelector({
          strategy: taxStrategy,
          taxMetadata,
          currentBTCPrice: currentPrice,
          fallbackSelector,
        });
        break;
      }

      // Legacy simple implementations for backward compatibility
      case 'fifo':
        selector = new FIFOSelector();
        break;
      case 'lifo':
        selector = new LIFOSelector();
        break;

      default:
        throw new Error(`Unknown selector algorithm: ${algorithm}`);
    }

    // Cache the selector
    this.selectorCache.set(cacheKey, selector);
    return selector;
  }

  /**
   * Generate cache key for selector with config
   */
  private getCacheKey(algorithm: string, config?: any): string {
    if (!config) return algorithm;

    // Create a simple hash of config for caching
    const configStr = JSON.stringify(config, (_key, value) => {
      // Skip functions and complex objects for cache key
      if (
        typeof value === 'function' ||
        (value instanceof Object && value.constructor !== Object)
      ) {
        return undefined;
      }
      return value;
    });

    return `${algorithm}-${this.simpleHash(configStr)}`;
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get all available algorithms
   */
  getAvailableAlgorithms(): string[] {
    return [
      // Core algorithms
      'accumulative',
      'branch-and-bound',
      'blackjack',
      'waste-optimized',

      // New advanced algorithms
      'knapsack',
      'single-random-draw',
      'output-group',
      'consolidation',
      'protection-aware',

      // Tax-optimized variants
      'tax-optimized-fifo',
      'tax-optimized-lifo',
      'tax-optimized-hifo',
      'tax-optimized-lofo',

      // Legacy simple implementations
      'fifo',
      'lifo',
    ];
  }

  /**
   * Get recommended algorithm based on scenario
   */
  getRecommendedAlgorithm(scenario: {
    utxoCount: number;
    targetValue: number;
    feeRate: number;
    dustThreshold?: number | undefined;
  }): SelectorAlgorithm {
    const { utxoCount, feeRate } = scenario;

    // For small UTXO sets, use Branch & Bound for optimal selection
    if (utxoCount <= 20) {
      return 'branch-and-bound';
    }

    // For exact value matching scenarios, use Blackjack
    if (this.isLikelyExactMatch(scenario)) {
      return 'blackjack';
    }

    // For high fee environments, use waste-optimized
    if (feeRate > 50) {
      return 'waste-optimized';
    }

    // Default to accumulative for large UTXO sets
    return 'accumulative';
  }

  /**
   * Check if scenario is likely to benefit from exact matching
   */
  private isLikelyExactMatch(scenario: {
    utxoCount: number;
    targetValue: number;
    dustThreshold?: number;
  }): boolean {
    const { utxoCount, targetValue } = scenario;

    // Small target values with many UTXOs are good candidates for exact matching
    return utxoCount > 10 && targetValue < 100000; // 0.001 BTC
  }

  /**
   * Clear selector cache
   */
  clearCache(): void {
    this.selectorCache.clear();
  }

  /**
   * Get cache statistics
   */
  private isValidSelectorAlgorithm(key: string): key is SelectorAlgorithm {
    const validAlgorithms = [
      'accumulative',
      'branch-and-bound',
      'blackjack',
      'waste-optimized',
      'knapsack',
      'single-random-draw',
      'output-group',
      'consolidation',
      'protection-aware',
      'tax-optimized-fifo',
      'tax-optimized-lifo',
      'tax-optimized-hifo',
      'tax-optimized-lofo',
      'fifo',
      'lifo',
    ];
    return validAlgorithms.includes(key);
  }

  getCacheStats(): {
    size: number;
    algorithms: SelectorAlgorithm[];
  } {
    return {
      size: this.selectorCache.size,
      algorithms: Array.from(this.selectorCache.keys()).filter(
        this.isValidSelectorAlgorithm,
      ) as SelectorAlgorithm[],
    };
  }
}

// Simple legacy selector implementations
class FIFOSelector extends AccumulativeSelector {
  getName(): string {
    return 'fifo';
  }

  select(utxos: UTXO[], options: SelectionOptions) {
    return this.selectFIFO(utxos, options);
  }
}

class LIFOSelector extends AccumulativeSelector {
  getName(): string {
    return 'lifo';
  }

  select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    const validationFailure = this.checkOptionsValidity(options);
    if (validationFailure) return validationFailure;

    const filteredUTXOs = this.filterEligibleUTXOs(utxos, options);
    if (filteredUTXOs.length === 0) {
      return {
        success: false,
        reason: SelectionFailureReason.NO_UTXOS_AVAILABLE,
        message: 'No UTXOs available that meet confirmation requirements',
        details: {
          utxoCount: utxos.length,
          minConfirmations: options.minConfirmations,
        },
      };
    }

    // Sort by confirmations (newest first)
    const sortedUTXOs = [...filteredUTXOs].sort(
      (a, b) => (b.confirmations ?? 0) - (a.confirmations ?? 0),
    );

    return this.selectFromSortedLifo(sortedUTXOs, options);
  }

  private selectFromSortedLifo(
    sortedUTXOs: UTXO[],
    options: SelectionOptions,
  ): EnhancedSelectionResult {
    // Use the same logic as AccumulativeSelector but with pre-sorted UTXOs
    const selected: UTXO[] = [];
    let accumulated = 0;
    let estimatedFee = this.estimateFee(1, 2, options.feeRate);
    let target = options.targetValue + estimatedFee;

    for (const utxo of sortedUTXOs) {
      if (options.maxInputs && selected.length >= options.maxInputs) break;

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

// Note: KnapsackSelector implementation is imported from its own file

// Note: SingleRandomDrawSelector implementation is imported from its own file

// Re-export required types
import type { UTXO } from '../interfaces/provider.interface.ts';

// Removing unused function to satisfy linter

/**
 * Default factory instance
 */
export const selectorFactory = SelectorFactory.getInstance();

/**
 * Utility function to create selector
 */
export function createSelector(
  algorithm: SelectorAlgorithm | string,
  config?: Parameters<SelectorFactory['create']>[1],
): IUTXOSelector {
  return selectorFactory.create(algorithm, config);
}

/**
 * Utility function to get recommended selector
 */
export function getRecommendedSelector(scenario: {
  utxoCount: number;
  targetValue: number;
  feeRate: number;
  dustThreshold?: number;
}): IUTXOSelector {
  const algorithm = selectorFactory.getRecommendedAlgorithm(scenario);
  return selectorFactory.create(algorithm);
}

/**
 * Create protection-aware selector with mock detector
 */
export function createProtectionAwareSelector(
  protectedUtxos: string[] = [],
  fallbackAlgorithm: SelectorAlgorithm = 'branch-and-bound',
): IUTXOSelector {
  const detector = new MockProtectionDetector(protectedUtxos);
  const fallback = selectorFactory.create(fallbackAlgorithm) as BaseSelector;
  return new ProtectionAwareSelector(detector, fallback);
}

/**
 * Create tax-optimized selector
 */
export function createTaxOptimizedSelector(
  strategy: TaxStrategy,
  taxMetadata: UTXOTaxMetadata[],
  btcPrice: number,
  fallbackAlgorithm?: SelectorAlgorithm,
): IUTXOSelector {
  return selectorFactory.create(`tax-optimized-${strategy.toLowerCase()}`, {
    taxMetadata,
    btcPrice,
    fallbackSelector: fallbackAlgorithm ? selectorFactory.create(fallbackAlgorithm) : undefined,
  });
}

/**
 * Create privacy-optimized selector
 */
export function createPrivacySelector(
  level: 'low' | 'medium' | 'high' = 'medium',
  fallbackAlgorithm?: SelectorAlgorithm,
): IUTXOSelector {
  return selectorFactory.create('output-group', {
    privacyLevel: level,
    fallbackSelector: fallbackAlgorithm ? selectorFactory.create(fallbackAlgorithm) : undefined,
  });
}

/**
 * Create consolidation-optimized selector
 */
export function createConsolidationSelector(
  threshold?: number,
  longTermFeeRate?: number,
): IUTXOSelector {
  return selectorFactory.create('consolidation', {
    consolidationThreshold: threshold,
    longTermFeeRate,
  });
}

// Re-export new selector types for convenience
export type { TaxCalculation, TaxStrategy, UTXOTaxMetadata } from './tax-optimized-selector';
export type { OutputGroup } from './output-group-selector';
export type { ConsolidationMetrics } from './consolidation-selector';
export { MockProtectionDetector } from './protection-aware-selector';
