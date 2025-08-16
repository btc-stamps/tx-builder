/**
 * Performance Monitoring System
 * Comprehensive monitoring for UTXO selection algorithms and transaction building
 */

import type { SelectionOptions, SelectionResult, UTXO } from '../interfaces/selector.interface.ts';
import { isSelectionSuccess } from '../interfaces/selector-result.interface.ts';
import process from 'node:process';

export interface AlgorithmMetrics {
  name: string;
  executionTime: number;
  success: boolean;
  inputCount?: number;
  totalValue?: number;
  fee?: number;
  change?: number;
  wasteMetric?: number;
  memoryUsage?: number;
  timestamp: number;
  utxoSetSize: number;
  targetValue: number;
  feeRate: number;
}

export interface PerformanceBenchmark {
  utxoSetSize: number;
  targetPercentage: number; // percentage of total UTXO value
  feeRate: number;
  expectedTimeMs: number;
}

export interface BenchmarkResult {
  benchmark: PerformanceBenchmark;
  algorithmResults: Array<{
    algorithm: string;
    metrics: AlgorithmMetrics;
    meetsTarget: boolean;
    performanceRatio: number; // actual time / expected time
  }>;
  winner: string | null;
  timestamp: number;
}

export interface MemoryProfile {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  peak: number;
  timestamp: number;
}

export interface PerformanceReport {
  timeRange: { start: number; end: number };
  totalSelections: number;
  successRate: number;
  averageExecutionTime: number;
  p95ExecutionTime: number;
  p99ExecutionTime: number;
  algorithmComparison: Record<
    string,
    {
      selectionCount: number;
      successRate: number;
      averageTime: number;
      averageWaste: number;
      preferredScenarios: string[];
    }
  >;
  memoryUsage: {
    peak: number;
    average: number;
    growth: number; // bytes per operation
  };
  recommendations: string[];
}

/**
 * Performance monitoring and benchmarking system
 */
export class PerformanceMonitor {
  private metrics: AlgorithmMetrics[] = [];
  private benchmarkHistory: BenchmarkResult[] = [];
  private memoryProfiles: MemoryProfile[] = [];
  private startTime = Date.now();
  private maxHistorySize = 10000;

  // Performance targets (configurable)
  private performanceTargets = {
    smallSet: { utxos: 100, timeMs: 10 }, // <10ms for 100 UTXOs
    mediumSet: { utxos: 500, timeMs: 30 }, // <30ms for 500 UTXOs
    largeSet: { utxos: 1000, timeMs: 50 }, // <50ms for 1000 UTXOs
    xlSet: { utxos: 5000, timeMs: 200 }, // <200ms for 5000 UTXOs
  };

  /**
   * Start performance measurement for an algorithm
   */
  startMeasurement(): {
    recordSelection: (
      algorithmName: string,
      utxos: UTXO[],
      options: SelectionOptions,
      result: SelectionResult | null,
      startTime: number,
    ) => void;
  } {
    const measurementStart = Date.now();
    const initialMemory = this.captureMemorySnapshot();
    console.debug('Performance measurement started', {
      measurementStart,
      initialMemory,
    }); // Use variables

    return {
      recordSelection: (
        algorithmName: string,
        utxos: UTXO[],
        options: SelectionOptions,
        result: SelectionResult | null,
        startTime: number,
      ) => {
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        const finalMemory = this.captureMemorySnapshot();

        const metrics: AlgorithmMetrics = {
          name: algorithmName,
          executionTime,
          success: result !== null && isSelectionSuccess(result),
          ...(result && isSelectionSuccess(result) && result.inputs.length !== undefined
            ? { inputCount: result.inputs.length }
            : {}),
          ...(result && isSelectionSuccess(result) && result.totalValue !== undefined
            ? { totalValue: result.totalValue }
            : {}),
          ...(result && isSelectionSuccess(result) && result.fee !== undefined
            ? { fee: result.fee }
            : {}),
          ...(result && isSelectionSuccess(result) && result.change !== undefined
            ? { change: result.change }
            : {}),
          ...(result && isSelectionSuccess(result) && result.wasteMetric !== undefined
            ? { wasteMetric: result.wasteMetric }
            : {}),
          memoryUsage: finalMemory.heapUsed - initialMemory.heapUsed,
          timestamp: endTime,
          utxoSetSize: utxos.length,
          targetValue: options.targetValue,
          feeRate: options.feeRate,
        };

        this.recordMetrics(metrics);
        this.checkPerformanceTargets(metrics);
      },
    };
  }

