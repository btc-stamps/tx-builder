/**
 * SRC-20 Specific Fee Calculator
 * Implements stamp-specific fee rules and minimum value requirements
 * Uses normalized satsPerVB for consistency with BTCStampsExplorer
 */

import { Buffer } from 'node:buffer';

import { FeeEstimator } from '../core/fee-estimator.ts';
import type { FeeEstimate, InputType, OutputType } from '../interfaces/fee.interface.ts';
import type { SRC20BuilderOptions } from '../interfaces/src20.interface.ts';
import { createSRC20Options } from '../interfaces/src20.interface.ts';
import {
  createNormalizedFeeRate,
  FeeNormalizer,
  type FeePriority,
  type NormalizedFeeRate,
} from './fee-normalizer.ts';

export interface Src20FeeRules {
  preferredFeeRateSatsPerVB: number; // Higher fee rate for stamp transactions (normalized to satsPerVB)
  priorityMultiplier: number; // Multiplier for urgent stamp transactions
  maxDataOutputs: number; // Maximum data outputs per transaction
}

export interface Src20TransactionParams {
  stampValue: number;
  dataOutputCount: number;
  changeOutputType?: OutputType;
  hasStampInput?: boolean;
  isStampCreation?: boolean;
  isStampTransfer?: boolean;
}

/**
 * Calculator for SRC-20 stamp transaction fees with specific business rules
 */
export class Src20FeeCalculator extends FeeEstimator {
  private rules: Src20FeeRules;

  constructor(rules?: Partial<Src20FeeRules>, src20Options?: SRC20BuilderOptions) {
    super({
      enableSrc20Rules: true,
      minFeeRate: 5, // Higher minimum for stamps
    });

    const _options = createSRC20Options(src20Options);

    this.rules = {
      preferredFeeRateSatsPerVB: 15, // Higher than normal transactions (normalized to satsPerVB)
      priorityMultiplier: 2.0, // 2x multiplier for urgent
      maxDataOutputs: src20Options?.maxDataOutputs ?? 100, // Allow more for testing, default to 100
      ...rules,
    };
  }

  /**
   * Calculate fee for SRC-20 stamp transaction using normalized satsPerVB
   */
  async calculateStampTransactionFee(
    params: Src20TransactionParams,
    inputs: Array<{ type: InputType; witnessScript?: Buffer }>,
    outputs: Array<{ type: OutputType; size?: number }>,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium',
  ): Promise<
    FeeEstimate & {
      src20Rules: {
        appliedMultiplier: number;
        dataOutputCount: number;
        recommendedFeeRateSatsPerVB: number;
      };
      normalizedFee: NormalizedFeeRate;
      sizeBreakdown: {
        inputSize: number;
        outputSize: number;
        witnessSize: number;
        virtualSize: number;
      };
    }
  > {
    // Validate stamp parameters
    this.validateStampParams(params);

    // Calculate base transaction size using normalized calculator
    const sizeCalculation = this.calculateTransactionSize(inputs, outputs);

    // Get normalized fee rate for priority level
    const standardFeeRate = FeeNormalizer.getStandardFeeLevel(
      priority as FeePriority,
    );

    // Apply SRC-20 specific fee rate adjustments (normalized)
    const adjustedFeeRateSatsPerVB = this.calculateAdjustedFeeRateNormalized(
      params,
      priority,
    );

    // Use higher of standard rate or SRC-20 adjusted rate
    const finalFeeRateSatsPerVB = Math.max(
      adjustedFeeRateSatsPerVB,
      standardFeeRate.satsPerVB,
    );

    // Create normalized fee rate
    const normalizedFeeRate = createNormalizedFeeRate(
      finalFeeRateSatsPerVB,
      'sat/vB',
      'explorer',
    );

    // Calculate total fee using normalized method
    const totalFee = FeeNormalizer.calculateFee(
      sizeCalculation.virtualSize,
      finalFeeRateSatsPerVB,
    );

    // Get base fee estimate for backward compatibility
    const baseEstimate = await this.estimateFee(
      sizeCalculation.virtualSize,
      priority,
    );

    // Calculate total effective multiplier applied
    const multiplier = this.calculateTotalMultiplier(params, priority);

    return {
      ...baseEstimate,
      feeRate: finalFeeRateSatsPerVB, // Now consistently in satsPerVB
      totalFee,
      src20Rules: {
        appliedMultiplier: multiplier,
        dataOutputCount: params.dataOutputCount,
        recommendedFeeRateSatsPerVB: finalFeeRateSatsPerVB,
      },
      normalizedFee: normalizedFeeRate,
      sizeBreakdown: {
        inputSize: sizeCalculation.inputSize,
        outputSize: sizeCalculation.outputSize,
        witnessSize: sizeCalculation.witnessSize,
        virtualSize: sizeCalculation.virtualSize,
      },
    };
  }

