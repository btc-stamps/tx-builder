/**
 * Ordinals Multi-Provider Detector
 *
 * Orchestrates multiple ordinals detector providers with intelligent fallback strategies.
 * This detector ONLY handles ordinals and inscriptions via multiple APIs (Hiro, Ord, etc.)
 * and has nothing to do with Counterparty assets.
 */

import type { UTXO } from '../interfaces/index.ts';
import type {
  IProtectionDetector,
  ProtectedAssetData,
} from '../interfaces/protection.interface.ts';
import type { InscriptionData, OrdinalsDetector } from '../interfaces/ordinals.interface.ts';
import {
  HiroOrdinalsDetector,
  type HiroOrdinalsDetectorOptions,
} from './hiro-ordinals-detector.ts';
import { OrdServerDetector, type OrdServerDetectorOptions } from './ord-server-detector.ts';

/**
 * Detection strategies for multi-provider operation
 */
export type DetectionStrategy = 'first-success' | 'any-positive' | 'consensus';

/**
 * Configuration options for OrdinalsMultiProviderDetector
 */
export interface OrdinalsMultiProviderDetectorOptions {
  /** Detection strategy to use (default: 'first-success') */
  strategy?: DetectionStrategy;
  /** Global timeout for all operations in milliseconds (default: 10000) */
  timeout?: number;
  /** Maximum number of providers to query concurrently (default: 2) */
  maxConcurrency?: number;
  /** Provider-specific options */
  providerOptions?: {
    hiro?: HiroOrdinalsDetectorOptions;
    ordServer?: OrdServerDetectorOptions;
  };
}

/**
 * Ordinals Multi-Provider Detector implementation
 *
 * Orchestrates multiple detector providers with intelligent fallback strategies:
 * - 'first-success': Query providers in order until one returns true
 * - 'any-positive': Query all providers in parallel, return true if ANY returns true
 * - 'consensus': Query multiple providers, return true only if majority returns true
 *
 * Features:
 * - Fail-safe operation (never throws, returns false on errors)
 * - Configurable detection strategies
 * - Provider-specific timeout and retry logic
 * - Graceful degradation when providers fail
 * - Comprehensive error logging
 */
export class OrdinalsMultiProviderDetector implements IProtectionDetector, OrdinalsDetector {
  private readonly providers: OrdinalsDetector[];
  private readonly strategy: DetectionStrategy;
  private readonly timeout: number;
  private readonly maxConcurrency: number;

  constructor(
    providers?: OrdinalsDetector[],
    options: OrdinalsMultiProviderDetectorOptions = {},
  ) {
    // Initialize providers with defaults if none provided
    this.providers = providers || [
      new HiroOrdinalsDetector({
        timeout: 3000, // Shorter timeout for multi-provider context
        ...options.providerOptions?.hiro,
      }),
      new OrdServerDetector({
        timeout: 3000,
        ...options.providerOptions?.ordServer,
      }),
    ];

    this.strategy = options.strategy || 'first-success';
    this.timeout = options.timeout || 10000;
    this.maxConcurrency = options.maxConcurrency || 2;

    if (this.providers.length === 0) {
      console.warn(
        'OrdinalsMultiProviderDetector: No providers configured, will always return false',
      );
    }
  }

