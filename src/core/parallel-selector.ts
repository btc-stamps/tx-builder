/**
 * Parallel Algorithm Execution System
 * Runs multiple UTXO selection algorithms in parallel for optimal results
 */

import type {
  SelectionOptions,
  SelectionResult,
  SelectorAlgorithm,
  UTXO,
} from '../interfaces/selector.interface.ts';
import { isSelectionSuccess } from '../interfaces/selector-result.interface.ts';

import { PerformanceAwareSelectorFactory } from './performance-aware-selector.ts';
import { PerformanceMonitor } from './performance-monitor.ts';

export interface ParallelSelectionConfig {
  maxConcurrency: number; // Maximum number of algorithms to run simultaneously
  timeoutMs: number; // Timeout for each algorithm
  returnFirst: boolean; // Return first successful result or wait for all
  enableRacing: boolean; // Enable racing mode (fastest wins)
  qualityThreshold: number; // Minimum quality score to consider a result
  enableFallback: boolean; // Enable fallback to sequential execution
}

export interface ParallelSelectionResult {
  result: SelectionResult;
  algorithm: SelectorAlgorithm;
  executionTime: number;
  allResults: Array<{
    algorithm: SelectorAlgorithm;
    result: SelectionResult | null;
    executionTime: number;
    error?: string;
  }>;
  totalExecutionTime: number;
  winnerMetrics: {
    wasteScore: number;
    efficiencyScore: number;
    qualityScore: number;
  };
}

export interface AlgorithmResult {
  algorithm: SelectorAlgorithm;
  result: SelectionResult | null;
  executionTime: number;
  error?: string;
  metrics: {
    wasteScore: number;
    efficiencyScore: number;
    qualityScore: number;
  };
}

/**
 * Parallel UTXO selection system
 */
export class ParallelSelector {
  private selectorFactory: PerformanceAwareSelectorFactory;
  private performanceMonitor: PerformanceMonitor;
  private config: Required<ParallelSelectionConfig>;
  private workerPool: Worker[] = [];
  private activeJobs = new Map<
    string,
    {
      resolve: (value: AlgorithmResult) => void;
      reject: (error: Error) => void;
      timeout: number;
    }
  >();

  constructor(
    selectorFactory: PerformanceAwareSelectorFactory,
    performanceMonitor: PerformanceMonitor,
    config?: Partial<ParallelSelectionConfig>,
  ) {
    this.selectorFactory = selectorFactory;
    this.performanceMonitor = performanceMonitor;
    this.config = {
      maxConcurrency: 4,
      timeoutMs: 5000,
      returnFirst: false,
      enableRacing: true,
      qualityThreshold: 0.7,
      enableFallback: true,
      ...config,
    };
  }

  /**
   * Select UTXOs using parallel algorithm execution
   */
  async selectParallel(
    utxos: UTXO[],
    options: SelectionOptions,
    algorithms?: SelectorAlgorithm[],
  ): Promise<ParallelSelectionResult | null> {
    const startTime = Date.now();

    // Determine algorithms to run
    const selectedAlgorithms = algorithms ||
      this.selectOptimalAlgorithms(utxos, options);

    if (selectedAlgorithms.length === 0) {
      return null;
    }

    // Limit concurrency
    const algorithmsToRun = selectedAlgorithms.slice(
      0,
      this.config.maxConcurrency,
    );

    try {
      // Run algorithms in parallel
      const results = await this.runAlgorithmsParallel(
        utxos,
        options,
        algorithmsToRun,
      );

      // Process results
      const successfulResults = results.filter((r) => r.result !== null);

      if (successfulResults.length === 0) {
        // Try fallback if enabled
        if (this.config.enableFallback) {
          return await this.fallbackToSequential(
            utxos,
            options,
            selectedAlgorithms,
          );
        }
        return null;
      }

      // Select best result
      const winner = this.selectBestResult(successfulResults);
      const totalExecutionTime = Date.now() - startTime;

      return {
        result: winner.result!,
        algorithm: winner.algorithm,
        executionTime: winner.executionTime,
        allResults: results,
        totalExecutionTime,
        winnerMetrics: winner.metrics,
      };
    } catch (error) {
      console.error('Parallel selection failed:', error);

      // Fallback to sequential if enabled
      if (this.config.enableFallback) {
        return await this.fallbackToSequential(
          utxos,
          options,
          selectedAlgorithms,
        );
      }

      return null;
    }
  }

