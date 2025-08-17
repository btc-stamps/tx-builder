import type { UTXO } from '../interfaces/provider.interface.ts';
import {
  type EnhancedSelectionResult,
  SelectionFailureReason,
} from '../interfaces/selector-result.interface.ts';
import type { SelectionOptions } from '../interfaces/selector.interface.ts';

import { BaseSelector } from './base-selector.ts';

/**
 * Tax optimization strategies
 */
export type TaxStrategy = 'FIFO' | 'LIFO' | 'HIFO' | 'LOFO' | 'SPECIFIC_ID';

/**
 * UTXO metadata for tax calculations
 */
export interface UTXOTaxMetadata {
  txid: string;
  vout: number;
  acquisitionDate: Date;
  costBasis: number; // in fiat currency
  acquisitionPrice?: number; // BTC price at acquisition
  description?: string; // Source of funds
  taxLot?: string; // Tax lot identifier
}

/**
 * Tax calculation result
 */
export interface TaxCalculation {
  totalCostBasis: number;
  totalProceeds: number;
  realizedGainLoss: number;
  shortTermGainLoss: number;
  longTermGainLoss: number;
  selectedLots: UTXOTaxMetadata[];
}

/**
 * Tax-Optimized UTXO Selection Algorithm
 *
 * Selects UTXOs based on tax optimization strategies commonly used
 * for capital gains calculations in various jurisdictions.
 *
 * Strategies:
 * - FIFO (First In, First Out): Spend oldest UTXOs first
 * - LIFO (Last In, First Out): Spend newest UTXOs first
 * - HIFO (Highest In, First Out): Spend highest cost basis first (minimize gains)
 * - LOFO (Lowest In, First Out): Spend lowest cost basis first (maximize gains)
 * - SPECIFIC_ID: Manual selection of specific tax lots
 *
 * Important for:
 * - Institutional compliance
 * - Tax reporting
 * - Capital gains optimization
 * - Regulatory requirements
 */
export class TaxOptimizedSelector extends BaseSelector {
  private strategy: TaxStrategy;
  private taxMetadata: Map<string, UTXOTaxMetadata>;
  private currentBTCPrice: number;
  private longTermThresholdDays: number;
  private fallbackSelector?: BaseSelector;
  protected override readonly DUST_THRESHOLD = 546;

  constructor(options?: {
    strategy?: TaxStrategy;
    taxMetadata?: UTXOTaxMetadata[];
    currentBTCPrice?: number;
    longTermThresholdDays?: number; // Default 365 days for US
    fallbackSelector?: BaseSelector;
  }) {
    super();
    this.strategy = options?.strategy || 'FIFO';
    this.currentBTCPrice = options?.currentBTCPrice || 50000; // Default BTC price
    this.longTermThresholdDays = options?.longTermThresholdDays || 365;

    this.fallbackSelector = options?.fallbackSelector;

    // Create metadata map for quick lookup
    this.taxMetadata = new Map();
    if (options?.taxMetadata) {
      for (const metadata of options.taxMetadata) {
        const key = `${metadata.txid}:${metadata.vout}`;
        this.taxMetadata.set(key, metadata);
      }
    }
  }

  select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    const { targetValue, feeRate } = options;
    console.debug(`Tax-optimized selection with fee rate: ${feeRate} sat/vB`); // Use feeRate

    // Filter UTXOs that have tax metadata
    const utxosWithMetadata = utxos.filter((utxo) => {
      const key = `${utxo.txid}:${utxo.vout}`;
      return this.taxMetadata.has(key);
    });

    if (utxosWithMetadata.length === 0) {
      // Fallback if no tax metadata available
      if (this.fallbackSelector) {
        console.warn(
          'TaxOptimizedSelector: No tax metadata found, using fallback selector',
        );
        return this.fallbackSelector.select(utxos, options);
      }

      // Fallback: Use confirmation count as proxy for age (FIFO strategy)
      console.warn(
        'TaxOptimizedSelector: No tax metadata found, using confirmation-based FIFO',
      );
      return this.selectByConfirmations(utxos, options);
    }

    // Sort UTXOs according to tax strategy
    const sortedUtxos = this.sortByTaxStrategy(utxosWithMetadata);

    // Select UTXOs using the sorted order
    const selected: UTXO[] = [];
    let totalValue = 0;
    const selectedMetadata: UTXOTaxMetadata[] = [];

