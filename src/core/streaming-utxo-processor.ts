/**
 * Streaming UTXO Processor
 * Handles large UTXO sets efficiently using streaming and chunking
 */

import type { SelectionOptions, SelectionResult, UTXO } from '../interfaces/selector.interface.ts';
import { isSelectionSuccess } from '../interfaces/selector-result.interface.ts';

import { PerformanceMonitor } from './performance-monitor.ts';
import { UTXOCacheManager } from './utxo-cache-manager.ts';

export interface StreamingConfig {
  chunkSize: number; // Number of UTXOs to process at once
  maxMemoryMB: number; // Memory limit for processing
  enableCompression: boolean; // Compress UTXO data
  sortStrategy: 'value' | 'confirmations' | 'age' | 'none';
  filterStrategy: 'aggressive' | 'moderate' | 'conservative';
  enablePrefetch: boolean; // Prefetch next chunks
  concurrentChunks: number; // Number of chunks to process concurrently
}

export interface UTXOChunk {
  id: string;
  utxos: UTXO[];
  totalValue: number;
  averageValue: number;
  count: number;
  memorySize: number;
  processed: boolean;
}

export interface StreamingStats {
  totalUTXOs: number;
  chunksProcessed: number;
  memoryUsage: number;
  filterEfficiency: number; // Percentage of UTXOs filtered out
  processingSpeed: number; // UTXOs per second
  cacheHitRate: number;
}

/**
 * Streaming UTXO processor for handling large datasets
 */
export class StreamingUTXOProcessor {
  private config: Required<StreamingConfig>;
  private _performanceMonitor: PerformanceMonitor;
  private cacheManager: UTXOCacheManager;
  private processedChunks = new Map<string, UTXOChunk>();
  private memoryUsage = 0;
  private stats: StreamingStats = {
    totalUTXOs: 0,
    chunksProcessed: 0,
    memoryUsage: 0,
    filterEfficiency: 0,
    processingSpeed: 0,
    cacheHitRate: 0,
  };

  constructor(
    performanceMonitor: PerformanceMonitor,
    cacheManager: UTXOCacheManager,
    config?: Partial<StreamingConfig>,
  ) {
    this._performanceMonitor = performanceMonitor;
    this.cacheManager = cacheManager;

    // Use performance monitor for future performance tracking
    void this._performanceMonitor;
    this.config = {
      chunkSize: 1000,
      maxMemoryMB: 100,
      enableCompression: true,
      sortStrategy: 'value',
      filterStrategy: 'moderate',
      enablePrefetch: true,
      concurrentChunks: 3,
      ...config,
    };
  }

  /**
   * Process large UTXO set using streaming approach
   */
  async processLargeUTXOSet(
    utxoSource: AsyncIterable<UTXO> | UTXO[],
    options: SelectionOptions,
    onProgress?: (
      progress: { processed: number; total?: number; found?: boolean },
    ) => void,
  ): Promise<SelectionResult | null> {
    const startTime = Date.now();
    this.resetStats();

    try {
      // Convert array to async iterable if needed
      const utxoStream = Array.isArray(utxoSource)
        ? this.arrayToAsyncIterable(utxoSource)
        : utxoSource;

      // Process UTXOs in chunks
      let bestResult: SelectionResult | null = null;
      let totalProcessed = 0;
      let found = false;

      for await (const chunk of this.chunkStream(utxoStream)) {
        const chunkResult = this.processChunk(chunk, options);
        totalProcessed += chunk.count;

        if (chunkResult) {
          // Check if this is better than previous results
          if (
            !bestResult || this.isResultBetter(chunkResult, bestResult, options)
          ) {
            bestResult = chunkResult;
            found = true;
          }
        }

        // Update progress
        onProgress?.({
          processed: totalProcessed,
          total: this.stats.totalUTXOs,
          found,
        });

        // Early exit if we found a good enough result
        if (bestResult && this.isResultGoodEnough(bestResult, options)) {
          break;
        }

        // Memory management
        await this.manageMemory();
      }

      // Update statistics
      const processingTime = Date.now() - startTime;
      this.stats.processingSpeed = totalProcessed / (processingTime / 1000);

      return bestResult;
    } catch (error) {
      console.error('Streaming UTXO processing failed:', error);
      return null;
    }
  }

