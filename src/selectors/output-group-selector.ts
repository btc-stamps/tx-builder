import type { UTXO } from '../interfaces/provider.interface.ts';
import type {
  SelectionOptions,
  SelectionResult as _SelectionResult,
} from '../interfaces/selector.interface.ts';
import type { EnhancedSelectionResult } from '../interfaces/selector-result.interface.ts';
import { SelectionFailureReason } from '../interfaces/selector-result.interface.ts';

import { BaseSelector } from './base-selector.ts';

/**
 * Output grouping criteria
 */
export interface OutputGroup {
  id: string;
  scriptType: string;
  address?: string;
  origin?: string; // Transaction that created these UTXOs
  utxos: UTXO[];
  totalValue: number;
  effectiveValue: number; // Total value minus estimated fees
}

/**
 * Output Group UTXO Selection Algorithm
 *
 * Privacy-focused selection algorithm that groups UTXOs by common characteristics
 * to prevent address clustering attacks and maintain transaction graph privacy.
 *
 * This is the modern approach used by Bitcoin Core since 2018.
 *
 * Groups UTXOs by:
 * - Address/Script type (P2PKH, P2WPKH, P2SH, P2WSH, P2TR)
 * - Transaction origin (same transaction)
 * - Value ranges (dust, small, medium, large)
 *
 * Selection strategies by privacy level:
 * - High: Only use complete groups (highest privacy)
 * - Medium: Prefer complete groups, mix if necessary
 * - Low: Optimize for fees while respecting grouping
 */
export class OutputGroupSelector extends BaseSelector {
  private privacyLevel: 'high' | 'medium' | 'low';
  private fallbackSelector?: BaseSelector;

  constructor(
    privacyLevel: 'high' | 'medium' | 'low' = 'medium',
    fallbackSelector?: BaseSelector,
  ) {
    super();
    this.privacyLevel = privacyLevel;
    this.fallbackSelector = fallbackSelector;
  }

  getName(): string {
    return 'output-group';
  }

  select(utxos: UTXO[], options: SelectionOptions): EnhancedSelectionResult {
    const targetValue = options.targetValue;
    const feeRate = options.feeRate;
    const dust = options.dustThreshold ?? this.DUST_THRESHOLD;
    const minConf = options.minConfirmations ?? 0;

    if (utxos.length === 0) {
      return this.createFailureResult(
        SelectionFailureReason.NO_UTXOS_AVAILABLE,
        'No UTXOs available for selection',
        { utxoCount: 0 },
      );
    }

    // Filter unusable UTXOs
    const usableUtxos = utxos.filter((utxo) =>
      utxo.value >= dust && (utxo.confirmations ?? 0) >= minConf
    );

    if (usableUtxos.length === 0) {
      return this.createFailureResult(
        SelectionFailureReason.NO_UTXOS_AVAILABLE,
        'No usable UTXOs after filtering',
        { originalCount: utxos.length, dustThreshold: options.dustThreshold },
      );
    }

    // Group UTXOs by characteristics
    const groups = this.createOutputGroups(usableUtxos, feeRate);

    // Sort groups by effective value (descending)
    const sortedGroups = groups.sort((a, b) => b.effectiveValue - a.effectiveValue);

    // Try different selection strategies based on privacy level
    let result: EnhancedSelectionResult;

    switch (this.privacyLevel) {
      case 'high':
        // High privacy: Try to use complete groups only
        result = this.selectCompleteGroups(sortedGroups, targetValue, options);
        break;

      case 'medium':
        // Medium privacy: Prefer complete groups, but allow partial if needed
        result = this.selectCompleteGroups(sortedGroups, targetValue, options);
        if (!result.success) {
          result = this.selectMixedGroups(sortedGroups, targetValue, options);
        }
        break;

      case 'low':
        // Low privacy: Optimize for fees while respecting groups
        result = this.selectOptimalGroups(sortedGroups, targetValue, options);
        break;

      default:
        result = this.createFailureResult(
          SelectionFailureReason.INVALID_OPTIONS,
          `Invalid privacy level: ${this.privacyLevel}`,
          { privacyLevel: this.privacyLevel },
        );
    }

    // Fallback to standard selection if grouping fails
    if (!result.success && this.fallbackSelector) {
      console.log('OutputGroupSelector: Falling back to standard selection');
      result = this.fallbackSelector.select(usableUtxos, options);
    }

    return result;
  }

  /**
   * Create output groups from UTXOs
   */
  private createOutputGroups(utxos: UTXO[], feeRate: number): OutputGroup[] {
    const groupMap = new Map<string, OutputGroup>();

    for (const utxo of utxos) {
      // Determine group key based on characteristics
      const groupKey = this.getGroupKey(utxo);

      if (!groupMap.has(groupKey)) {
        const scriptType = this.getScriptType(utxo);
        groupMap.set(groupKey, {
          id: groupKey,
          scriptType,
          address: utxo.address,
          origin: utxo.txid,
          utxos: [],
          totalValue: 0,
          effectiveValue: 0,
        });
      }

      const group = groupMap.get(groupKey)!;
      group.utxos.push(utxo);
      group.totalValue += utxo.value;

      // Calculate effective value (value minus cost to spend)
      const inputCost = this.estimateInputCost(utxo, feeRate);
      group.effectiveValue += Math.max(0, utxo.value - inputCost);
    }

    return Array.from(groupMap.values()).filter((group) => group.effectiveValue > 0);
  }