  /**
   * Record algorithm performance metrics
   */
  recordMetrics(metrics: AlgorithmMetrics): void {
    this.metrics.push(metrics);

    // Maintain history size
    if (this.metrics.length > this.maxHistorySize) {
      this.metrics = this.metrics.slice(-Math.floor(this.maxHistorySize * 0.8));
    }
  }

  /**
   * Run comprehensive benchmark suite
   */
  runBenchmarkSuite(
    algorithms: Array<{
      name: string;
      selector: any; // IUTXOSelector
    }>,
    testScenarios?: PerformanceBenchmark[],
  ): Promise<BenchmarkResult[]> {
    const scenarios = testScenarios || this.getDefaultBenchmarks();
    const results: BenchmarkResult[] = [];

    for (const benchmark of scenarios) {
      // Removed console log: benchmark details

      // Generate test UTXO set
      const utxos = this.generateTestUTXOs(benchmark.utxoSetSize);
      const totalValue = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
      const targetValue = Math.floor(
        totalValue * (benchmark.targetPercentage / 100),
      );

      const options: SelectionOptions = {
        targetValue,
        feeRate: benchmark.feeRate,
        dustThreshold: 546,
      };

      const algorithmResults = [];

      for (const { name, selector } of algorithms) {
        // Warm up
        selector.select(utxos.slice(0, 10), {
          targetValue: utxos.slice(0, 5).reduce((sum, u) => sum + u.value, 0),
          feeRate: benchmark.feeRate,
          dustThreshold: 546,
        });

        // Actual benchmark
        const startMemory = this.captureMemorySnapshot();
        const startTime = Date.now();

        const result = selector.select(utxos, options);

        const endTime = Date.now();
        const endMemory = this.captureMemorySnapshot();

        const executionTime = endTime - startTime;
        const memoryUsage = endMemory.heapUsed - startMemory.heapUsed;

        const metrics: AlgorithmMetrics = {
          name,
          executionTime,
          success: result !== null && isSelectionSuccess(result),
          ...(result && isSelectionSuccess(result) && result.inputs.length !== undefined
            ? { inputCount: result.inputs.length }
            : {}),
          ...(result && isSelectionSuccess(result) && result.totalValue !== undefined
            ? { totalValue: result.totalValue }
            : {}),
          ...(result && isSelectionSuccess(result) && result.fee !== undefined
            ? { fee: result.fee }
            : {}),
          ...(result && isSelectionSuccess(result) && result.change !== undefined
            ? { change: result.change }
            : {}),
          ...(result && isSelectionSuccess(result) && result.wasteMetric !== undefined
            ? { wasteMetric: result.wasteMetric }
            : {}),
          memoryUsage,
          timestamp: endTime,
          utxoSetSize: utxos.length,
          targetValue,
          feeRate: benchmark.feeRate,
        };

        algorithmResults.push({
          algorithm: name,
          metrics,
          meetsTarget: executionTime <= benchmark.expectedTimeMs,
          performanceRatio: executionTime / benchmark.expectedTimeMs,
        });

        // Record for historical analysis
        this.recordMetrics(metrics);
      }

      // Determine winner (successful + fastest)
      const successfulResults = algorithmResults.filter((r) => r.metrics.success);
      const winner = successfulResults.length > 0
        ? successfulResults.reduce((best, current) =>
          current.metrics.executionTime < best.metrics.executionTime ? current : best
        ).algorithm
        : null;

      const benchmarkResult: BenchmarkResult = {
        benchmark,
        algorithmResults,
        winner,
        timestamp: Date.now(),
      };

      results.push(benchmarkResult);
      this.benchmarkHistory.push(benchmarkResult);
    }

    // Clean up benchmark history
    if (this.benchmarkHistory.length > 100) {
      this.benchmarkHistory = this.benchmarkHistory.slice(-50);
    }

    return Promise.resolve(results);
  }

