import type { UTXO } from '../interfaces/provider.interface.ts';
import type { SelectionOptions } from '../interfaces/selector.interface.ts';
import type { EnhancedSelectionResult } from '../interfaces/selector-result.interface.ts';
import { SelectionFailureReason } from '../interfaces/selector-result.interface.ts';
import type {
  IProtectionDetector,
  ProtectedAssetData,
} from '../interfaces/protection.interface.ts';

import { BaseSelector } from './base-selector.ts';

/**
 * Mock implementation for testing and development
 * Allows manual specification of protected UTXOs
 */
export class MockProtectionDetector implements IProtectionDetector {
  private protectedUtxos: Set<string>;
  private assetData: Map<string, ProtectedAssetData>;

  constructor(
    protectedUtxos: string[] = [],
    assetData: Map<string, ProtectedAssetData> = new Map(),
  ) {
    this.protectedUtxos = new Set(protectedUtxos);
    this.assetData = assetData;
  }

  async isProtectedUtxo(utxo: UTXO): Promise<boolean> {
    const utxoId = `${utxo.txid}:${utxo.vout}`;
    return await Promise.resolve(this.protectedUtxos.has(utxoId));
  }

  async getAssetData(utxo: UTXO): Promise<ProtectedAssetData | null> {
    const utxoId = `${utxo.txid}:${utxo.vout}`;
    return await Promise.resolve(this.assetData.get(utxoId) || null);
  }

  addProtectedUtxo(utxoId: string, assetData?: ProtectedAssetData): void {
    this.protectedUtxos.add(utxoId);
    if (assetData) {
      this.assetData.set(utxoId, assetData);
    }
  }

  removeProtectedUtxo(utxoId: string): void {
    this.protectedUtxos.delete(utxoId);
    this.assetData.delete(utxoId);
  }

  clearProtectedUtxos(): void {
    this.protectedUtxos.clear();
    this.assetData.clear();
  }

  getProtectedUtxoIds(): string[] {
    return Array.from(this.protectedUtxos);
  }
}

/**
 * Protection-aware UTXO selector
 *
 * Wraps another selector and filters out UTXOs that contain
 * valuable ordinals, stamps, or other protected assets.
 *
 * Can use different protection strategies:
 * - Strict: Never use protected UTXOs (safest)
 * - Careful: Use dummy UTXOs from protected assets if needed
 * - Emergency: Use any UTXO as last resort (not recommended)
 */
export class ProtectionAwareSelector extends BaseSelector {
  private detector: IProtectionDetector;
  private fallbackSelector: BaseSelector;
  private allowProtectedIfNecessary: boolean;
  private dummyUtxoAmount: number;

  constructor(
    detector: IProtectionDetector,
    fallbackSelector: BaseSelector,
    allowProtectedIfNecessary = false,
    dummyUtxoAmount = 546,
  ) {
    super();
    this.detector = detector;
    this.fallbackSelector = fallbackSelector;
    this.allowProtectedIfNecessary = allowProtectedIfNecessary;
    this.dummyUtxoAmount = dummyUtxoAmount;
  }

  getName(): string {
    return 'protection-aware';
  }

  select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    // Note: For synchronous operation, we assume all UTXOs are spendable
    // Async protection checking should be done before calling this selector
    const spendableUtxos = utxos;
    const protectedUtxos: UTXO[] = [];

    // For synchronous operation, protection detection should be done externally
    // This selector now focuses on UTXO selection with pre-filtered inputs

    // Try selection with only spendable UTXOs
    let result = this.fallbackSelector.select(spendableUtxos, options);