  /**
   * Stream UTXOs by value range for efficient filtering
   */
  async *streamUTXOsByValueRange(
    utxoSource: AsyncIterable<UTXO> | UTXO[],
    minValue: number,
    maxValue: number,
  ): AsyncGenerator<UTXO> {
    const utxoStream = Array.isArray(utxoSource)
      ? this.arrayToAsyncIterable(utxoSource)
      : utxoSource;

    for await (const utxo of utxoStream) {
      if (utxo.value >= minValue && utxo.value <= maxValue) {
        yield utxo;
      }
    }
  }

  /**
   * Prefetch and cache UTXOs based on selection patterns
   */
  async prefetchOptimalUTXOs(
    address: string,
    options: SelectionOptions,
    provider: any, // IProvider interface
  ): Promise<UTXO[]> {
    try {
      // Check cache first
      const cachedUTXOs = this.cacheManager.getOptimizedUTXOs(address, options);
      if (cachedUTXOs) {
        this.stats.cacheHitRate += 1;
        return cachedUTXOs;
      }

      // Fetch UTXOs from provider
      const allUTXOs = await provider.getUTXOs(address);

      // Apply intelligent filtering
      const optimizedUTXOs = this.prefilterUTXOs(allUTXOs, options);

      // Cache the optimized set
      this.cacheManager.setUTXOs(address, optimizedUTXOs);

      return optimizedUTXOs;
    } catch (error) {
      console.error('UTXO prefetch failed:', error);
      return [];
    }
  }

  /**
   * Create indexed UTXO structure for faster searching
   */
  createUTXOIndex(utxos: UTXO[]): {
    byValue: Map<number, UTXO[]>;
    byConfirmations: Map<number, UTXO[]>;
    sortedByValue: UTXO[];
    valueRanges: Array<{ min: number; max: number; utxos: UTXO[] }>;
  } {
    const byValue = new Map<number, UTXO[]>();
    const byConfirmations = new Map<number, UTXO[]>();

    // Create value buckets (logarithmic)
    for (const utxo of utxos) {
      const valueBucket = Math.floor(Math.log10(utxo.value));
      if (!byValue.has(valueBucket)) {
        byValue.set(valueBucket, []);
      }
      byValue.get(valueBucket)!.push(utxo);

      // Create confirmation buckets
      const confirmationBucket = Math.min(utxo.confirmations ?? 0, 100);
      if (!byConfirmations.has(confirmationBucket)) {
        byConfirmations.set(confirmationBucket, []);
      }
      byConfirmations.get(confirmationBucket)!.push(utxo);
    }

    // Sort by value
    const sortedByValue = [...utxos].sort((a, b) => a.value - b.value);

    // Create value ranges for efficient range queries
    const valueRanges = this.createValueRanges(sortedByValue);

    return {
      byValue,
      byConfirmations,
      sortedByValue,
      valueRanges,
    };
  }