  /**
   * Select UTXOs using racing mode (first successful result wins)
   */
  async selectRacing(
    utxos: UTXO[],
    options: SelectionOptions,
    algorithms?: SelectorAlgorithm[],
  ): Promise<ParallelSelectionResult | null> {
    const startTime = Date.now();
    const selectedAlgorithms = algorithms ||
      this.selectOptimalAlgorithms(utxos, options);

    if (selectedAlgorithms.length === 0) {
      return null;
    }

    const algorithmsToRun = selectedAlgorithms.slice(
      0,
      this.config.maxConcurrency,
    );

    // Create promises for each algorithm
    const algorithmPromises = algorithmsToRun.map((algorithm) =>
      this.runAlgorithmWithTimeout(utxos, options, algorithm)
    );

    try {
      // Wait for first successful result
      const winner = await Promise.any(
        algorithmPromises.map(async (promise, index) => {
          const result = await promise;
          if (result.result === null) {
            throw new Error(`Algorithm ${algorithmsToRun[index]} failed`);
          }
          return result;
        }),
      );

      // Wait a bit more to collect other results for comparison
      const allResults = await Promise.allSettled(algorithmPromises);
      const processedResults = allResults.map((settled, index) => {
        if (settled.status === 'fulfilled') {
          return settled.value;
        } else {
          return {
            algorithm: algorithmsToRun[index]!,
            result: null,
            executionTime: this.config.timeoutMs,
            error: settled.reason?.message || 'Unknown error',
            metrics: {
              wasteScore: Infinity,
              efficiencyScore: 0,
              qualityScore: 0,
            },
          };
        }
      });

      const totalExecutionTime = Date.now() - startTime;

      return {
        result: winner.result!,
        algorithm: winner.algorithm,
        executionTime: winner.executionTime,
        allResults: processedResults,
        totalExecutionTime,
        winnerMetrics: winner.metrics,
      };
    } catch (error) {
      console.error('Racing selection failed:', error);

      if (this.config.enableFallback) {
        return await this.fallbackToSequential(
          utxos,
          options,
          selectedAlgorithms,
        );
      }

      return null;
    }
  }

  /**
   * Run multiple algorithms and compare results
   */
  async benchmarkAlgorithms(
    utxos: UTXO[],
    options: SelectionOptions,
    algorithms?: SelectorAlgorithm[],
  ): Promise<Array<AlgorithmResult>> {
    const selectedAlgorithms = algorithms ||
      this.selectOptimalAlgorithms(utxos, options);
    return await this.runAlgorithmsParallel(utxos, options, selectedAlgorithms);
  }

  /**
   * Select optimal algorithms for the given scenario
   */
  private selectOptimalAlgorithms(
    utxos: UTXO[],
    options: SelectionOptions,
  ): SelectorAlgorithm[] {
    const scenario = {
      utxoCount: utxos.length,
      targetValue: options.targetValue,
      feeRate: options.feeRate,
      dustThreshold: options.dustThreshold,
    };

    // Get performance-based recommendations
    const recommended = this.selectorFactory.getRecommendedAlgorithm(scenario);
    const parallel = this.selectorFactory.getParallelSelectors(
      scenario,
      this.config.maxConcurrency,
    );

    // Combine recommended with parallel suggestions
    const algorithms: SelectorAlgorithm[] = [recommended];

    for (const selector of parallel) {
      const algorithmName = selector
        .getName()
        .replace('performance-aware-', '') as SelectorAlgorithm;
      if (!algorithms.includes(algorithmName)) {
        algorithms.push(algorithmName);
      }
    }

    return algorithms;
  }