  /**
   * Check if a UTXO contains protected inscriptions/ordinals using multiple providers
   */
  async isProtectedUtxo(utxo: UTXO): Promise<boolean> {
    if (this.providers.length === 0) {
      return false;
    }

    try {
      const startTime = Date.now();
      let result: boolean;

      switch (this.strategy) {
        case 'first-success':
          result = await this.firstSuccessStrategy(utxo);
          break;
        case 'any-positive':
          result = await this.anyPositiveStrategy(utxo);
          break;
        case 'consensus':
          result = await this.consensusStrategy(utxo);
          break;
        default:
          // Fallback to first-success for unknown strategies
          console.warn(
            `OrdinalsMultiProviderDetector: Unknown strategy '${this.strategy}', using 'first-success'`,
          );
          result = await this.firstSuccessStrategy(utxo);
      }

      const duration = Date.now() - startTime;
      console.debug(
        `OrdinalsMultiProviderDetector: ${this.strategy} strategy completed in ${duration}ms for ${utxo.txid}:${utxo.vout} -> ${result}`,
      );

      return result;
    } catch (error) {
      console.warn(
        `OrdinalsMultiProviderDetector: Strategy execution failed for ${utxo.txid}:${utxo.vout}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false; // Fail-safe: return false on any error
    }
  }

  /**
   * Get inscription data from the first provider that has data for this UTXO
   */
  async getInscriptionData(utxo: UTXO): Promise<InscriptionData | null> {
    if (this.providers.length === 0) {
      return null;
    }

    try {
      // Try providers in order until we get data
      for (const provider of this.providers) {
        try {
          const inscriptionData = await Promise.race([
            provider.getInscriptionData(utxo),
            this.createTimeoutPromise<InscriptionData | null>(null),
          ]);

          if (inscriptionData) {
            console.debug(
              `OrdinalsMultiProviderDetector: Got inscription data from provider for ${utxo.txid}:${utxo.vout}`,
            );
            return inscriptionData;
          }
        } catch (error) {
          console.warn(
            `OrdinalsMultiProviderDetector: Provider failed to get inscription data for ${utxo.txid}:${utxo.vout}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          // Continue to next provider
        }
      }

      return null; // No provider had inscription data
    } catch (error) {
      console.warn(
        `OrdinalsMultiProviderDetector: Failed to get inscription data for ${utxo.txid}:${utxo.vout}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null; // Fail-safe: return null on any error
    }
  }

  /**
   * Get asset data from the first provider that has data for this UTXO
   * Only returns 'ordinal' or 'inscription' types - never 'stamp' or 'src20'
   */
  async getAssetData(utxo: UTXO): Promise<ProtectedAssetData | null> {
    if (this.providers.length === 0) {
      return null;
    }

    try {
      // Try providers in order until we get data
      for (const provider of this.providers) {
        try {
          const assetData = await Promise.race([
            provider.getAssetData(utxo),
            this.createTimeoutPromise<ProtectedAssetData | null>(null),
          ]);

          if (assetData) {
            // Ensure only ordinal/inscription types are returned
            if (assetData.type === 'ordinal' || assetData.type === 'inscription') {
              console.debug(
                `OrdinalsMultiProviderDetector: Got ${assetData.type} data from provider for ${utxo.txid}:${utxo.vout}`,
              );
              return assetData;
            }
            // Skip non-ordinal assets (stamps, src20, etc.)
            console.debug(
              `OrdinalsMultiProviderDetector: Skipping non-ordinal asset type '${assetData.type}' for ${utxo.txid}:${utxo.vout}`,
            );
          }
        } catch (error) {
          console.warn(
            `OrdinalsMultiProviderDetector: Provider failed to get asset data for ${utxo.txid}:${utxo.vout}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          // Continue to next provider
        }
      }