  /**
   * Get statistics about streaming processing
   */
  getStats(): StreamingStats {
    return { ...this.stats };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<StreamingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Clear processed chunks and reset memory
   */
  cleanup(): void {
    this.processedChunks.clear();
    this.memoryUsage = 0;
    this.resetStats();
  }

  /**
   * Convert array to async iterable
   */
  private async *arrayToAsyncIterable(array: UTXO[]): AsyncGenerator<UTXO> {
    this.stats.totalUTXOs = array.length;
    for (const item of array) {
      yield item;
    }
  }

  /**
   * Create chunks from UTXO stream
   */
  private async *chunkStream(
    utxoStream: AsyncIterable<UTXO>,
  ): AsyncGenerator<UTXOChunk> {
    let chunk: UTXO[] = [];
    let chunkId = 0;

    for await (const utxo of utxoStream) {
      chunk.push(utxo);

      if (chunk.length >= this.config.chunkSize) {
        yield this.createChunk(`chunk-${chunkId++}`, chunk);
        chunk = [];
      }
    }

    // Yield remaining UTXOs
    if (chunk.length > 0) {
      yield this.createChunk(`chunk-${chunkId}`, chunk);
    }
  }

  /**
   * Create chunk object
   */
  private createChunk(id: string, utxos: UTXO[]): UTXOChunk {
    const totalValue = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    const averageValue = totalValue / utxos.length;
    const memorySize = this.estimateMemorySize(utxos);

    // Apply sorting if configured
    const sortedUTXOs = this.sortUTXOs(utxos);

    const chunk: UTXOChunk = {
      id,
      utxos: sortedUTXOs,
      totalValue,
      averageValue,
      count: utxos.length,
      memorySize,
      processed: false,
    };

    this.processedChunks.set(id, chunk);
    this.memoryUsage += memorySize;

    return chunk;
  }

  /**
   * Process individual chunk
   */
  private processChunk(
    chunk: UTXOChunk,
    options: SelectionOptions,
  ): SelectionResult | null {
    // Pre-filter chunk UTXOs
    const filteredUTXOs = this.prefilterUTXOs(chunk.utxos, options);

    if (filteredUTXOs.length === 0) {
      chunk.processed = true;
      return null;
    }

    // Try selection with filtered UTXOs
    // For now, we'll use a simple accumulative approach
    // In a real implementation, this would delegate to the selector factory
    const result = this.attemptSelection(filteredUTXOs, options);

    chunk.processed = true;
    this.stats.chunksProcessed++;

    // Update filter efficiency
    const filtered = chunk.count - filteredUTXOs.length;
    this.stats.filterEfficiency = (this.stats.filterEfficiency + filtered / chunk.count) / 2;

    return result;
  }

  /**
   * Simple accumulative selection for chunk processing
   */
  private attemptSelection(
    utxos: UTXO[],
    options: SelectionOptions,
  ): SelectionResult | null {
    const selected: UTXO[] = [];
    let accumulated = 0;
    const targetWithFee = options.targetValue +
      this.estimateFee(3, 2, options.feeRate);

    for (const utxo of utxos) {
      selected.push(utxo);
      accumulated += utxo.value;

      if (accumulated >= targetWithFee) {
        const fee = this.estimateFee(selected.length, 2, options.feeRate);
        const change = accumulated - options.targetValue - fee;

        if (accumulated >= options.targetValue + fee) {
          const estimatedVSize = this.estimateTransactionSize(selected.length, 2);
          return {
            success: true,
            inputs: selected,
            fee,
            change: Math.max(0, change),
            totalValue: accumulated,
            inputCount: selected.length,
            outputCount: 2, // Target + change
            estimatedVSize,
            effectiveFeeRate: fee / estimatedVSize,
          };
        }
      }
    }

    return null;
  }

  /**
   * Estimate transaction fee
   */
  private estimateFee(
    inputCount: number,
    outputCount: number,
    feeRate: number,
  ): number {
    // Simplified fee calculation
    const vSize = this.estimateTransactionSize(inputCount, outputCount);
    return vSize * feeRate;
  }

  /**
   * Estimate transaction size in vBytes
   */
  private estimateTransactionSize(
    inputCount: number,
    outputCount: number,
  ): number {
    const inputSize = inputCount * 148; // Average input size
    const outputSize = outputCount * 34; // Average output size
    const overhead = 10; // Transaction overhead

    return inputSize + outputSize + overhead;
  }

  /**
   * Pre-filter UTXOs based on selection options
   */
  private prefilterUTXOs(utxos: UTXO[], options: SelectionOptions): UTXO[] {
    let filtered = [...utxos];

    // Filter by minimum confirmations
    if (options.minConfirmations) {
      filtered = filtered.filter((utxo) => (utxo.confirmations ?? 0) >= options.minConfirmations!);
    }

    // Filter out dust UTXOs
    const dustThreshold = options.dustThreshold || 546;
    filtered = filtered.filter((utxo) => utxo.value > dustThreshold);

    // Apply filtering strategy
    switch (this.config.filterStrategy) {
      case 'aggressive': {
        // Remove very small UTXOs relative to target
        const minRelevantValue = options.targetValue * 0.001;
        filtered = filtered.filter((utxo) => utxo.value >= minRelevantValue);
        break;
      }

      case 'moderate': {
        // Remove UTXOs that are clearly too small
        const moderateMinValue = Math.max(
          dustThreshold * 2,
          options.targetValue * 0.0001,
        );
        filtered = filtered.filter((utxo) => utxo.value >= moderateMinValue);
        break;
      }

      case 'conservative':
        // Only remove obvious dust
        break;
    }

    return filtered;
  }

  /**
   * Sort UTXOs based on configured strategy
   */
  private sortUTXOs(utxos: UTXO[]): UTXO[] {
    switch (this.config.sortStrategy) {
      case 'value': {
        return [...utxos].sort((a, b) => b.value - a.value);
      }
      case 'confirmations': {
        return [...utxos].sort((a, b) => (b.confirmations ?? 0) - (a.confirmations ?? 0));
      }
      case 'age': {
        // Sort by confirmations as proxy for age
        return [...utxos].sort((a, b) => (b.confirmations ?? 0) - (a.confirmations ?? 0));
      }
      case 'none':
      default: {
        return utxos;
      }
    }
  }

  /**
   * Check if result is better than current best
   */
  private isResultBetter(
    newResult: SelectionResult,
    currentBest: SelectionResult,
    options: SelectionOptions,
  ): boolean {
    // Only compare successful results
    if (!isSelectionSuccess(newResult) || !isSelectionSuccess(currentBest)) {
      return false;
    }

    // Prefer results with fewer inputs
    if (newResult.inputs.length < currentBest.inputs.length) {
      return true;
    }

    // Prefer lower fees
    if (
      newResult.fee < currentBest.fee &&
      newResult.inputs.length <= currentBest.inputs.length
    ) {
      return true;
    }

    // Prefer changeless transactions
    const dustThreshold = options.dustThreshold || 546;
    const newChangeless = newResult.change < dustThreshold;
    const currentChangeless = currentBest.change < dustThreshold;

    if (newChangeless && !currentChangeless) {
      return true;
    }

    return false;
  }

  /**
   * Check if result is good enough to stop searching
   */
  private isResultGoodEnough(
    result: SelectionResult,
    options: SelectionOptions,
  ): boolean {
    if (!isSelectionSuccess(result)) {
      return false;
    }

    const dustThreshold = options.dustThreshold || 546;
    const isChangeless = result.change < dustThreshold;
    const hasMinimalInputs = result.inputs.length <= 3;

    return isChangeless && hasMinimalInputs;
  }

  /**
   * Estimate memory size of UTXO array
   */
  private estimateMemorySize(utxos: UTXO[]): number {
    // Rough estimate: each UTXO is about 200 bytes
    return utxos.length * 200;
  }

  /**
   * Manage memory usage by cleaning up old chunks
   */
  private manageMemory(): void {
    const maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;

    if (this.memoryUsage > maxMemoryBytes) {
      const chunksToRemove = Array.from(this.processedChunks.entries())
        .filter(([_, chunk]) => chunk.processed)
        .sort(([a], [b]) => a.localeCompare(b)) // Remove oldest chunks first
        .slice(0, Math.floor(this.processedChunks.size * 0.3)); // Remove 30%

      for (const [id, chunk] of chunksToRemove) {
        this.processedChunks.delete(id);
        this.memoryUsage -= chunk.memorySize;
      }
    }
  }

  /**
   * Create value ranges for efficient range queries
   */
  private createValueRanges(
    sortedUTXOs: UTXO[],
  ): Array<{ min: number; max: number; utxos: UTXO[] }> {
    const ranges = [];
    const rangeSize = Math.ceil(sortedUTXOs.length / 10); // 10 ranges

    for (let i = 0; i < sortedUTXOs.length; i += rangeSize) {
      const rangeUTXOs = sortedUTXOs.slice(i, i + rangeSize);
      if (rangeUTXOs.length > 0) {
        ranges.push({
          min: rangeUTXOs[0]!.value,
          max: rangeUTXOs[rangeUTXOs.length - 1]!.value,
          utxos: rangeUTXOs,
        });
      }
    }

    return ranges;
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      totalUTXOs: 0,
      chunksProcessed: 0,
      memoryUsage: 0,
      filterEfficiency: 0,
      processingSpeed: 0,
      cacheHitRate: 0,
    };
  }
}

