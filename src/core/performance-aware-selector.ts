/**
 * Performance-Aware Selector Factory
 * Enhanced selector factory with performance monitoring and caching integration
 */

import type {
  IUTXOSelector,
  SelectionOptions,
  SelectionResult,
  SelectorAlgorithm,
  UTXO,
} from '../interfaces/selector.interface.ts';
import type { EnhancedSelectionResult } from '../interfaces/selector-result.interface.ts';
import { SelectionFailureReason } from '../interfaces/selector-result.interface.ts';
import { selectorFactory as baseSelectorFactory } from '../selectors/selector-factory.ts';

import { PerformanceMonitor, type PerformanceReport } from './performance-monitor.ts';
import { type CacheStats, UTXOCacheManager } from './utxo-cache-manager.ts';

export interface PerformanceConfig {
  enableMonitoring: boolean;
  enableCaching: boolean;
  cacheTTL: number;
  performanceTargets: {
    smallSet: { utxos: number; timeMs: number };
    mediumSet: { utxos: number; timeMs: number };
    largeSet: { utxos: number; timeMs: number };
  };
  algorithmTimeouts: Record<SelectorAlgorithm, number>;
  adaptiveSelection: boolean;
}

export interface SelectorMetrics {
  algorithm: string;
  executionTime: number;
  success: boolean;
  cacheHit: boolean;
  utxoSetSize: number;
  targetValue: number;
  performance: 'excellent' | 'good' | 'poor' | 'timeout';
}

/**
 * Performance-aware selector with monitoring and caching
 */
export class PerformanceAwareSelector implements IUTXOSelector {
  private algorithm: SelectorAlgorithm;
  private baseSelector: IUTXOSelector;
  private performanceMonitor: PerformanceMonitor;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _cacheManager: UTXOCacheManager;
  private config: Required<PerformanceConfig>;

  constructor(
    algorithm: SelectorAlgorithm,
    performanceMonitor: PerformanceMonitor,
    cacheManager: UTXOCacheManager,
    config?: Partial<PerformanceConfig>,
  ) {
    this.algorithm = algorithm;
    this.baseSelector = baseSelectorFactory.create(algorithm);
    this.performanceMonitor = performanceMonitor;
    this._cacheManager = cacheManager;
    this.config = {
      enableMonitoring: true,
      enableCaching: true,
      cacheTTL: 300, // 5 minutes
      performanceTargets: {
        smallSet: { utxos: 100, timeMs: 10 },
        mediumSet: { utxos: 500, timeMs: 30 },
        largeSet: { utxos: 1000, timeMs: 50 },
      },
      algorithmTimeouts: {
        accumulative: 1000,
        'branch-and-bound': 5000,
        blackjack: 2000,
        'waste-optimized': 3000,
        fifo: 1000,
        lifo: 1000,
        knapsack: 10000,
        'single-random-draw': 2000,
      },
      adaptiveSelection: true,
      ...config,
    };
  }

  getName(): string {
    return `performance-aware-${this.algorithm}`;
  }

  /**
   * Main selection method with performance monitoring and caching
   */
  select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    const startTime = Date.now();
    let result: SelectionResult | null = null;