  /**
   * Run algorithms in parallel
   */
  private async runAlgorithmsParallel(
    utxos: UTXO[],
    options: SelectionOptions,
    algorithms: SelectorAlgorithm[],
  ): Promise<AlgorithmResult[]> {
    const promises = algorithms.map((algorithm) =>
      this.runAlgorithmWithTimeout(utxos, options, algorithm)
    );

    const results = await Promise.allSettled(promises);

    return results.map((settled, index) => {
      if (settled.status === 'fulfilled') {
        return settled.value;
      } else {
        return {
          algorithm: algorithms[index]!,
          result: null,
          executionTime: this.config.timeoutMs,
          error: settled.reason?.message || 'Unknown error',
          metrics: {
            wasteScore: Infinity,
            efficiencyScore: 0,
            qualityScore: 0,
          },
        };
      }
    });
  }

  /**
   * Run single algorithm with timeout
   */
  private runAlgorithmWithTimeout(
    utxos: UTXO[],
    options: SelectionOptions,
    algorithm: SelectorAlgorithm,
  ): Promise<AlgorithmResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const selector = this.selectorFactory.create(algorithm);

      const timeout = setTimeout(() => {
        resolve({
          algorithm,
          result: null,
          executionTime: this.config.timeoutMs,
          error: 'Timeout',
          metrics: {
            wasteScore: Infinity,
            efficiencyScore: 0,
            qualityScore: 0,
          },
        });
      }, this.config.timeoutMs);