/**
 * Create streaming UTXO processor
 */
export function createStreamingUTXOProcessor(
  performanceMonitor: PerformanceMonitor,
  cacheManager: UTXOCacheManager,
  config?: Partial<StreamingConfig>,
): StreamingUTXOProcessor {
  return new StreamingUTXOProcessor(performanceMonitor, cacheManager, config);
}

/**
 * Create memory-optimized streaming processor
 */
export function createMemoryOptimizedStreamingProcessor(
  performanceMonitor: PerformanceMonitor,
  cacheManager: UTXOCacheManager,
): StreamingUTXOProcessor {
  return new StreamingUTXOProcessor(performanceMonitor, cacheManager, {
    chunkSize: 500,
    maxMemoryMB: 50,
    enableCompression: true,
    sortStrategy: 'value',
    filterStrategy: 'aggressive',
    enablePrefetch: false,
    concurrentChunks: 2,
  });
}

/**
 * Create high-performance streaming processor
 */
export function createHighPerformanceStreamingProcessor(
  performanceMonitor: PerformanceMonitor,
  cacheManager: UTXOCacheManager,
): StreamingUTXOProcessor {
  return new StreamingUTXOProcessor(performanceMonitor, cacheManager, {
    chunkSize: 2000,
    maxMemoryMB: 200,
    enableCompression: false,
    sortStrategy: 'value',
    filterStrategy: 'moderate',
    enablePrefetch: true,
    concurrentChunks: 4,
  });
}
