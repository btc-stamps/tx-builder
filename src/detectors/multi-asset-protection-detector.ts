/**
 * Multi-Asset Protection Detector
 *
 * Orchestrates multiple protection detectors for different asset types with
 * intelligent aggregation strategies. This detector combines results from
 * multiple IProtectionDetector implementations to provide comprehensive
 * asset protection detection across ordinals, stamps, SRC-20 tokens, and more.
 */

import type { UTXO } from '../interfaces/index.ts';
import type {
  IProtectionDetector,
  ProtectedAssetData,
  ProtectionDetectorConfig,
} from '../interfaces/protection.interface.ts';

/**
 * Aggregation strategies for multi-detector operation
 */
export type AggregationStrategy = 'any-positive' | 'all-positive' | 'majority';

/**
 * Configuration options for MultiAssetProtectionDetector
 */
export interface MultiAssetProtectionDetectorOptions {
  /** Aggregation strategy to use (default: 'any-positive') */
  strategy?: AggregationStrategy;
  /** Global timeout for all operations in milliseconds (default: 10000) */
  timeout?: number;
  /** Maximum number of detectors to query concurrently (default: 3) */
  maxConcurrency?: number;
  /** Whether to enable detailed logging (default: false) */
  enableLogging?: boolean;
  /** Whether to continue on detector failures (default: true) */
  continueOnFailure?: boolean;
  /** Global detector configuration override */
  detectorConfig?: Partial<ProtectionDetectorConfig>;
}

/**
 * Result from a single detector operation
 */
interface DetectorResult {
  detector: string;
  isProtected: boolean;
  assetData: ProtectedAssetData | null;
  error: Error | null;
  duration: number;
}

/**
 * Multi-Asset Protection Detector implementation
 *
 * Orchestrates multiple protection detectors with intelligent aggregation strategies:
 * - 'any-positive': Return true if ANY detector finds protection
 * - 'all-positive': Return true only if ALL detectors find protection
 * - 'majority': Return true if majority of detectors find protection
 *
 * Features:
 * - Parallel execution for optimal performance
 * - Graceful error handling and recovery
 * - Detailed asset data aggregation
 * - Configurable concurrency limits
 * - Comprehensive logging and debugging
 * - Fail-safe operation (never throws on detector errors)
 */
export class MultiAssetProtectionDetector implements IProtectionDetector {
  private readonly detectors: IProtectionDetector[];
  private readonly strategy: AggregationStrategy;
  private readonly timeout: number;
  private readonly maxConcurrency: number;
  private readonly enableLogging: boolean;
  private readonly continueOnFailure: boolean;
  private readonly detectorConfig: Partial<ProtectionDetectorConfig>;

  constructor(
    detectors: IProtectionDetector[] = [],
    options: MultiAssetProtectionDetectorOptions = {},
  ) {
    this.detectors = [...detectors]; // Create defensive copy
    this.strategy = options.strategy || 'any-positive';
    this.timeout = options.timeout || 10000;
    this.maxConcurrency = Math.max(1, options.maxConcurrency || 3);
    this.enableLogging = options.enableLogging || false;
    this.continueOnFailure = options.continueOnFailure !== false; // Default true
    this.detectorConfig = options.detectorConfig || {};

    if (this.detectors.length === 0) {
      console.warn(
        'MultiAssetProtectionDetector: No detectors configured, will always return false',
      );
    }

    if (this.enableLogging) {
      console.debug(
        `MultiAssetProtectionDetector: Initialized with ${this.detectors.length} detectors using '${this.strategy}' strategy`,
      );
    }
  }