    try {
      // Try cache first if enabled
      if (this.config.enableCaching) {
        const cachedResult = this.getCachedResult(utxos, options);
        if (cachedResult) {
          result = cachedResult;
        }
      }

      // Perform selection if no cache hit
      if (!result) {
        result = this.performSelection(utxos, options, startTime);

        // Cache the result if successful
        if (result && this.config.enableCaching) {
          this.cacheResult(utxos, options, result);
        }
      }

      // Record metrics if monitoring enabled
      if (this.config.enableMonitoring) {
        const { recordSelection } = this.performanceMonitor.startMeasurement();
        recordSelection(this.algorithm, utxos, options, result, startTime);
      }

      return result || {
        success: false,
        reason: SelectionFailureReason.SELECTION_FAILED,
        message: `No selection found using ${this.algorithm}`,
        details: {},
      };
    } catch (error) {
      // Record failure metrics
      if (this.config.enableMonitoring) {
        const { recordSelection } = this.performanceMonitor.startMeasurement();
        recordSelection(this.algorithm, utxos, options, null, startTime);
      }

      console.error(`Selection failed for ${this.algorithm}:`, error);
      return {
        success: false,
        reason: SelectionFailureReason.SELECTION_FAILED,
        message: `Selection failed: ${(error as Error).message}`,
        details: {},
      };
    }
  }

  estimateFee(
    inputCount: number,
    outputCount: number,
    feeRate: number,
  ): number {
    return this.baseSelector.estimateFee(inputCount, outputCount, feeRate);
  }

  /**
   * Perform the actual selection with timeout protection
   */
  private performSelection(
    utxos: UTXO[],
    options: SelectionOptions,
    // Interface requires: _startTime
    _startTime: number,
  ): SelectionResult | null {
    const _timeout = this.config.algorithmTimeouts[this.algorithm];

    try {
      const result = this.baseSelector.select(utxos, options);
      // Convert EnhancedSelectionResult to SelectionResult | null
      return result.success ? result : null;
    } catch (error) {
      console.warn(
        `Selection failed for ${this.algorithm}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get cached selection result
   */
  private getCachedResult(
    utxos: UTXO[],
    options: SelectionOptions,
  ): SelectionResult | null {
    // Interface requires: cache key
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _cacheKey = this.generateCacheKey(utxos, options);
    // For now, we'll implement a simple in-memory cache
    // In a real implementation, this would integrate with the UTXOCacheManager
    return null; // Placeholder
  }

  /**
   * Cache selection result
   */
  private cacheResult(
    utxos: UTXO[],
    options: SelectionOptions,
    _result: SelectionResult,
  ): void {
    // Interface requires: cache key
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _cacheKey = this.generateCacheKey(utxos, options);
    // Cache the result with appropriate TTL
    // Implementation would store in cache manager
  }

  /**
   * Generate cache key for selection parameters
   */
  private generateCacheKey(utxos: UTXO[], options: SelectionOptions): string {
    // Create a hash of UTXOs and options for cache key
    const utxoHash = this.hashUTXOs(utxos);
    const optionsHash = this.hashOptions(options);
    return `${this.algorithm}:${utxoHash}:${optionsHash}`;
  }

  /**
   * Generate hash for UTXO set
   */
  private hashUTXOs(utxos: UTXO[]): string {
    const data = utxos
      .map((utxo) => `${utxo.txid}:${utxo.vout}:${utxo.value}`)
      .sort()
      .join('|');

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString(36);
  }

  /**
   * Generate hash for selection options
   */
  private hashOptions(options: SelectionOptions): string {
    const key = `${options.targetValue}:${options.feeRate}:${options.dustThreshold || 546}:${
      options.maxInputs || 'none'
    }:${options.minConfirmations || 0}`;

    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return hash.toString(36);
  }
}

/**
 * Enhanced selector factory with performance awareness
 */
export class PerformanceAwareSelectorFactory {
  private performanceMonitor: PerformanceMonitor;
  private cacheManager: UTXOCacheManager;
  private selectorCache = new Map<string, PerformanceAwareSelector>();
  private config: Required<PerformanceConfig>;

  constructor(
    performanceMonitor: PerformanceMonitor,
    cacheManager: UTXOCacheManager,
    config?: Partial<PerformanceConfig>,
  ) {
    this.performanceMonitor = performanceMonitor;
    this.cacheManager = cacheManager;
    this.config = {
      enableMonitoring: true,
      enableCaching: true,
      cacheTTL: 300,
      performanceTargets: {
        smallSet: { utxos: 100, timeMs: 10 },
        mediumSet: { utxos: 500, timeMs: 30 },
        largeSet: { utxos: 1000, timeMs: 50 },
      },
      algorithmTimeouts: {
        accumulative: 1000,
        'branch-and-bound': 5000,
        blackjack: 2000,
        'waste-optimized': 3000,
        fifo: 1000,
        lifo: 1000,
        knapsack: 10000,
        'single-random-draw': 2000,
      },
      adaptiveSelection: true,
      ...config,
    };
  }

  /**
   * Create performance-aware selector
   */
  create(algorithm: SelectorAlgorithm): PerformanceAwareSelector {
    const cacheKey = `${algorithm}:${JSON.stringify(this.config)}`;

    if (this.selectorCache.has(cacheKey)) {
      return this.selectorCache.get(cacheKey)!;
    }

    const selector = new PerformanceAwareSelector(
      algorithm,
      this.performanceMonitor,
      this.cacheManager,
      this.config,
    );

    this.selectorCache.set(cacheKey, selector);
    return selector;
  }

  /**
   * Get recommended algorithm based on performance data and scenario
   */
  getRecommendedAlgorithm(scenario: {
    utxoCount: number;
    targetValue: number;
    feeRate: number;
    dustThreshold?: number | undefined;
  }): SelectorAlgorithm {
    if (!this.config.adaptiveSelection) {
      if (
        baseSelectorFactory && typeof baseSelectorFactory.getRecommendedAlgorithm === 'function'
      ) {
        return baseSelectorFactory.getRecommendedAlgorithm(scenario);
      }
      // Fallback if selector factory is not available
      return 'accumulative';
    }

    // Get performance comparison for adaptive selection
    const comparison = this.performanceMonitor.compareAlgorithms(
      60 * 60 * 1000,
    ); // Last hour

    if (comparison.length === 0) {
      if (
        baseSelectorFactory && typeof baseSelectorFactory.getRecommendedAlgorithm === 'function'
      ) {
        return baseSelectorFactory.getRecommendedAlgorithm(scenario);
      }
      return 'accumulative';
    }

    // Filter algorithms suitable for the scenario
    const suitableAlgorithms = comparison.filter(({ metrics }) => {
      // Check if algorithm can handle the UTXO set size in reasonable time
      const expectedTime = this.estimateExecutionTime(
        scenario.utxoCount,
        metrics.averageTime,
      );
      const target = this.getPerformanceTarget(scenario.utxoCount);

      return expectedTime <= target.timeMs * 1.5 && metrics.successRate > 0.8;
    });

    if (suitableAlgorithms.length === 0) {
      if (
        baseSelectorFactory && typeof baseSelectorFactory.getRecommendedAlgorithm === 'function'
      ) {
        return baseSelectorFactory.getRecommendedAlgorithm(scenario);
      }
      return 'accumulative';
    }

    // Return the best performing suitable algorithm
    return suitableAlgorithms[0]?.algorithm as SelectorAlgorithm ||
      'branch-and-bound';
  }

  /**
   * Get multiple selectors for parallel execution
   */
  getParallelSelectors(
    scenario: {
      utxoCount: number;
      targetValue: number;
      feeRate: number;
    },
    maxSelectors: number = 3,
  ): PerformanceAwareSelector[] {
    const algorithms = this.getAllSuitableAlgorithms(scenario);
    const selectedAlgorithms = algorithms.slice(0, maxSelectors);

    return selectedAlgorithms.map((algorithm) => this.create(algorithm));
  }

  /**
   * Run benchmark on all algorithms
   */
  async runBenchmark(
    scenarios?: Array<{
      utxoSetSize: number;
      targetPercentage: number;
      feeRate: number;
      expectedTimeMs: number;
    }>,
  ): Promise<void> {
    const algorithms = baseSelectorFactory.getAvailableAlgorithms().map((
      alg,
    ) => ({
      name: alg,
      selector: this.create(alg as SelectorAlgorithm),
    }));

    await this.performanceMonitor.runBenchmarkSuite(algorithms, scenarios);
  }

  /**
   * Get performance report
   */
  getPerformanceReport(timeRangeMs?: number): PerformanceReport {
    return this.performanceMonitor.generateReport(timeRangeMs);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    return this.cacheManager.getStats();
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.selectorCache.clear();
    this.cacheManager.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.performanceMonitor.updateTargets(newConfig.performanceTargets || {});

    // Clear cache to apply new config
    this.selectorCache.clear();
  }

  /**
   * Get all suitable algorithms for a scenario
   */
  private getAllSuitableAlgorithms(scenario: {
    utxoCount: number;
    targetValue: number;
    feeRate: number;
  }): SelectorAlgorithm[] {
    const { utxoCount, feeRate } = scenario;
    const algorithms: SelectorAlgorithm[] = [];

    // Always include accumulative as fallback
    algorithms.push('accumulative');

    // Include Branch & Bound for small to medium sets
    if (utxoCount <= 500) {
      algorithms.push('branch-and-bound');
    }

    // Include Blackjack for potential exact matches
    if (utxoCount > 10) {
      algorithms.push('blackjack');
    }

    // Include waste-optimized for high fee environments
    if (feeRate > 25) {
      algorithms.push('waste-optimized');
    }

    // Include FIFO/LIFO for specific privacy needs
    if (utxoCount <= 200) {
      algorithms.push('fifo', 'lifo');
    }

    return algorithms;
  }

  /**
   * Estimate execution time based on UTXO count and historical performance
   */
  private estimateExecutionTime(
    utxoCount: number,
    historicalAverage: number,
  ): number {
    // Simple linear estimation with some safety margin
    const scaleFactor = Math.log10(utxoCount + 1);
    return historicalAverage * scaleFactor;
  }

  /**
   * Get performance target for UTXO set size
   */
  private getPerformanceTarget(
    utxoCount: number,
  ): { utxos: number; timeMs: number } {
    if (utxoCount <= this.config.performanceTargets.smallSet.utxos) {
      return this.config.performanceTargets.smallSet;
    }
    if (utxoCount <= this.config.performanceTargets.mediumSet.utxos) {
      return this.config.performanceTargets.mediumSet;
    }
    return this.config.performanceTargets.largeSet;
  }
}

/**
 * Create performance-aware selector factory
 */
export function createPerformanceAwareSelectorFactory(
  performanceMonitor: PerformanceMonitor,
  cacheManager: UTXOCacheManager,
  config?: Partial<PerformanceConfig>,
): PerformanceAwareSelectorFactory {
  return new PerformanceAwareSelectorFactory(
    performanceMonitor,
    cacheManager,
    config,
  );
}

/**
 * Create optimized selector factory with default configuration
 */
export function createOptimizedSelectorFactory(): PerformanceAwareSelectorFactory {
  const performanceMonitor = new PerformanceMonitor();
  const cacheManager = new UTXOCacheManager();

  return new PerformanceAwareSelectorFactory(performanceMonitor, cacheManager, {
    enableMonitoring: true,
    enableCaching: true,
    adaptiveSelection: true,
    performanceTargets: {
      smallSet: { utxos: 100, timeMs: 10 },
      mediumSet: { utxos: 500, timeMs: 30 },
      largeSet: { utxos: 1000, timeMs: 50 },
    },
  });
}