  /**
   * Validate SRC-20 stamp transaction parameters
   */
  private validateStampParams(params: Src20TransactionParams): void {
    // Check for conflicting transaction types
    if (params.isStampCreation && params.isStampTransfer) {
      throw new Error(
        'Cannot have both isStampCreation and isStampTransfer set to true - conflicting transaction type flags',
      );
    }

    // Check data output count
    if (params.dataOutputCount > this.rules.maxDataOutputs) {
      throw new Error(
        `Data output count ${params.dataOutputCount} exceeds maximum ${this.rules.maxDataOutputs}`,
      );
    }

    // Validate stamp value is reasonable (not too large)
    if (params.stampValue > 1_000_000) {
      // 1M sats = ~$3-400 depending on price
      console.warn(`Large stamp value detected: ${params.stampValue} satoshis`);
    }
  }

  /**
   * Calculate adjusted fee rate for SRC-20 transactions using normalized satsPerVB
   */
  private calculateAdjustedFeeRateNormalized(
    params: Src20TransactionParams,
    priority: 'low' | 'medium' | 'high' | 'urgent',
  ): number {
    let baseFeeRateSatsPerVB = this.rules.preferredFeeRateSatsPerVB;

    // Adjust for transaction type
    if (params.isStampCreation) {
      baseFeeRateSatsPerVB *= 1.2; // 20% higher for creation
    } else if (params.isStampTransfer) {
      baseFeeRateSatsPerVB *= 1.1; // 10% higher for transfers
    }

    // Adjust for data outputs (more data = higher fee)
    const dataOutputMultiplier = 1 + params.dataOutputCount * 0.1; // 10% per data output
    baseFeeRateSatsPerVB *= dataOutputMultiplier;

    // Apply priority multiplier
    const priorityMultiplier = this.getStampPriorityMultiplier(
      params,
      priority,
    );
    baseFeeRateSatsPerVB *= priorityMultiplier;

    return Math.ceil(baseFeeRateSatsPerVB);
  }

  /**
   * Calculate adjusted fee rate for SRC-20 transactions (legacy method for backward compatibility)
   * @deprecated Use calculateAdjustedFeeRateNormalized instead
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private __calculateAdjustedFeeRate(
    params: Src20TransactionParams,
    priority: 'low' | 'medium' | 'high' | 'urgent',
  ): number {
    return this.calculateAdjustedFeeRateNormalized(params, priority);
  }

  /**
   * Get priority multiplier for stamp transactions
   */
  private getStampPriorityMultiplier(
    params: Src20TransactionParams,
    priority: 'low' | 'medium' | 'high' | 'urgent',
  ): number {
    const baseMultipliers = {
      low: 0.8,
      medium: 1.0,
      high: 1.5,
      urgent: this.rules.priorityMultiplier,
    };

    let multiplier = baseMultipliers[priority];

    // Additional multiplier for high-value stamps
    if (params.stampValue >= 1_000_000) {
      multiplier *= 1.2;
    }

    return multiplier;
  }