      return null; // No provider had ordinal/inscription data
    } catch (error) {
      console.warn(
        `OrdinalsMultiProviderDetector: Failed to get asset data for ${utxo.txid}:${utxo.vout}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null; // Fail-safe: return null on any error
    }
  }

  /**
   * First-success strategy: Query providers in order until one returns true
   */
  private async firstSuccessStrategy(utxo: UTXO): Promise<boolean> {
    for (const provider of this.providers) {
      try {
        const result = await Promise.race([
          provider.isProtectedUtxo(utxo),
          this.createTimeoutPromise<boolean>(false),
        ]);

        if (result === true) {
          console.debug(
            `OrdinalsMultiProviderDetector: Provider found protection for ${utxo.txid}:${utxo.vout}`,
          );
          return true;
        }
      } catch (error) {
        console.warn(
          `OrdinalsMultiProviderDetector: Provider failed for ${utxo.txid}:${utxo.vout}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        // Continue to next provider
      }
    }

    return false; // All providers failed or returned false
  }

  /**
   * Any-positive strategy: Query all providers in parallel, return true if ANY returns true
   */
  private async anyPositiveStrategy(utxo: UTXO): Promise<boolean> {
    // Create batches to respect maxConcurrency
    const batches: OrdinalsDetector[][] = [];
    for (let i = 0; i < this.providers.length; i += this.maxConcurrency) {
      batches.push(this.providers.slice(i, i + this.maxConcurrency));
    }

    // Process batches sequentially, but providers within each batch in parallel
    for (const batch of batches) {
      try {
        const promises = batch.map(async (provider) => {
          try {
            return await Promise.race([
              provider.isProtectedUtxo(utxo),
              this.createTimeoutPromise<boolean>(false),
            ]);
          } catch (error) {
            console.warn(
              `OrdinalsMultiProviderDetector: Provider failed in any-positive strategy for ${utxo.txid}:${utxo.vout}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return false; // Provider failed, consider as false
          }
        });

        const results = await Promise.all(promises);

        // If any provider returned true, return true immediately
        if (results.some((result) => result === true)) {
          console.debug(
            `OrdinalsMultiProviderDetector: At least one provider found protection for ${utxo.txid}:${utxo.vout}`,
          );
          return true;
        }
      } catch (error) {
        console.warn(
          `OrdinalsMultiProviderDetector: Batch failed in any-positive strategy for ${utxo.txid}:${utxo.vout}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        // Continue to next batch
      }
    }

    return false; // No provider returned true
  }

  /**
   * Consensus strategy: Query multiple providers, return true only if majority returns true
   */
  private async consensusStrategy(utxo: UTXO): Promise<boolean> {
    const results: boolean[] = [];

    // Create batches to respect maxConcurrency
    const batches: OrdinalsDetector[][] = [];
    for (let i = 0; i < this.providers.length; i += this.maxConcurrency) {
      batches.push(this.providers.slice(i, i + this.maxConcurrency));
    }

    // Process batches sequentially, but providers within each batch in parallel
    for (const batch of batches) {
      try {
        const promises = batch.map(async (provider) => {
          try {
            return await Promise.race([
              provider.isProtectedUtxo(utxo),
              this.createTimeoutPromise<boolean>(false),
            ]);
          } catch (error) {
            console.warn(
              `OrdinalsMultiProviderDetector: Provider failed in consensus strategy for ${utxo.txid}:${utxo.vout}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return false; // Provider failed, consider as false
          }
        });

        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
      } catch (error) {
        console.warn(
          `OrdinalsMultiProviderDetector: Batch failed in consensus strategy for ${utxo.txid}:${utxo.vout}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        // Continue to next batch, but mark these providers as failed
        results.push(...batch.map(() => false));
      }
    }

    // Calculate consensus
    const trueCount = results.filter((result) => result === true).length;
    const totalCount = results.length;
    const majorityThreshold = Math.ceil(totalCount / 2);

    const hasConsensus = trueCount >= majorityThreshold;

    console.debug(
      `OrdinalsMultiProviderDetector: Consensus for ${utxo.txid}:${utxo.vout}: ${trueCount}/${totalCount} providers say protected -> ${hasConsensus}`,
    );

    return hasConsensus;
  }

  /**
   * Create a timeout promise that resolves with the given value after the global timeout
   */
  private createTimeoutPromise<T>(timeoutValue: T): Promise<T> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(timeoutValue), this.timeout);
    });
  }

  /**
   * Get information about the configured providers
   */
  getProviderInfo(): Array<{ name: string; configured: boolean }> {
    return this.providers.map((provider, index) => ({
      name: provider.constructor.name || `Provider${index}`,
      configured: true,
    }));
  }

  /**
   * Get the current detection strategy
   */
  getStrategy(): DetectionStrategy {
    return this.strategy;
  }

  /**
   * Get the number of configured providers
   */
  getProviderCount(): number {
    return this.providers.length;
  }
}