    for (const utxo of sortedUtxos) {
      selected.push(utxo);
      totalValue += utxo.value;

      const key = `${utxo.txid}:${utxo.vout}`;
      const metadata = this.taxMetadata.get(key)!;
      selectedMetadata.push(metadata);

      // Check if we have enough
      const fee = this.calculateFee(selected, options);
      if (totalValue >= targetValue + fee) {
        // Calculate tax implications
        const taxCalc = this.calculateTaxImplications(
          selectedMetadata,
          totalValue,
          this.currentBTCPrice,
        );

        // Create result with tax information
        const result = this.createResult(
          selected,
          targetValue,
          feeRate,
          totalValue > targetValue + fee, // Has change
        );

        // Attach tax calculation to result
        if (result) {
          (result as any).taxCalculation = taxCalc;
        }

        return result;
      }
    }

    // Not enough funds with tax-optimized UTXOs
    // Try with all UTXOs if fallback is available
    if (this.fallbackSelector && totalValue < targetValue) {
      console.warn(
        'TaxOptimizedSelector: Insufficient funds with tax-optimized selection, using fallback',
      );
      return this.fallbackSelector.select(utxos, options);
    }

    return {
      success: false,
      reason: SelectionFailureReason.INSUFFICIENT_FUNDS,
      message: 'Insufficient funds with tax-optimized selection',
      details: {
        availableBalance: totalValue,
        requiredAmount: targetValue,
      },
    };
  }

  /**
   * Sort UTXOs according to tax strategy
   */
  private sortByTaxStrategy(utxos: UTXO[]): UTXO[] {
    const utxosWithMeta = utxos.map((utxo) => {
      const key = `${utxo.txid}:${utxo.vout}`;
      const metadata = this.taxMetadata.get(key)!;
      return { utxo, metadata };
    });

    switch (this.strategy) {
      case 'FIFO':
        // First In, First Out - oldest first
        utxosWithMeta.sort(
          (a, b) =>
            a.metadata.acquisitionDate.getTime() -
            b.metadata.acquisitionDate.getTime(),
        );
        break;

      case 'LIFO':
        // Last In, First Out - newest first
        utxosWithMeta.sort(
          (a, b) =>
            b.metadata.acquisitionDate.getTime() -
            a.metadata.acquisitionDate.getTime(),
        );
        break;

      case 'HIFO':
        // Highest In, First Out - highest cost basis first (minimize gains)
        utxosWithMeta.sort((a, b) => b.metadata.costBasis - a.metadata.costBasis);
        break;

      case 'LOFO':
        // Lowest In, First Out - lowest cost basis first (maximize gains/losses)
        utxosWithMeta.sort((a, b) => a.metadata.costBasis - b.metadata.costBasis);
        break;

      case 'SPECIFIC_ID':
        // Manual selection - maintain original order or use tax lot IDs
        // In practice, this would use specific tax lot selection
        break;

      default:
        // Default to FIFO
        utxosWithMeta.sort(
          (a, b) =>
            a.metadata.acquisitionDate.getTime() -
            b.metadata.acquisitionDate.getTime(),
        );
    }

    return utxosWithMeta.map((item) => item.utxo);
  }

  /**
   * Calculate tax implications of the selection
   */
  private calculateTaxImplications(
    selectedMetadata: UTXOTaxMetadata[],
    totalSatoshis: number,
    currentBTCPrice: number,
  ): TaxCalculation {
    const totalBTC = totalSatoshis / 100_000_000;
    const totalProceeds = totalBTC * currentBTCPrice;

    let totalCostBasis = 0;
    let shortTermGainLoss = 0;
    let longTermGainLoss = 0;

    const now = new Date();
    const longTermThresholdMs = this.longTermThresholdDays * 24 * 60 * 60 *
      1000;

    for (const metadata of selectedMetadata) {
      totalCostBasis += metadata.costBasis;

      // Determine if long-term or short-term
      const holdingPeriodMs = now.getTime() -
        metadata.acquisitionDate.getTime();
      const isLongTerm = holdingPeriodMs >= longTermThresholdMs;

      // Calculate gain/loss for this lot
      const lotBTC = metadata.costBasis /
        (metadata.acquisitionPrice || currentBTCPrice);
      const lotProceeds = lotBTC * currentBTCPrice;
      const lotGainLoss = lotProceeds - metadata.costBasis;

      if (isLongTerm) {
        longTermGainLoss += lotGainLoss;
      } else {
        shortTermGainLoss += lotGainLoss;
      }
    }

    const realizedGainLoss = totalProceeds - totalCostBasis;

    return {
      totalCostBasis,
      totalProceeds,
      realizedGainLoss,
      shortTermGainLoss,
      longTermGainLoss,
      selectedLots: selectedMetadata,
    };
  }

  /**
   * Calculate fee for selection
   */
  private calculateFee(utxos: UTXO[], options: SelectionOptions): number {
    const inputs = utxos.length;
    const outputs = 2; // Target + change
    const estimatedSize = inputs * 148 + outputs * 34 + 10;
    return Math.ceil(estimatedSize * options.feeRate);
  }

  /**
   * Get tax optimization report
   */
  getTaxReport(utxos: UTXO[]): TaxCalculation | null {
    const metadata: UTXOTaxMetadata[] = [];
    let totalSatoshis = 0;

    for (const utxo of utxos) {
      const key = `${utxo.txid}:${utxo.vout}`;
      const meta = this.taxMetadata.get(key);
      if (meta) {
        metadata.push(meta);
        totalSatoshis += utxo.value;
      }
    }

    if (metadata.length === 0) {
      return null;
    }

    return this.calculateTaxImplications(
      metadata,
      totalSatoshis,
      this.currentBTCPrice,
    );
  }

  /**
   * Fallback selection using confirmations as proxy for age
   */
  private selectByConfirmations(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    // Filter eligible UTXOs
    const eligibleUTXOs = this.filterEligibleUTXOs(utxos, options);
    if (eligibleUTXOs.length === 0) {
      return {
        success: false,
        reason: SelectionFailureReason.NO_UTXOS_AVAILABLE,
        message: 'No eligible UTXOs available',
        details: { utxoCount: utxos.length },
      };
    }

    // Sort by confirmations (oldest first for FIFO)
    const sortedUtxos = [...eligibleUTXOs].sort((a, b) =>
      (b.confirmations ?? 0) - (a.confirmations ?? 0)
    );

    // Simple accumulation
    const selected: UTXO[] = [];
    let totalValue = 0;

    for (const utxo of sortedUtxos) {
      // Check max inputs constraint
      if (options.maxInputs && selected.length >= options.maxInputs) {
        break;
      }

      selected.push(utxo);
      totalValue += utxo.value;

      const fee = this.calculateFee(selected, options);
      if (totalValue >= options.targetValue + fee) {
        const change = totalValue - options.targetValue - fee;
        const hasChange = change >= (options.dustThreshold ?? this.DUST_THRESHOLD);

        return this.createResult(
          selected,
          options.targetValue,
          options.feeRate,
          hasChange,
        );
      }
    }

    return {
      success: false,
      reason: SelectionFailureReason.INSUFFICIENT_FUNDS,
      message: 'Insufficient funds to meet target value',
      details: {
        availableBalance: totalValue,
        requiredAmount: options.targetValue,
        utxoCount: selected.length,
      },
    };
  }

  getName(): string {
    return `tax-optimized-${this.strategy.toLowerCase()}`;
  }
}

/**
 * Factory function for creating tax-optimized selectors
 */
export function createTaxOptimizedSelector(
  strategy: TaxStrategy,
  taxData: UTXOTaxMetadata[],
  btcPrice: number,
  options?: {
    longTermDays?: number;
    fallbackSelector?: BaseSelector;
  },
): TaxOptimizedSelector {
  return new TaxOptimizedSelector({
    strategy,
    taxMetadata: taxData,
    currentBTCPrice: btcPrice,
    longTermThresholdDays: options?.longTermDays,
    fallbackSelector: options?.fallbackSelector,
  });
}

/**
 * Helper to create tax metadata from transaction history
 */
export function createTaxMetadata(
  txid: string,
  vout: number,
  acquisitionDate: Date | string,
  costBasis: number,
  btcPrice?: number,
): UTXOTaxMetadata {
  return {
    txid,
    vout,
    acquisitionDate: typeof acquisitionDate === 'string'
      ? new Date(acquisitionDate)
      : acquisitionDate,
    costBasis,
    acquisitionPrice: btcPrice,
  };
}