  /**
   * Calculate total effective multiplier for fee calculation
   */
  private calculateTotalMultiplier(
    params: Src20TransactionParams,
    priority: 'low' | 'medium' | 'high' | 'urgent',
  ): number {
    let totalMultiplier = 1.0;

    // Transaction type multiplier
    if (params.isStampCreation) {
      totalMultiplier *= 1.2; // 20% higher for creation
    } else if (params.isStampTransfer) {
      totalMultiplier *= 1.1; // 10% higher for transfers
    }

    // Data output multiplier
    const dataOutputMultiplier = 1 + params.dataOutputCount * 0.1; // 10% per data output
    totalMultiplier *= dataOutputMultiplier;

    // Priority multiplier
    const priorityMultiplier = this.getStampPriorityMultiplier(params, priority);
    totalMultiplier *= priorityMultiplier;

    return totalMultiplier;
  }

  /**
   * Check if transaction qualifies for SRC-20 rules
   */
  isStampTransaction(params: Src20TransactionParams): boolean {
    return (
      params.hasStampInput ||
      params.isStampCreation ||
      params.isStampTransfer ||
      params.dataOutputCount > 0
    );
  }

  /**
   * Calculate optimal change output value for stamp transactions
   */
  calculateOptimalChange(
    inputValue: number,
    outputValue: number,
    estimatedFee: number,
    _changeType: OutputType = 'P2WPKH',
  ): {
    changeValue: number;
    shouldCreateChange: boolean;
    dustThreshold: number;
  } {
    const rawChange = inputValue - outputValue - estimatedFee;

    // Get dust threshold for change output
    const dustThreshold = this.getDustThresholds().P2WPKH;

    // For stamp transactions, be more conservative about change
    const conservativeThreshold = Math.max(dustThreshold, 1000); // At least 1000 sats

    const shouldCreateChange = rawChange >= conservativeThreshold;
    const changeValue = shouldCreateChange ? rawChange : 0;

    return {
      changeValue,
      shouldCreateChange,
      dustThreshold: conservativeThreshold,
    };
  }

  /**
   * Get recommended fee rates for different stamp transaction types (normalized to satsPerVB)
   */
  getRecommendedFeeRates(): {
    stampCreation: {
      low: number;
      medium: number;
      high: number;
      urgent: number;
    };
    stampTransfer: {
      low: number;
      medium: number;
      high: number;
      urgent: number;
    };
    regularWithStamp: {
      low: number;
      medium: number;
      high: number;
      urgent: number;
    };
  } {
    const baseSatsPerVB = this.rules.preferredFeeRateSatsPerVB;

    return {
      stampCreation: {
        low: Math.ceil(baseSatsPerVB * 0.8 * 1.2), // 20% higher for creation, 80% for low priority
        medium: Math.ceil(baseSatsPerVB * 1.2),
        high: Math.ceil(baseSatsPerVB * 1.5 * 1.2),
        urgent: Math.ceil(baseSatsPerVB * this.rules.priorityMultiplier * 1.2),
      },
      stampTransfer: {
        low: Math.ceil(baseSatsPerVB * 0.8 * 1.1), // 10% higher for transfer
        medium: Math.ceil(baseSatsPerVB * 1.1),
        high: Math.ceil(baseSatsPerVB * 1.5 * 1.1),
        urgent: Math.ceil(baseSatsPerVB * this.rules.priorityMultiplier * 1.1),
      },
      regularWithStamp: {
        low: Math.ceil(baseSatsPerVB * 0.8),
        medium: baseSatsPerVB,
        high: Math.ceil(baseSatsPerVB * 1.5),
        urgent: Math.ceil(baseSatsPerVB * this.rules.priorityMultiplier),
      },
    };
  }