  /**
   * Generate group key for UTXO classification
   */
  private getGroupKey(utxo: UTXO): string {
    // Group by script type and origin transaction
    const scriptType = this.getScriptType(utxo);
    const valueCategory = this.getValueCategory(utxo.value);

    // For maximum privacy, group by transaction
    // For efficiency, could also group by address or script type
    return `${scriptType}-${valueCategory}-${utxo.txid}`;
  }

  /**
   * Determine script type from UTXO
   */
  private getScriptType(utxo: UTXO): string {
    // Simplified script type detection
    // In practice, would analyze the actual script
    if (utxo.address?.startsWith('bc1q')) return 'P2WPKH';
    if (utxo.address?.startsWith('bc1p')) return 'P2TR';
    if (utxo.address?.startsWith('3')) return 'P2SH';
    if (utxo.address?.startsWith('1')) return 'P2PKH';
    return 'unknown';
  }

  /**
   * Categorize UTXO value for grouping
   */
  private getValueCategory(value: number): string {
    if (value < 10000) return 'dust';
    if (value < 100000) return 'small';
    if (value < 1000000) return 'medium';
    return 'large';
  }

  /**
   * Estimate cost to spend an input
   */
  private estimateInputCost(utxo: UTXO, feeRate: number): number {
    const scriptType = this.getScriptType(utxo);

    // Estimated input sizes in vbytes
    const inputSizes: Record<string, number> = {
      'P2PKH': 148,
      'P2WPKH': 68,
      'P2SH': 91, // P2WPKH-in-P2SH
      'P2WSH': 104,
      'P2TR': 57,
      'unknown': 100, // Conservative estimate
    };

    const inputSize: number = (inputSizes[scriptType] ?? inputSizes.unknown) as number;
    return inputSize * feeRate;
  }

  /**
   * Select complete groups only (highest privacy)
   */
  private selectCompleteGroups(
    groups: OutputGroup[],
    targetValue: number,
    options: SelectionOptions,
  ): EnhancedSelectionResult {
    const dust = options.dustThreshold ?? this.DUST_THRESHOLD;
    const selectedGroups: OutputGroup[] = [];
    let totalValue = 0;
    let totalInputs = 0;

    for (const group of groups) {
      if (totalValue >= targetValue) break;
      if (totalInputs + group.utxos.length > (options.maxInputs || 100)) break;

      selectedGroups.push(group);
      totalValue += group.totalValue;
      totalInputs += group.utxos.length;
    }

    if (totalValue < targetValue) {
      return this.createFailureResult(
        SelectionFailureReason.INSUFFICIENT_FUNDS,
        'Cannot meet target using complete groups only',
        { totalAvailable: totalValue, targetValue, privacyLevel: 'high' },
      );
    }

    // Calculate fee and change
    const allInputs = selectedGroups.flatMap((g) => g.utxos);
    const estimatedFee = this.estimateFee(allInputs.length, 2, options.feeRate); // 2 outputs (target + change)
    const change = totalValue - targetValue - estimatedFee;

    if (change < 0) {
      return this.createFailureResult(
        SelectionFailureReason.INSUFFICIENT_FUNDS,
        'Insufficient funds after fee calculation',
        { totalValue, targetValue, estimatedFee, shortfall: -change },
      );
    }

    return {
      success: true,
      inputs: allInputs,
      totalValue,
      change: Math.max(0, change),
      fee: estimatedFee,
      wasteMetric: this.computeWasteMetric(change, allInputs.length, options.feeRate),
      inputCount: allInputs.length,
      outputCount: change > dust ? 2 : 1,
      estimatedVSize: this.estimateVSize(allInputs.length, change > dust ? 2 : 1),
      effectiveFeeRate: estimatedFee / this.estimateVSize(allInputs.length, 2),
    };
  }