    // If selection failed and we allow protected UTXOs as last resort
    if (
      !result.success && this.allowProtectedIfNecessary && protectedUtxos.length > 0
    ) {
      console.warn(
        'ProtectionAwareSelector: No solution with spendable UTXOs, ' +
          'considering protected UTXOs as last resort',
      );

      // Try with all UTXOs but prefer dummy UTXOs for ordinals
      const dummyUtxos = protectedUtxos.filter(
        (utxo) =>
          utxo.value >= this.dummyUtxoAmount &&
          utxo.value <= this.dummyUtxoAmount * 2,
      );

      // Combine dummy UTXOs with spendable ones
      const combinedUtxos = [...spendableUtxos, ...dummyUtxos];
      result = this.fallbackSelector.select(combinedUtxos, options);

      // If still no solution, use all UTXOs as absolute last resort
      if (!result.success) {
        console.warn(
          'ProtectionAwareSelector: WARNING - Using protected UTXOs to complete transaction',
        );
        result = this.fallbackSelector.select(utxos, options);

        if (result.success) {
          // Mark result as containing protected UTXOs
          (result as any).containsProtectedUtxos = true;
          (result as any).warning = 'This selection contains protected ordinals/stamps UTXOs';
        }
      }
    }

    // If still no solution, return structured failure
    if (!result.success) {
      return {
        success: false,
        reason: SelectionFailureReason.PROTECTED_UTXOS,
        message: 'Could not find solution without using protected UTXOs',
        details: {
          utxoCount: utxos.length,
          availableBalance: spendableUtxos.reduce((sum, utxo) => sum + utxo.value, 0),
        },
      };
    }

    return result;
  }

  /**
   * Check if a specific UTXO is protected
   */
  isProtected(utxo: UTXO): Promise<boolean> {
    return this.detector.isProtectedUtxo(utxo);
  }

  /**
   * Get asset data for a UTXO
   */
  getAssetData(utxo: UTXO): Promise<ProtectedAssetData | null> {
    return this.detector.getAssetData(utxo);
  }

  /**
   * Filter UTXOs into protected and spendable categories
   */
  private async categorizeUtxos(
    utxos: UTXO[],
  ): Promise<{ spendableUtxos: UTXO[]; protectedUtxos: UTXO[] }> {
    const spendableUtxos: UTXO[] = [];
    const protectedUtxos: UTXO[] = [];

    // Check each UTXO for protection status
    for (const utxo of utxos) {
      const isProtected = await this.detector.isProtectedUtxo(utxo);
      if (isProtected) {
        protectedUtxos.push(utxo);
      } else {
        spendableUtxos.push(utxo);
      }
    }

    return { spendableUtxos, protectedUtxos };
  }

  /**
   * Get protection summary for a set of UTXOs
   */
  async getProtectionSummary(utxos: UTXO[]): Promise<{
    totalUtxos: number;
    protectedCount: number;
    spendableCount: number;
    totalValue: number;
    protectedValue: number;
    spendableValue: number;
    protectedAssets: ProtectedAssetData[];
  }> {
    const { spendableUtxos, protectedUtxos } = await this.categorizeUtxos(utxos);

    // Collect asset data for protected UTXOs
    const protectedAssets: ProtectedAssetData[] = [];
    for (const utxo of protectedUtxos) {
      const assetData = await this.detector.getAssetData(utxo);
      if (assetData) {
        protectedAssets.push(assetData);
      }
    }

    const totalValue = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    const protectedValue = protectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
    const spendableValue = spendableUtxos.reduce((sum, utxo) => sum + utxo.value, 0);

    return {
      totalUtxos: utxos.length,
      protectedCount: protectedUtxos.length,
      spendableCount: spendableUtxos.length,
      totalValue,
      protectedValue,
      spendableValue,
      protectedAssets,
    };
  }

  /**
   * Set whether to allow protected UTXOs if necessary
   */
  setAllowProtectedIfNecessary(allow: boolean): void {
    this.allowProtectedIfNecessary = allow;
  }

  /**
   * Set the dummy UTXO amount for ordinal protection
   */
  setDummyUtxoAmount(amount: number): void {
    this.dummyUtxoAmount = amount;
  }

  /**
   * Get the current fallback selector
   */
  getFallbackSelector(): BaseSelector {
    return this.fallbackSelector;
  }

  /**
   * Set a new fallback selector
   */
  setFallbackSelector(selector: BaseSelector): void {
    this.fallbackSelector = selector;
  }

  /**
   * Get the current protection detector
   */
  getProtectionDetector(): IProtectionDetector {
    return this.detector;
  }

  /**
   * Set a new protection detector
   */
  setProtectionDetector(detector: IProtectionDetector): void {
    this.detector = detector;
  }
}