  /**
   * Check if a UTXO contains protected assets using multiple detectors
   */
  async isProtectedUtxo(utxo: UTXO): Promise<boolean> {
    if (this.detectors.length === 0) {
      return false;
    }

    try {
      const startTime = Date.now();
      const results = await this.executeDetectorOperations(utxo, 'isProtectedUtxo');
      const decision = this.aggregateProtectionResults(results);
      const duration = Date.now() - startTime;

      if (this.enableLogging) {
        console.debug(
          `MultiAssetProtectionDetector: Protection check for ${utxo.txid}:${utxo.vout} completed in ${duration}ms`,
          {
            strategy: this.strategy,
            results: results.map((r) => ({
              detector: r.detector,
              isProtected: r.isProtected,
              error: r.error?.message,
            })),
            decision,
          },
        );
      }

      return decision;
    } catch (error) {
      console.warn(
        `MultiAssetProtectionDetector: Protection check failed for ${utxo.txid}:${utxo.vout}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false; // Fail-safe: return false on any unhandled error
    }
  }

  /**
   * Get detailed asset data for a protected UTXO from all detectors
   */
  async getAssetData(utxo: UTXO): Promise<ProtectedAssetData | null> {
    if (this.detectors.length === 0) {
      return null;
    }

    try {
      const startTime = Date.now();
      const results = await this.executeDetectorOperations(utxo, 'getAssetData');
      const aggregatedData = this.aggregateAssetData(results);
      const duration = Date.now() - startTime;

      if (this.enableLogging) {
        console.debug(
          `MultiAssetProtectionDetector: Asset data retrieval for ${utxo.txid}:${utxo.vout} completed in ${duration}ms`,
          {
            detectorCount: this.detectors.length,
            successfulDetectors: results.filter((r) =>
              r.assetData !== null && r.error === null
            ).length,
            aggregatedData: aggregatedData
              ? { type: aggregatedData.type, identifier: aggregatedData.identifier }
              : null,
          },
        );
      }

      return aggregatedData;
    } catch (error) {
      console.warn(
        `MultiAssetProtectionDetector: Asset data retrieval failed for ${utxo.txid}:${utxo.vout}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null; // Fail-safe: return null on any unhandled error
    }
  }

  /**
   * Execute detector operations in parallel with concurrency limits
   */
  private async executeDetectorOperations(
    utxo: UTXO,
    operation: 'isProtectedUtxo' | 'getAssetData',
  ): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    // Create batches to respect maxConcurrency
    const batches: IProtectionDetector[][] = [];
    for (let i = 0; i < this.detectors.length; i += this.maxConcurrency) {
      batches.push(this.detectors.slice(i, i + this.maxConcurrency));
    }

    // Process batches sequentially, but detectors within each batch in parallel
    for (const batch of batches) {
      const batchPromises = batch.map(async (detector, index) => {
        const detectorName = detector.constructor.name || `Detector${results.length + index}`;
        const startTime = Date.now();

        try {
          const timeoutPromise = this.createTimeoutPromise(this.timeout);
          let operationPromise: Promise<boolean | ProtectedAssetData | null>;

          if (operation === 'isProtectedUtxo') {
            operationPromise = detector.isProtectedUtxo(utxo);
          } else {
            operationPromise = detector.getAssetData(utxo);
          }

          const result = await Promise.race([
            operationPromise,
            timeoutPromise,
          ]);

          const duration = Date.now() - startTime;

          // Handle timeout
          if (result === null && operation === 'isProtectedUtxo') {
            throw new Error(`Detector ${detectorName} timed out after ${this.timeout}ms`);
          }

          if (operation === 'isProtectedUtxo') {
            return {
              detector: detectorName,
              isProtected: result as boolean,
              assetData: null,
              error: null,
              duration,
            };
          } else {
            return {
              detector: detectorName,
              isProtected: result !== null,
              assetData: result as ProtectedAssetData | null,
              error: null,
              duration,
            };
          }
        } catch (error) {
          const duration = Date.now() - startTime;
          const detectorError = error instanceof Error ? error : new Error(String(error));

          if (this.enableLogging) {
            console.warn(
              `MultiAssetProtectionDetector: ${detectorName} failed for ${utxo.txid}:${utxo.vout}: ${detectorError.message}`,
            );
          }

          if (!this.continueOnFailure) {
            throw detectorError;
          }

          return {
            detector: detectorName,
            isProtected: false,
            assetData: null,
            error: detectorError,
            duration,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Aggregate protection results based on the configured strategy
   */
  private aggregateProtectionResults(results: DetectorResult[]): boolean {
    const successfulResults = results.filter((r) => r.error === null);

    if (successfulResults.length === 0) {
      if (this.enableLogging) {
        console.warn('MultiAssetProtectionDetector: All detectors failed, returning false');
      }
      return false;
    }

    const protectedCount = successfulResults.filter((r) => r.isProtected).length;
    const totalCount = successfulResults.length;

    switch (this.strategy) {
      case 'any-positive':
        return protectedCount > 0;

      case 'all-positive':
        return protectedCount === totalCount && totalCount > 0;

      case 'majority':
        return protectedCount > Math.floor(totalCount / 2);

      default:
        console.warn(
          `MultiAssetProtectionDetector: Unknown strategy '${this.strategy}', falling back to 'any-positive'`,
        );
        return protectedCount > 0;
    }
  }

  /**
   * Aggregate asset data from multiple detectors
   */
  private aggregateAssetData(results: DetectorResult[]): ProtectedAssetData | null {
    const validResults = results.filter((r) => r.error === null && r.assetData !== null);

    if (validResults.length === 0) {
      return null;
    }

    // Prefer results with higher estimated values, then by asset type priority
    const assetTypePriority = {
      'ordinal': 5,
      'inscription': 4,
      'stamp': 3,
      'src20': 2,
      'counterparty': 1,
      'unknown': 0,
    };

    const sortedResults = validResults
      .sort((a, b) => {
        const aData = a.assetData!;
        const bData = b.assetData!;

        // Sort by value first (descending)
        const valueA = aData.value || 0;
        const valueB = bData.value || 0;
        if (valueA !== valueB) {
          return valueB - valueA;
        }

        // Then by asset type priority (descending)
        const priorityA = assetTypePriority[aData.type] || 0;
        const priorityB = assetTypePriority[bData.type] || 0;
        return priorityB - priorityA;
      });

    const primaryEntry = sortedResults[0];
    if (!primaryEntry || !primaryEntry.assetData) {
      return null;
    }
    const primaryResult = primaryEntry.assetData;

    // Merge properties from all results
    const mergedProperties: Record<string, any> = {};
    const mergedMetadata: any = {};

    for (const result of validResults) {
      const data = result.assetData!;
      if (data.properties) {
        Object.assign(mergedProperties, data.properties);
      }
      if (data.metadata) {
        Object.assign(mergedMetadata, data.metadata);
      }
    }

    return {
      type: primaryResult.type,
      metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : primaryResult.metadata,
      value: primaryResult.value,
      identifier: primaryResult.identifier,
      properties: {
        ...primaryResult.properties,
        ...mergedProperties,
        detectors: validResults.map((r) => r.detector), // Track which detectors found this asset
        detectorCount: validResults.length,
      },
    };
  }

  /**
   * Create a timeout promise that rejects after the specified duration
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
  }

  /**
   * Add a detector to the collection
   */
  addDetector(detector: IProtectionDetector): void {
    this.detectors.push(detector);
    if (this.enableLogging) {
      console.debug(
        `MultiAssetProtectionDetector: Added detector ${detector.constructor.name}, now have ${this.detectors.length} detectors`,
      );
    }
  }

  /**
   * Remove a detector from the collection
   */
  removeDetector(detector: IProtectionDetector): boolean {
    const index = this.detectors.indexOf(detector);
    if (index > -1) {
      this.detectors.splice(index, 1);
      if (this.enableLogging) {
        console.debug(
          `MultiAssetProtectionDetector: Removed detector ${detector.constructor.name}, now have ${this.detectors.length} detectors`,
        );
      }
      return true;
    }
    return false;
  }

  /**
   * Get information about configured detectors
   */
  getDetectorInfo(): Array<{ name: string; configured: boolean }> {
    return this.detectors.map((detector, index) => ({
      name: detector.constructor.name || `Detector${index}`,
      configured: true,
    }));
  }

  /**
   * Get the current aggregation strategy
   */
  getStrategy(): AggregationStrategy {
    return this.strategy;
  }

  /**
   * Get the number of configured detectors
   */
  getDetectorCount(): number {
    return this.detectors.length;
  }

  /**
   * Get configuration summary
   */
  getConfig(): {
    strategy: AggregationStrategy;
    timeout: number;
    maxConcurrency: number;
    detectorCount: number;
    enableLogging: boolean;
  } {
    return {
      strategy: this.strategy,
      timeout: this.timeout,
      maxConcurrency: this.maxConcurrency,
      detectorCount: this.detectors.length,
      enableLogging: this.enableLogging,
    };
  }
}