  /**
   * Select mixed groups (medium privacy)
   */
  private selectMixedGroups(
    groups: OutputGroup[],
    targetValue: number,
    options: SelectionOptions,
  ): EnhancedSelectionResult {
    const dust = options.dustThreshold ?? this.DUST_THRESHOLD;
    // Try combination of whole groups first, then add individual UTXOs if needed
    const selectedGroups: OutputGroup[] = [];
    const selectedUtxos: UTXO[] = [];
    let totalValue = 0;

    // First, add complete groups
    for (const group of groups) {
      if (totalValue >= targetValue) break;
      if (selectedUtxos.length + group.utxos.length > (options.maxInputs || 100)) break;

      selectedGroups.push(group);
      selectedUtxos.push(...group.utxos);
      totalValue += group.totalValue;
    }

    // If still not enough, add individual UTXOs from remaining groups
    if (totalValue < targetValue) {
      const remainingGroups = groups.filter((g) => !selectedGroups.includes(g));
      const remainingUtxos = remainingGroups.flatMap((g) => g.utxos)
        .sort((a, b) => b.value - a.value); // Sort by value descending

      for (const utxo of remainingUtxos) {
        if (totalValue >= targetValue) break;
        if (selectedUtxos.length >= (options.maxInputs || 100)) break;

        selectedUtxos.push(utxo);
        totalValue += utxo.value;
      }
    }

    if (totalValue < targetValue) {
      return this.createFailureResult(
        SelectionFailureReason.INSUFFICIENT_FUNDS,
        'Cannot meet target with mixed group selection',
        { totalAvailable: totalValue, targetValue, privacyLevel: 'medium' },
      );
    }

    // Calculate fee and change
    const estimatedFee = this.estimateFee(selectedUtxos.length, 2, options.feeRate);
    const change = totalValue - targetValue - estimatedFee;

    if (change < 0) {
      return this.createFailureResult(
        SelectionFailureReason.INSUFFICIENT_FUNDS,
        'Insufficient funds after fee calculation',
        { totalValue, targetValue, estimatedFee, shortfall: -change },
      );
    }

    return {
      success: true,
      inputs: selectedUtxos,
      totalValue,
      change: Math.max(0, change),
      fee: estimatedFee,
      wasteMetric: this.computeWasteMetric(change, selectedUtxos.length, options.feeRate),
      inputCount: selectedUtxos.length,
      outputCount: change > dust ? 2 : 1,
      estimatedVSize: this.estimateVSize(selectedUtxos.length, change > dust ? 2 : 1),
      effectiveFeeRate: estimatedFee / this.estimateVSize(selectedUtxos.length, 2),
    };
  }

  /**
   * Select optimal groups (low privacy, optimized for fees)
   */
  private selectOptimalGroups(
    groups: OutputGroup[],
    targetValue: number,
    options: SelectionOptions,
  ): EnhancedSelectionResult {
    const dust = options.dustThreshold ?? this.DUST_THRESHOLD;
    // Sort groups by efficiency (effective value per UTXO)
    const efficientGroups = groups
      .map((group) => ({
        ...group,
        efficiency: group.effectiveValue / group.utxos.length,
      }))
      .sort((a, b) => b.efficiency - a.efficiency);

    const selectedUtxos: UTXO[] = [];
    let totalValue = 0;

    for (const group of efficientGroups) {
      if (totalValue >= targetValue) break;

      // Add UTXOs from this group, but only what we need
      for (const utxo of group.utxos.sort((a, b) => b.value - a.value)) {
        if (totalValue >= targetValue) break;
        if (selectedUtxos.length >= (options.maxInputs || 100)) break;

        selectedUtxos.push(utxo);
        totalValue += utxo.value;
      }
    }

    if (totalValue < targetValue) {
      return this.createFailureResult(
        SelectionFailureReason.INSUFFICIENT_FUNDS,
        'Cannot meet target with optimal group selection',
        { totalAvailable: totalValue, targetValue, privacyLevel: 'low' },
      );
    }

    // Calculate fee and change
    const estimatedFee = this.estimateFee(selectedUtxos.length, 2, options.feeRate);
    const change = totalValue - targetValue - estimatedFee;

    if (change < 0) {
      return this.createFailureResult(
        SelectionFailureReason.INSUFFICIENT_FUNDS,
        'Insufficient funds after fee calculation',
        { totalValue, targetValue, estimatedFee, shortfall: -change },
      );
    }

    return {
      success: true,
      inputs: selectedUtxos,
      totalValue,
      change: Math.max(0, change),
      fee: estimatedFee,
      wasteMetric: this.computeWasteMetric(change, selectedUtxos.length, options.feeRate),
      inputCount: selectedUtxos.length,
      outputCount: change > dust ? 2 : 1,
      estimatedVSize: this.estimateVSize(selectedUtxos.length, change > dust ? 2 : 1),
      effectiveFeeRate: estimatedFee / this.estimateVSize(selectedUtxos.length, 2),
    };
  }

  /**
   * Create a structured failure result
   */
  private createFailureResult(
    reason: SelectionFailureReason,
    message: string,
    details: Record<string, any> = {},
  ): EnhancedSelectionResult {
    return {
      success: false,
      reason,
      message,
      details,
    };
  }

  /**
   * Calculate waste metric
   */
  private computeWasteMetric(change: number, _inputCount: number, feeRate: number): number {
    const changeCost = change > 0 ? 34 * feeRate : 0; // Cost of change output
    const excessCost = change * 0.01; // Small penalty for excess value
    return changeCost + excessCost;
  }

  /**
   * Estimate transaction virtual size
   */
  private estimateVSize(inputCount: number, outputCount: number): number {
    // Simplified estimation assuming P2WPKH inputs and outputs
    const baseSize = 10;
    const inputSize = 68; // P2WPKH input
    const outputSize = 31; // P2WPKH output

    return baseSize + (inputCount * inputSize) + (outputCount * outputSize);
  }
}