  /**
   * Get normalized recommended fee rates for different stamp transaction types
   */
  getNormalizedRecommendedFeeRates(): {
    stampCreation: {
      low: NormalizedFeeRate;
      medium: NormalizedFeeRate;
      high: NormalizedFeeRate;
      urgent: NormalizedFeeRate;
    };
    stampTransfer: {
      low: NormalizedFeeRate;
      medium: NormalizedFeeRate;
      high: NormalizedFeeRate;
      urgent: NormalizedFeeRate;
    };
    regularWithStamp: {
      low: NormalizedFeeRate;
      medium: NormalizedFeeRate;
      high: NormalizedFeeRate;
      urgent: NormalizedFeeRate;
    };
  } {
    const rates = this.getRecommendedFeeRates();

    const createNormalized = (rate: number): NormalizedFeeRate =>
      createNormalizedFeeRate(rate, 'sat/vB', 'explorer');

    return {
      stampCreation: {
        low: createNormalized(rates.stampCreation.low),
        medium: createNormalized(rates.stampCreation.medium),
        high: createNormalized(rates.stampCreation.high),
        urgent: createNormalized(rates.stampCreation.urgent),
      },
      stampTransfer: {
        low: createNormalized(rates.stampTransfer.low),
        medium: createNormalized(rates.stampTransfer.medium),
        high: createNormalized(rates.stampTransfer.high),
        urgent: createNormalized(rates.stampTransfer.urgent),
      },
      regularWithStamp: {
        low: createNormalized(rates.regularWithStamp.low),
        medium: createNormalized(rates.regularWithStamp.medium),
        high: createNormalized(rates.regularWithStamp.high),
        urgent: createNormalized(rates.regularWithStamp.urgent),
      },
    };
  }

  /**
   * Estimate total transaction cost including stamp value
   */
  async estimateStampTransactionCost(
    params: Src20TransactionParams,
    inputs: Array<{ type: InputType; witnessScript?: Buffer }>,
    outputs: Array<{ type: OutputType; size?: number }>,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium',
  ): Promise<{
    stampValue: number;
    networkFee: number;
    totalCost: number;
    breakdown: {
      baseTransactionFee: number;
      stampPremium: number;
      dataPremium: number;
      priorityMultiplier: number;
    };
  }> {
    const feeEstimate = await this.calculateStampTransactionFee(
      params,
      inputs,
      outputs,
      priority,
    );
    const sizeCalculation = this.calculateTransactionSize(inputs, outputs);

    const baseFee = Math.ceil(
      sizeCalculation.virtualSize * this.rules.preferredFeeRateSatsPerVB,
    );
    const stampPremium = params.isStampCreation ? baseFee * 0.2 : baseFee * 0.1; // 20% for creation, 10% for transfer
    const dataPremium = params.dataOutputCount * sizeCalculation.virtualSize *
      0.1; // Data output premium
    const _priorityFee = feeEstimate.totalFee - baseFee - stampPremium -
      dataPremium;

    return {
      stampValue: params.stampValue,
      networkFee: feeEstimate.totalFee,
      totalCost: params.stampValue + feeEstimate.totalFee,
      breakdown: {
        baseTransactionFee: baseFee,
        stampPremium: Math.max(stampPremium, 1), // Ensure at least 1 sat
        dataPremium: Math.max(dataPremium, params.dataOutputCount), // At least 1 sat per data output
        priorityMultiplier: feeEstimate.src20Rules.appliedMultiplier,
      },
    };
  }

  /**
   * Get current SRC-20 fee rules
   */
  getStampRules(): Src20FeeRules {
    return { ...this.rules };
  }

  /**
   * Update SRC-20 fee rules
   */
  updateStampRules(newRules: Partial<Src20FeeRules>): void {
    this.rules = { ...this.rules, ...newRules };
  }
}

/**
 * Helper function to create SRC-20 fee calculator with standard settings
 */
export function createSrc20FeeCalculator(
  customRules?: Partial<Src20FeeRules>,
  src20Options?: SRC20BuilderOptions,
): Src20FeeCalculator {
  return new Src20FeeCalculator(customRules, src20Options);
}
