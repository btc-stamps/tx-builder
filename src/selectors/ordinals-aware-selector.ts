/**
 * Ordinals Aware Selector
 *
 * UTXO selector that integrates with ordinals detection to avoid spending
 * UTXOs that contain valuable inscriptions or ordinals.
 */

import type { UTXO } from '../interfaces/provider.interface.ts';
import type { SelectionOptions } from '../interfaces/selector.interface.ts';
import type { EnhancedSelectionResult } from '../interfaces/selector-result.interface.ts';
import { SelectionFailureReason } from '../interfaces/selector-result.interface.ts';
import type { OrdinalsDetector } from '../interfaces/ordinals.interface.ts';
import { BaseSelector } from './base-selector.ts';

/**
 * Options for OrdinalsAwareSelector configuration
 */
export interface OrdinalsAwareSelectorOptions {
  /** Whether to cache detection results to improve performance */
  cacheResults?: boolean;
  /** TTL for cache entries in milliseconds (default: 5 minutes) */
  cacheTtl?: number;
  /** Whether to allow protected UTXOs as a last resort */
  allowProtectedIfNecessary?: boolean;
}

/**
 * Cache entry for UTXO protection status
 */
interface CacheEntry {
  isProtected: boolean;
  timestamp: number;
}

/**
 * Ordinals-aware UTXO selector
 *
 * This selector wraps another selector and filters out UTXOs that contain
 * ordinals or inscriptions before performing selection. It provides:
 *
 * - Automatic ordinals detection and filtering
 * - Caching of detection results for performance
 * - Fallback strategies when protected UTXOs are the only option
 * - Clear reporting of when protected UTXOs are used
 */
export class OrdinalsAwareSelector extends BaseSelector {
  private detector: OrdinalsDetector;
  private fallbackSelector: BaseSelector;
  private cacheResults: boolean;
  private cacheTtl: number;
  private allowProtectedIfNecessary: boolean;
  private protectionCache: Map<string, CacheEntry>;

  constructor(
    detector: OrdinalsDetector,
    fallbackSelector: BaseSelector,
    options: OrdinalsAwareSelectorOptions = {},
  ) {
    super();
    this.detector = detector;
    this.fallbackSelector = fallbackSelector;
    this.cacheResults = options.cacheResults ?? true;
    this.cacheTtl = options.cacheTtl ?? 5 * 60 * 1000; // 5 minutes
    this.allowProtectedIfNecessary = options.allowProtectedIfNecessary ?? false;
    this.protectionCache = new Map();
  }

  getName(): string {
    return `ordinals-aware(${this.fallbackSelector.getName()})`;
  }

  /**
   * Select UTXOs while avoiding ordinals/inscriptions
   */
  select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    // Note: For synchronous operation, we assume protection status has been pre-determined
    // or we use cached results. For async protection checking, use populateProtectionCache first.

    const spendableUtxos = utxos.filter((utxo) => !this.isCachedAsProtected(utxo));
    const protectedUtxos = utxos.filter((utxo) => this.isCachedAsProtected(utxo));

    // Try selection with only spendable UTXOs
    let result = this.fallbackSelector.select(spendableUtxos, options);

    // If selection failed and we allow protected UTXOs as last resort
    if (!result.success && this.allowProtectedIfNecessary && protectedUtxos.length > 0) {
      console.warn(
        'OrdinalsAwareSelector: No solution with spendable UTXOs, considering protected UTXOs as last resort',
      );

      // Try with all UTXOs but prefer smaller protected ones (likely dummy UTXOs)
      const sortedProtected = [...protectedUtxos].sort((a, b) => a.value - b.value);
      const combinedUtxos = [...spendableUtxos, ...sortedProtected];

      result = this.fallbackSelector.select(combinedUtxos, options);

      if (result.success) {
        // Mark result as containing protected UTXOs
        (result as any).containsProtectedUtxos = true;
        (result as any).warning = 'This selection contains UTXOs with ordinals/inscriptions';
      }
    }

    // If still no solution, return structured failure
    if (!result.success) {
      return {
        success: false,
        reason: SelectionFailureReason.PROTECTED_UTXOS,
        message: 'Could not find solution without using ordinals/inscriptions UTXOs',
        details: {
          utxoCount: utxos.length,
          spendableCount: spendableUtxos.length,
          protectedCount: protectedUtxos.length,
          availableBalance: spendableUtxos.reduce((sum, utxo) => sum + utxo.value, 0),
          protectedBalance: protectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0),
        },
      };
    }

    return result;
  }

  /**
   * Pre-populate the protection cache for a set of UTXOs
   * This should be called before select() for optimal performance
   */
  async populateProtectionCache(utxos: UTXO[]): Promise<void> {
    const promises = utxos.map(async (utxo) => {
      const utxoId = `${utxo.txid}:${utxo.vout}`;

      // Skip if already cached and not expired
      if (this.isCacheValid(utxoId)) {
        return;
      }

      try {
        const isProtected = await this.detector.isProtectedUtxo(utxo);
        this.protectionCache.set(utxoId, {
          isProtected,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.warn(
          `OrdinalsAwareSelector: Failed to check protection for ${utxoId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        // On error, assume not protected (fail-safe)
        this.protectionCache.set(utxoId, {
          isProtected: false,
          timestamp: Date.now(),
        });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Clear the protection cache
   */
  clearProtectionCache(): void {
    this.protectionCache.clear();
  }

  /**
   * Check if a UTXO is cached as protected
   */
  private isCachedAsProtected(utxo: UTXO): boolean {
    if (!this.cacheResults) {
      return false; // If caching disabled, assume not protected
    }

    const utxoId = `${utxo.txid}:${utxo.vout}`;
    const entry = this.protectionCache.get(utxoId);

    if (!entry) {
      return false; // Not in cache, assume not protected
    }

    // Check if cache entry is expired
    if (Date.now() - entry.timestamp > this.cacheTtl) {
      this.protectionCache.delete(utxoId);
      return false;
    }

    return entry.isProtected;
  }

  /**
   * Check if a cache entry is valid (exists and not expired)
   */
  private isCacheValid(utxoId: string): boolean {
    const entry = this.protectionCache.get(utxoId);
    if (!entry) {
      return false;
    }

    if (Date.now() - entry.timestamp > this.cacheTtl) {
      this.protectionCache.delete(utxoId);
      return false;
    }

    return true;
  }

  /**
   * Get protection summary for debugging
   */
  getProtectionSummary(): {
    cacheSize: number;
    protectedCount: number;
    cacheEnabled: boolean;
    cacheTtl: number;
  } {
    const protectedCount = Array.from(this.protectionCache.values())
      .filter((entry) => entry.isProtected).length;

    return {
      cacheSize: this.protectionCache.size,
      protectedCount,
      cacheEnabled: this.cacheResults,
      cacheTtl: this.cacheTtl,
    };
  }

  /**
   * Get the underlying detector
   */
  getDetector(): OrdinalsDetector {
    return this.detector;
  }

  /**
   * Get the fallback selector
   */
  getFallbackSelector(): BaseSelector {
    return this.fallbackSelector;
  }

  /**
   * Check if protected UTXOs are allowed as last resort
   */
  isProtectedAllowed(): boolean {
    return this.allowProtectedIfNecessary;
  }

  /**
   * Set whether to allow protected UTXOs as last resort
   */
  setAllowProtected(allow: boolean): void {
    this.allowProtectedIfNecessary = allow;
  }
}