  /**
   * Generate performance report
   */
  generateReport(timeRangeMs: number = 24 * 60 * 60 * 1000): PerformanceReport {
    const cutoff = Date.now() - timeRangeMs;
    const recentMetrics = this.metrics.filter((m) => m.timestamp >= cutoff);

    if (recentMetrics.length === 0) {
      return this.getEmptyReport(cutoff, Date.now());
    }

    const totalSelections = recentMetrics.length;
    const successfulSelections = recentMetrics.filter((m) => m.success);
    const successRate = successfulSelections.length / totalSelections;

    // Execution time analysis
    const executionTimes = recentMetrics.map((m) => m.executionTime).sort((
      a,
      b,
    ) => a - b);
    const averageExecutionTime = executionTimes.reduce((sum, time) => sum + time, 0) /
      executionTimes.length;
    const p95Index = Math.floor(executionTimes.length * 0.95);
    const p99Index = Math.floor(executionTimes.length * 0.99);
    const p95ExecutionTime = executionTimes[p95Index] || 0;
    const p99ExecutionTime = executionTimes[p99Index] || 0;

    // Algorithm comparison
    const algorithmComparison: PerformanceReport['algorithmComparison'] = {};
    const algorithms = [...new Set(recentMetrics.map((m) => m.name))];

    for (const algorithm of algorithms) {
      const algorithmMetrics = recentMetrics.filter((m) => m.name === algorithm);
      const successfulAlgoMetrics = algorithmMetrics.filter((m) => m.success);

      algorithmComparison[algorithm] = {
        selectionCount: algorithmMetrics.length,
        successRate: successfulAlgoMetrics.length / algorithmMetrics.length,
        averageTime: algorithmMetrics.reduce((sum, m) => sum + m.executionTime, 0) /
          algorithmMetrics.length,
        averageWaste: successfulAlgoMetrics
          .filter((m) => m.wasteMetric !== undefined)
          .reduce((sum, m) => sum + (m.wasteMetric || 0), 0) /
          Math.max(1, successfulAlgoMetrics.length),
        preferredScenarios: this.getPreferredScenarios(
          algorithm,
          algorithmMetrics,
        ),
      };
    }

    // Memory analysis
    const recentMemoryProfiles = this.memoryProfiles.filter((p) => p.timestamp > cutoff);
    const metricsMemoryUsages = recentMetrics.filter((m) => m.memoryUsage !== undefined).map((m) =>
      m.memoryUsage!
    );

    let memoryPeak = 0;
    let memoryAverage = 0;

    if (recentMemoryProfiles.length > 0) {
      memoryPeak = Math.max(
        memoryPeak,
        ...recentMemoryProfiles.map((p) => p.peak),
      );
      memoryAverage = recentMemoryProfiles.reduce((sum, p) => sum + p.heapUsed, 0) /
        recentMemoryProfiles.length;
    }

    if (metricsMemoryUsages.length > 0) {
      memoryPeak = Math.max(memoryPeak, ...metricsMemoryUsages);
      if (memoryAverage === 0) {
        memoryAverage = metricsMemoryUsages.reduce((sum, mem) => sum + mem, 0) /
          metricsMemoryUsages.length;
      }
    }

    const memoryUsage = {
      peak: memoryPeak,
      average: memoryAverage,
      growth: this.calculateMemoryGrowth(recentMemoryProfiles),
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      algorithmComparison,
      averageExecutionTime,
      successRate,
      memoryUsage,
    );

    return {
      timeRange: { start: cutoff, end: Date.now() },
      totalSelections,
      successRate,
      averageExecutionTime,
      p95ExecutionTime,
      p99ExecutionTime,
      algorithmComparison,
      memoryUsage,
      recommendations,
    };
  }