      try {
        // Use setTimeout to make it async
        setTimeout(() => {
          try {
            const result = selector.select(utxos, options);
            const executionTime = Date.now() - startTime;

            clearTimeout(timeout);

            const convertedResult = result.success ? result : null;
            const metrics = this.calculateMetrics(convertedResult, utxos, options);

            resolve({
              algorithm,
              result: convertedResult,
              executionTime,
              metrics,
            });
          } catch (error) {
            clearTimeout(timeout);
            resolve({
              algorithm,
              result: null,
              executionTime: Date.now() - startTime,
              error: error instanceof Error ? error.message : 'Unknown error',
              metrics: {
                wasteScore: Infinity,
                efficiencyScore: 0,
                qualityScore: 0,
              },
            });
          }
        }, 0);
      } catch (error) {
        clearTimeout(timeout);
        resolve({
          algorithm,
          result: null,
          executionTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error',
          metrics: {
            wasteScore: Infinity,
            efficiencyScore: 0,
            qualityScore: 0,
          },
        });
      }
    });
  }

  /**
   * Select best result from multiple successful results
   */
  private selectBestResult(results: AlgorithmResult[]): AlgorithmResult {
    if (results.length === 1) {
      return results[0]!;
    }

    // Filter by quality threshold
    const qualityResults = results.filter(
      (r) => r.metrics.qualityScore >= this.config.qualityThreshold,
    );

    if (qualityResults.length === 0) {
      // If no results meet quality threshold, pick the best available
      return results.reduce((best, current) =>
        current.metrics.qualityScore > best.metrics.qualityScore ? current : best
      );
    }

    // Among quality results, pick the most efficient
    return qualityResults.reduce((best, current) => {
      // Weighted scoring: quality (40%), efficiency (30%), waste (30%)
      const bestScore = best.metrics.qualityScore * 0.4 +
        best.metrics.efficiencyScore * 0.3 +
        (1 / (1 + best.metrics.wasteScore)) * 0.3;

      const currentScore = current.metrics.qualityScore * 0.4 +
        current.metrics.efficiencyScore * 0.3 +
        (1 / (1 + current.metrics.wasteScore)) * 0.3;

      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Calculate quality metrics for a result
   */
  private calculateMetrics(
    result: SelectionResult | null,
    utxos: UTXO[],
    options: SelectionOptions,
  ): { wasteScore: number; efficiencyScore: number; qualityScore: number } {
    if (!result) {
      return { wasteScore: Infinity, efficiencyScore: 0, qualityScore: 0 };
    }

    // Waste score (lower is better)
    const wasteScore = (isSelectionSuccess(result) && result.wasteMetric) ||
      this.calculateWaste(result, options);

    // Efficiency score (higher is better) - based on input count and value
    if (!isSelectionSuccess(result)) {
      return { wasteScore, efficiencyScore: 0, qualityScore: 0 };
    }

    const totalValue = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    const utilization = result.totalValue / totalValue;
    const inputEfficiency = 1 / result.inputs.length; // Fewer inputs = more efficient
    const efficiencyScore = (utilization + inputEfficiency) / 2;

    // Quality score (higher is better) - overall assessment
    const hasChange = result.change > (options.dustThreshold || 546);
    const changePenalty = hasChange ? 0.9 : 1.0; // Slight penalty for creating change
    const wasteNormalized = Math.min(1, 10000 / (wasteScore + 1)); // Normalize waste to 0-1
    const qualityScore = (wasteNormalized * changePenalty + efficiencyScore) /
      2;

    return { wasteScore, efficiencyScore, qualityScore };
  }

  /**
   * Calculate waste metric if not provided
   */
  private calculateWaste(
    result: SelectionResult,
    options: SelectionOptions,
  ): number {
    if (!isSelectionSuccess(result)) {
      return Infinity;
    }
    const excess = result.totalValue - options.targetValue - result.fee;
    const changeOutput = result.change > (options.dustThreshold || 546) ? 1 : 0;
    const changeCost = changeOutput * 34 * options.feeRate; // Cost of change output

    return excess + changeCost;
  }

  /**
   * Fallback to sequential execution
   */
  private fallbackToSequential(
    utxos: UTXO[],
    options: SelectionOptions,
    algorithms: SelectorAlgorithm[],
  ): Promise<ParallelSelectionResult | null> {
    console.warn('Falling back to sequential execution');

    return new Promise((resolve) => {
      for (const algorithm of algorithms) {
        try {
          const startTime = Date.now();
          const selector = this.selectorFactory.create(algorithm);
          const result = selector.select(utxos, options);

          if (result && result.success) {
            const convertedResult = result;
            const executionTime = Date.now() - startTime;
            const metrics = this.calculateMetrics(convertedResult, utxos, options);

            resolve({
              result: convertedResult,
              algorithm,
              executionTime,
              allResults: [
                {
                  algorithm,
                  result: convertedResult,
                  executionTime,
                },
              ],
              totalExecutionTime: executionTime,
              winnerMetrics: metrics,
            });
            return;
          }
        } catch (error) {
          console.warn(`Sequential fallback failed for ${algorithm}:`, error);
        }
      }

      resolve(null);
    });
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ParallelSelectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    config: Required<ParallelSelectionConfig>;
    activeJobs: number;
    workerPoolSize: number;
  } {
    return {
      config: this.config,
      activeJobs: this.activeJobs.size,
      workerPoolSize: this.workerPool.length,
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear any pending jobs
    for (const [, job] of this.activeJobs.entries()) {
      clearTimeout(job.timeout);
      job.reject(new Error('Cleanup - job cancelled'));
    }
    this.activeJobs.clear();

    // Cleanup worker pool if we had implemented workers
    this.workerPool.forEach((worker) => worker.terminate?.());
    this.workerPool = [];
  }
}

/**
 * Create parallel selector with default configuration
 */
export function createParallelSelector(
  selectorFactory: PerformanceAwareSelectorFactory,
  performanceMonitor: PerformanceMonitor,
  config?: Partial<ParallelSelectionConfig>,
): ParallelSelector {
  return new ParallelSelector(selectorFactory, performanceMonitor, config);
}

/**
 * Create high-performance parallel selector
 */
export function createHighPerformanceParallelSelector(
  selectorFactory: PerformanceAwareSelectorFactory,
  performanceMonitor: PerformanceMonitor,
): ParallelSelector {
  return new ParallelSelector(selectorFactory, performanceMonitor, {
    maxConcurrency: 6,
    timeoutMs: 3000,
    returnFirst: false,
    enableRacing: true,
    qualityThreshold: 0.8,
    enableFallback: true,
  });
}

/**
 * Create racing-optimized parallel selector (speed over quality)
 */
export function createRacingParallelSelector(
  selectorFactory: PerformanceAwareSelectorFactory,
  performanceMonitor: PerformanceMonitor,
): ParallelSelector {
  return new ParallelSelector(selectorFactory, performanceMonitor, {
    maxConcurrency: 8,
    timeoutMs: 1000,
    returnFirst: true,
    enableRacing: true,
    qualityThreshold: 0.5,
    enableFallback: true,
  });
}