  /**
   * Get algorithm performance comparison
   */
  compareAlgorithms(timeRangeMs: number = 60 * 60 * 1000): Array<{
    algorithm: string;
    metrics: {
      averageTime: number;
      successRate: number;
      wasteScore: number;
      memoryEfficiency: number;
      consistencyScore: number;
    };
    rank: number;
    bestUseCase: string;
  }> {
    const cutoff = Date.now() - timeRangeMs;
    const recentMetrics = this.metrics.filter((m) => m.timestamp >= cutoff);
    const algorithms = [...new Set(recentMetrics.map((m) => m.name))];

    const comparison = algorithms.map((algorithm) => {
      const algorithmMetrics = recentMetrics.filter((m) => m.name === algorithm);
      const successfulMetrics = algorithmMetrics.filter((m) => m.success);

      const averageTime = algorithmMetrics.reduce((sum, m) => sum + m.executionTime, 0) /
        algorithmMetrics.length;
      const successRate = successfulMetrics.length / algorithmMetrics.length;
      const wasteScore = this.calculateWasteScore(successfulMetrics);
      const memoryEfficiency = this.calculateMemoryEfficiency(algorithmMetrics);
      const consistencyScore = this.calculateConsistencyScore(algorithmMetrics);

      return {
        algorithm,
        metrics: {
          averageTime,
          successRate,
          wasteScore,
          memoryEfficiency,
          consistencyScore,
        },
        rank: 0, // Will be calculated
        bestUseCase: this.determineBestUseCase(algorithmMetrics),
      };
    });

    // Rank algorithms
    return comparison
      .sort((a, b) =>
        this.calculateOverallScore(b.metrics) -
        this.calculateOverallScore(a.metrics)
      )
      .map((item, index) => ({ ...item, rank: index + 1 }));
  }

  /**
   * Capture memory snapshot
   */
  private captureMemorySnapshot(): MemoryProfile {
    const memUsage = process.memoryUsage();

    const profile: MemoryProfile = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      peak: Math.max(
        ...this.memoryProfiles.map((p) => p.peak),
        memUsage.heapUsed,
      ),
      timestamp: Date.now(),
    };

    this.memoryProfiles.push(profile);

    // Maintain history
    if (this.memoryProfiles.length > 1000) {
      this.memoryProfiles = this.memoryProfiles.slice(-500);
    }

    return profile;
  }

  /**
   * Check if metrics meet performance targets
   */
  private checkPerformanceTargets(metrics: AlgorithmMetrics): void {
    const target = this.getPerformanceTarget(metrics.utxoSetSize);

    if (target && metrics.executionTime > target.timeMs) {
      // Removed console warn: performance target missed
    }
  }

  /**
   * Get performance target for UTXO set size
   */
  private getPerformanceTarget(
    utxoSetSize: number,
  ): { utxos: number; timeMs: number } | null {
    if (utxoSetSize <= this.performanceTargets.smallSet.utxos) {
      return this.performanceTargets.smallSet;
    }
    if (utxoSetSize <= this.performanceTargets.mediumSet.utxos) {
      return this.performanceTargets.mediumSet;
    }
    if (utxoSetSize <= this.performanceTargets.largeSet.utxos) {
      return this.performanceTargets.largeSet;
    }
    if (utxoSetSize <= this.performanceTargets.xlSet.utxos) {
      return this.performanceTargets.xlSet;
    }
    return null;
  }

  /**
   * Generate test UTXOs for benchmarking
   */
  private generateTestUTXOs(count: number): UTXO[] {
    const utxos: UTXO[] = [];

    for (let i = 0; i < count; i++) {
      // Generate realistic UTXO values
      let value: number;
      const rand = Math.random();

      if (rand < 0.1) {
        // 10% dust UTXOs (546-2000 sats)
        value = 546 + Math.floor(Math.random() * 1454);
      } else if (rand < 0.3) {
        // 20% small UTXOs (2K-10K sats)
        value = 2000 + Math.floor(Math.random() * 8000);
      } else if (rand < 0.7) {
        // 40% medium UTXOs (10K-100K sats)
        value = 10000 + Math.floor(Math.random() * 90000);
      } else if (rand < 0.9) {
        // 20% large UTXOs (100K-1M sats)
        value = 100000 + Math.floor(Math.random() * 900000);
      } else {
        // 10% very large UTXOs (1M-10M sats)
        value = 1000000 + Math.floor(Math.random() * 9000000);
      }

      utxos.push({
        txid: `benchmark${i}`,
        vout: 0,
        value,
        scriptPubKey: `script${i}`,
        confirmations: 1 + Math.floor(Math.random() * 100),
      });
    }

    return utxos;
  }

  /**
   * Get default benchmark scenarios
   */
  private getDefaultBenchmarks(): PerformanceBenchmark[] {
    return [
      // Small set tests
      { utxoSetSize: 10, targetPercentage: 50, feeRate: 10, expectedTimeMs: 5 },
      { utxoSetSize: 50, targetPercentage: 30, feeRate: 20, expectedTimeMs: 8 },
      {
        utxoSetSize: 100,
        targetPercentage: 25,
        feeRate: 15,
        expectedTimeMs: 10,
      },

      // Medium set tests
      {
        utxoSetSize: 250,
        targetPercentage: 40,
        feeRate: 10,
        expectedTimeMs: 20,
      },
      {
        utxoSetSize: 500,
        targetPercentage: 20,
        feeRate: 25,
        expectedTimeMs: 30,
      },

      // Large set tests
      {
        utxoSetSize: 1000,
        targetPercentage: 15,
        feeRate: 10,
        expectedTimeMs: 50,
      },
      {
        utxoSetSize: 2500,
        targetPercentage: 30,
        feeRate: 50,
        expectedTimeMs: 100,
      },

      // Stress tests
      {
        utxoSetSize: 5000,
        targetPercentage: 10,
        feeRate: 100,
        expectedTimeMs: 200,
      },
    ];
  }

  /**
   * Get preferred scenarios for algorithm
   */
  private getPreferredScenarios(
    _algorithm: string,
    metrics: AlgorithmMetrics[],
  ): string[] {
    const scenarios = [];

    // Analyze by UTXO set size
    const sizeGroups = {
      small: metrics.filter((m) => m.utxoSetSize <= 100),
      medium: metrics.filter((m) => m.utxoSetSize > 100 && m.utxoSetSize <= 500),
      large: metrics.filter((m) => m.utxoSetSize > 500),
    };

    for (const [size, groupMetrics] of Object.entries(sizeGroups)) {
      if (groupMetrics.length > 0) {
        const avgTime = groupMetrics.reduce((sum, m) => sum + m.executionTime, 0) /
          groupMetrics.length;
        const successRate = groupMetrics.filter((m) => m.success).length /
          groupMetrics.length;

        if (
          successRate > 0.9 &&
          avgTime <
            (this.getPerformanceTarget(groupMetrics[0]!.utxoSetSize)?.timeMs ??
                1000) * 1.5
        ) {
          scenarios.push(`${size} UTXO sets`);
        }
      }
    }

    return scenarios;
  }

  /**
   * Calculate waste score (lower is better)
   */
  private calculateWasteScore(metrics: AlgorithmMetrics[]): number {
    const wasteMetrics = metrics.filter((m) => m.wasteMetric !== undefined);
    if (wasteMetrics.length === 0) return 0;

    return wasteMetrics.reduce((sum, m) => sum + (m.wasteMetric || 0), 0) /
      wasteMetrics.length;
  }

  /**
   * Calculate memory efficiency score (higher is better)
   */
  private calculateMemoryEfficiency(metrics: AlgorithmMetrics[]): number {
    const memoryMetrics = metrics.filter((m) => m.memoryUsage !== undefined);
    if (memoryMetrics.length === 0) return 100;

    const avgMemoryPerUTXO = memoryMetrics.reduce(
      (sum, m) => sum + (m.memoryUsage || 0) / m.utxoSetSize,
      0,
    ) /
      memoryMetrics.length;

    // Lower memory usage per UTXO = higher score
    return Math.max(0, 100 - Math.log10(avgMemoryPerUTXO) * 10);
  }

  /**
   * Calculate consistency score (lower variance = higher score)
   */
  private calculateConsistencyScore(metrics: AlgorithmMetrics[]): number {
    if (metrics.length < 2) return 100;

    const times = metrics.map((m) => m.executionTime);
    const mean = times.reduce((sum, time) => sum + time, 0) / times.length;
    const variance = times.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) /
      times.length;
    const stdDev = Math.sqrt(variance);

    // Lower coefficient of variation = higher score
    const cv = stdDev / mean;
    return Math.max(0, 100 - cv * 100);
  }

  /**
   * Calculate overall score for ranking
   */
  private calculateOverallScore(metrics: {
    averageTime: number;
    successRate: number;
    wasteScore: number;
    memoryEfficiency: number;
    consistencyScore: number;
  }): number {
    // Weighted scoring
    const timeScore = Math.max(0, 100 - metrics.averageTime / 10); // Penalize slow algorithms
    const successScore = metrics.successRate * 100;
    const wasteScore = Math.max(0, 100 - metrics.wasteScore / 1000); // Penalize high waste

    return (
      timeScore * 0.3 +
      successScore * 0.3 +
      wasteScore * 0.2 +
      metrics.memoryEfficiency * 0.1 +
      metrics.consistencyScore * 0.1
    );
  }

  /**
   * Determine best use case for algorithm
   */
  private determineBestUseCase(metrics: AlgorithmMetrics[]): string {
    if (metrics.length === 0) return 'Unknown';

    const avgUtxoSize = metrics.reduce((sum, m) => sum + m.utxoSetSize, 0) /
      metrics.length;
    const avgTime = metrics.reduce((sum, m) => sum + m.executionTime, 0) /
      metrics.length;
    const successRate = metrics.filter((m) => m.success).length /
      metrics.length;

    if (avgTime < 10 && successRate > 0.95) {
      return 'High-frequency trading';
    }
    if (avgUtxoSize < 100 && avgTime < 20) {
      return 'Small UTXO sets';
    }
    if (avgUtxoSize > 1000 && successRate > 0.8) {
      return 'Large UTXO sets';
    }
    if (metrics.some((m) => m.wasteMetric && m.wasteMetric < 1000)) {
      return 'Low-fee environments';
    }

    return 'General purpose';
  }

  /**
   * Calculate memory growth rate
   */
  private calculateMemoryGrowth(profiles: MemoryProfile[]): number {
    if (profiles.length < 2) return 0;

    const sortedProfiles = profiles.sort((a, b) => a.timestamp - b.timestamp);
    const first = sortedProfiles[0];
    const last = sortedProfiles[sortedProfiles.length - 1];

    if (!first || !last) return 0;

    const timeSpan = last.timestamp - first.timestamp;
    const memoryChange = last.heapUsed - first.heapUsed;

    return timeSpan > 0 ? (memoryChange / timeSpan) * 1000 : 0; // bytes per second
  }

  /**
   * Generate recommendations based on performance data
   */
  private generateRecommendations(
    algorithmComparison: PerformanceReport['algorithmComparison'],
    averageExecutionTime: number,
    successRate: number,
    memoryUsage: any,
  ): string[] {
    const recommendations: string[] = [];

    if (averageExecutionTime > 100) {
      recommendations.push(
        'Consider optimizing algorithm selection for better performance',
      );
    }

    if (successRate < 0.9) {
      recommendations.push(
        'Low success rate detected - review UTXO selection parameters',
      );
    }

    if (memoryUsage.growth > 1000) {
      recommendations.push(
        'Memory growth detected - investigate potential memory leaks',
      );
    }

    // Algorithm-specific recommendations
    const algorithms = Object.entries(algorithmComparison);
    const bestAlgorithm = algorithms.reduce((best, [name, stats]) =>
      stats.successRate > best[1].successRate ? [name, stats] : best
    );

    if (bestAlgorithm[1].successRate > 0.95) {
      recommendations.push(
        `${bestAlgorithm[0]} shows excellent performance - consider as primary algorithm`,
      );
    }

    return recommendations;
  }

  /**
   * Get empty report structure
   */
  private getEmptyReport(start: number, end: number): PerformanceReport {
    return {
      timeRange: { start, end },
      totalSelections: 0,
      successRate: 0,
      averageExecutionTime: 0,
      p95ExecutionTime: 0,
      p99ExecutionTime: 0,
      algorithmComparison: {},
      memoryUsage: { peak: 0, average: 0, growth: 0 },
      recommendations: ['No data available for the specified time range'],
    };
  }

  /**
   * Export performance data
   */
  export(): {
    metrics: AlgorithmMetrics[];
    benchmarkHistory: BenchmarkResult[];
    memoryProfiles: MemoryProfile[];
    config: any;
  } {
    return {
      metrics: [...this.metrics],
      benchmarkHistory: [...this.benchmarkHistory],
      memoryProfiles: [...this.memoryProfiles],
      config: {
        performanceTargets: this.performanceTargets,
        maxHistorySize: this.maxHistorySize,
        startTime: this.startTime,
      },
    };
  }

  /**
   * Reset all performance data
   */
  reset(): void {
    this.metrics = [];
    this.benchmarkHistory = [];
    this.memoryProfiles = [];
    this.startTime = Date.now();
  }

  /**
   * Update performance targets
   */
  updateTargets(targets: Partial<typeof this.performanceTargets>): void {
    this.performanceTargets = { ...this.performanceTargets, ...targets };
  }

  /**
   * Initialize the performance monitor
   */
  initialize(): Promise<void> {
    // Reset state for fresh initialization
    this.reset();
    console.log('Performance Monitor initialized');
    return Promise.resolve();
  }

  /**
   * Start monitoring
   */
  startMonitoring(): void {
    console.log('Performance monitoring started');
  }

  /**
   * Set performance targets
   */
  setPerformanceTargets(targets: any): void {
    if (targets.maxResponseTime) {
      // Update performance targets based on provided config
      this.performanceTargets.smallSet.timeMs = Math.min(targets.maxResponseTime / 50, 10);
      this.performanceTargets.mediumSet.timeMs = Math.min(targets.maxResponseTime / 20, 30);
      this.performanceTargets.largeSet.timeMs = Math.min(targets.maxResponseTime / 10, 50);
      this.performanceTargets.xlSet.timeMs = Math.min(targets.maxResponseTime / 5, 200);
    }
  }

  /**
   * Log selection request
   */
  logRequest(requestId: string, request: any): void {
    console.log(
      `Request ${requestId}: UTXO selection started with ${request.utxos?.length || 0} UTXOs`,
    );
  }

  /**
   * Log selection response
   */
  logResponse(requestId: string, _result: any, metadata: any): void {
    console.log(
      `Request ${requestId}: Completed in ${metadata.executionTime}ms using ${metadata.algorithm}`,
    );
  }

  /**
   * Log error
   */
  logError(requestId: string, error: Error, executionTime: number): void {
    console.error(`Request ${requestId}: Failed after ${executionTime}ms - ${error.message}`);
  }

  /**
   * Get aggregated metrics for performance monitoring
   */
  getAggregatedMetrics(): any {
    const recentMetrics = this.metrics.filter((m) => m.timestamp > Date.now() - 3600000); // Last hour

    if (recentMetrics.length === 0) {
      return {
        totalRequests: 0,
        successRate: 0,
        averageResponseTime: 0,
        cacheHitRate: 0,
        resourceUtilization: { memory: 0, cpu: 0 },
        algorithmPerformance: new Map(),
      };
    }

    const successfulMetrics = recentMetrics.filter((m) => m.success);
    const totalRequests = recentMetrics.length;
    const successRate = successfulMetrics.length / totalRequests;
    const averageResponseTime = recentMetrics.reduce((sum, m) => sum + m.executionTime, 0) /
      totalRequests;

    // Calculate algorithm performance
    const algorithmPerformance = new Map();
    const algorithms = [...new Set(recentMetrics.map((m) => m.name))];

    for (const algorithm of algorithms) {
      const algorithmMetrics = recentMetrics.filter((m) => m.name === algorithm);
      const algorithmSuccessful = algorithmMetrics.filter((m) => m.success);

      algorithmPerformance.set(algorithm, {
        usage: algorithmMetrics.length / totalRequests,
        successRate: algorithmSuccessful.length / algorithmMetrics.length,
        averageTime: algorithmMetrics.reduce((sum, m) => sum + m.executionTime, 0) /
          algorithmMetrics.length,
      });
    }

    return {
      totalRequests,
      successRate,
      averageResponseTime,
      cacheHitRate: 0, // Not tracked in basic implementation
      resourceUtilization: {
        memory: Math.min(0.8, Math.random() * 0.5 + 0.2), // Mock value
        cpu: Math.min(0.8, Math.random() * 0.4 + 0.1), // Mock value
      },
      algorithmPerformance,
    };
  }

  /**
   * Get algorithm performance data
   */
  getAlgorithmPerformance(): Map<string, any> {
    const metrics = this.getAggregatedMetrics();
    return metrics.algorithmPerformance;
  }

  /**
   * Shutdown the performance monitor
   */
  shutdown(): Promise<void> {
    console.log('Performance Monitor shutdown completed');
    return Promise.resolve();
  }
}

/**
 * Create performance monitor instance
 */
export function createPerformanceMonitor(): PerformanceMonitor {
  return new PerformanceMonitor();
}

/**
 * Global performance monitor instance
 */
export const _globalPerformanceMonitor: PerformanceMonitor = new PerformanceMonitor();
