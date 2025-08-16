/**
 * Fee Normalizer - Standardizes all fee handling to use satsPerVB
 * Ensures consistency with BTCStampsExplorer production API
 */

import { Buffer } from 'node:buffer';
import * as bitcoin from 'bitcoinjs-lib';
import type { InputType, OutputType } from '../interfaces/fee.interface.ts';

export type FeeUnit = 'sat/byte' | 'sat/vB' | 'btc/kb';
export type FeeSource = 'electrum' | 'explorer' | 'mempool';
export type FeePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface NormalizedFeeRate {
  satsPerVB: number;
  unit: FeeUnit; // Always 'sat/vB' for normalized rates
  confidence: number; // 0-1
  source: FeeSource;
  timestamp: number;
}

export interface VirtualSizeCalculation {
  inputSizes: number[];
  outputSizes: number[];
  witnessSizes: number[];
  baseSize: number;
  totalWeight: number;
  virtualSize: number;
}

export interface StandardFeeLevels {
  low: NormalizedFeeRate;
  medium: NormalizedFeeRate;
  high: NormalizedFeeRate;
  urgent: NormalizedFeeRate;
}

/**
 * FeeNormalizer - Centralized fee handling with satsPerVB as primary unit
 * Matches BTCStampsExplorer production behavior
 */
export class FeeNormalizer {
  // Standard conversion factors
  private static readonly SATOSHIS_PER_BTC = 100_000_000;
  private static readonly BYTES_PER_KILOBYTE = 1000;

  // Accurate transaction size constants matching Bitcoin Core
  private static readonly OUTPUT_SIZES: Record<OutputType, number> = {
    P2PKH: 34, // 8 + 1 + 25
    P2WPKH: 31, // 8 + 1 + 22
    P2SH: 32, // 8 + 1 + 23
    P2WSH: 43, // 8 + 1 + 34
    P2TR: 43, // 8 + 1 + 34
    OP_RETURN: 0, // Variable, calculated separately
  };

  private static readonly INPUT_BASE_SIZES: Record<InputType, number> = {
    P2PKH: 148, // 36 + 1 + 107 + 4
    P2WPKH: 41, // 36 + 1 + 0 + 4 (witness data separate)
    P2SH: 91, // Variable, minimum size
    P2WSH: 41, // 36 + 1 + 0 + 4 (witness data separate)
    P2TR: 57, // 36 + 1 + 16 + 4
  };

  private static readonly WITNESS_SIZES: Record<string, number> = {
    P2WPKH: 27, // 1 + 1 + 33 + 1 + 64
    P2WSH: 0, // Variable, depends on script
    P2TR: 16, // 1 + 1 + 64
    default: 0, // Fallback for unknown types
  };

  // BTCStampsExplorer standard fee levels (satsPerVB)
  private static readonly BTCSTAMPS_EXPLORER_STANDARDS: StandardFeeLevels = {
    low: {
      satsPerVB: 8,
      unit: 'sat/vB' as FeeUnit,
      confidence: 0.7,
      source: 'explorer',
      timestamp: Date.now(),
    },
    medium: {
      satsPerVB: 15,
      unit: 'sat/vB' as FeeUnit,
      confidence: 0.85,
      source: 'explorer',
      timestamp: Date.now(),
    },
    high: {
      satsPerVB: 25,
      unit: 'sat/vB' as FeeUnit,
      confidence: 0.95,
      source: 'explorer',
      timestamp: Date.now(),
    },
    urgent: {
      satsPerVB: 40,
      unit: 'sat/vB' as FeeUnit,
      confidence: 0.99,
      source: 'explorer',
      timestamp: Date.now(),
    },
  };

  /**
   * Convert any fee unit to satsPerVB (primary normalized unit)
   */
  static toSatsPerVB(value: number, unit: FeeUnit): number {
    switch (unit) {
      case 'sat/vB':
        return Math.ceil(value);

      case 'sat/byte':
        // sat/byte is typically legacy fee calculation
        // For SegWit transactions, this approximates to satsPerVB
        return Math.ceil(value);

      case 'btc/kb': {
        // Convert BTC/kB to sats/vB
        const satsPerKB = value * this.SATOSHIS_PER_BTC;
        const satsPerVB = satsPerKB / this.BYTES_PER_KILOBYTE;
        return Math.round(satsPerVB); // Use round instead of ceil for accurate conversion
      }

      default:
        throw new Error(`Unsupported fee unit: ${unit}`);
    }
  }

  /**
   * Convert satsPerVB to other fee units for backward compatibility
   */
  static fromSatsPerVB(satsPerVB: number, unit: FeeUnit): number {
    switch (unit) {
      case 'sat/vB':
        return satsPerVB;

      case 'sat/byte':
        // For backward compatibility, return same value
        return satsPerVB;

      case 'btc/kb': {
        const satsPerKB = satsPerVB * this.BYTES_PER_KILOBYTE;
        const btcPerKB = satsPerKB / this.SATOSHIS_PER_BTC;
        return btcPerKB;
      }

      default:
        throw new Error(`Unsupported fee unit: ${unit}`);
    }
  }

  /**
   * Calculate accurate virtual size for any transaction type
   * Matches Bitcoin Core's calculation exactly
   */
  static calculateVirtualSize(tx: bitcoin.Transaction): number {
    let weight = 0;

    // Base transaction size (version + input count + inputs + output count + outputs + locktime)
    weight += 4 * 4; // version (4) + locktime (4)
    weight += 4 * this.getVarIntSize(tx.ins.length); // input count
    weight += 4 * this.getVarIntSize(tx.outs.length); // output count

    let hasWitness = false;

    // Add input weights
    for (const input of tx.ins) {
      weight += 4 * 36; // outpoint (32 + 4)
      weight += 4 * this.getVarIntSize(input.script.length);
      weight += 4 * input.script.length;
      weight += 4 * 4; // sequence

      // Check if input has witness data
      if (input.witness && input.witness.length > 0) {
        hasWitness = true;
        weight += this.getVarIntSize(input.witness.length);
        for (const witnessItem of input.witness) {
          weight += this.getVarIntSize(witnessItem.length);
          weight += witnessItem.length;
        }
      }
    }

    // Add output weights
    for (const output of tx.outs) {
      weight += 4 * 8; // value
      weight += 4 * this.getVarIntSize(output.script.length);
      weight += 4 * output.script.length;
    }

    // Add witness overhead if present
    if (hasWitness) {
      weight += 4 * 0.5; // marker + flag (0.5 weight units each)
    }

    // Virtual size = weight / 4 (rounded up)
    return Math.ceil(weight / 4);
  }

  /**
   * Calculate virtual size from transaction parameters (without full transaction)
   */
  static calculateVirtualSizeFromParams(
    inputs: Array<{ type: InputType; witnessScript?: Buffer }>,
    outputs: Array<{ type: OutputType; size?: number }>,
  ): VirtualSizeCalculation {
    let baseSize = 4 + 4; // version + locktime
    baseSize += this.getVarIntSize(inputs.length);
    baseSize += this.getVarIntSize(outputs.length);

    const inputSizes: number[] = [];
    const outputSizes: number[] = [];
    const witnessSizes: number[] = [];

    let totalWitnessSize = 0;
    let hasWitness = false;

    // Calculate input sizes
    for (const input of inputs) {
      const inputSize = this.INPUT_BASE_SIZES[input.type];
      inputSizes.push(inputSize);
      baseSize += inputSize;

      // Calculate witness size
      let witnessSize = 0;
      if (input.type === 'P2WPKH') {
        witnessSize = this.WITNESS_SIZES.P2WPKH ?? 27;
        hasWitness = true;
      } else if (input.type === 'P2WSH' && input.witnessScript) {
        witnessSize = 1 + input.witnessScript.length + 64; // items + script + signature
        hasWitness = true;
      } else if (input.type === 'P2TR') {
        witnessSize = this.WITNESS_SIZES.P2TR ?? 16;
        hasWitness = true;
      } else {
        witnessSize = this.WITNESS_SIZES.default ?? 0;
      }

      witnessSizes.push(witnessSize);
      totalWitnessSize += witnessSize;
    }

    // Calculate output sizes
    for (const output of outputs) {
      let outputSize: number;
      if (output.type === 'OP_RETURN' && output.size !== undefined) {
        outputSize = 8 + 1 + output.size; // value + script_len + script
      } else {
        outputSize = this.OUTPUT_SIZES[output.type];
      }
      outputSizes.push(outputSize);
      baseSize += outputSize;
    }

    // Calculate total weight
    let totalWeight = baseSize * 4;
    if (hasWitness) {
      totalWeight += 2; // marker + flag
      totalWeight += totalWitnessSize;
    }

    const virtualSize = Math.ceil(totalWeight / 4);

    return {
      inputSizes,
      outputSizes,
      witnessSizes,
      baseSize,
      totalWeight,
      virtualSize,
    };
  }

  /**
   * Normalize fee rates from different sources to consistent satsPerVB
   */
  static normalizeFeeRate(rate: any, source: FeeSource): NormalizedFeeRate {
    let satsPerVB: number;

    switch (source) {
      case 'electrum':
        // ElectrumX typically returns sat/kB, convert to sat/vB
        if (typeof rate === 'number') {
          satsPerVB = Math.ceil(rate / 1000);
        } else if (rate && typeof rate.fee === 'number') {
          satsPerVB = Math.ceil(rate.fee / 1000);
        } else {
          throw new Error('Invalid ElectrumX fee rate format');
        }
        break;

      case 'explorer':
        // BTCStampsExplorer returns satsPerVB directly
        if (typeof rate === 'number') {
          satsPerVB = Math.ceil(rate);
        } else if (rate && typeof rate.satsPerVB === 'number') {
          satsPerVB = Math.ceil(rate.satsPerVB);
        } else {
          throw new Error('Invalid explorer fee rate format');
        }
        break;

      case 'mempool':
        // Mempool.space returns sat/vB
        if (typeof rate === 'number') {
          satsPerVB = Math.ceil(rate);
        } else if (rate && typeof rate.feeRate === 'number') {
          satsPerVB = Math.ceil(rate.feeRate);
        } else {
          throw new Error('Invalid mempool fee rate format');
        }
        break;

      default:
        throw new Error(`Unsupported fee source: ${source}`);
    }

    // Validate reasonable bounds before normalization (don't clamp here)
    if (satsPerVB < 1 || satsPerVB > 1000) {
      // Still clamp for the return value, but this helps validation functions detect out-of-bounds
      satsPerVB = Math.max(1, Math.min(1000, satsPerVB));
    }

    return {
      satsPerVB,
      unit: 'sat/vB' as FeeUnit,
      confidence: this.calculateConfidence(satsPerVB, source),
      source,
      timestamp: Date.now(),
    };
  }

  /**
   * Get standard fee levels matching BTCStampsExplorer production
   */
  static getStandardFeeLevel(priority: FeePriority): NormalizedFeeRate {
    return { ...this.BTCSTAMPS_EXPLORER_STANDARDS[priority] };
  }

  /**
   * Get all standard fee levels
   */
  static getAllStandardFeeLevels(): StandardFeeLevels {
    return {
      low: { ...this.BTCSTAMPS_EXPLORER_STANDARDS.low },
      medium: { ...this.BTCSTAMPS_EXPLORER_STANDARDS.medium },
      high: { ...this.BTCSTAMPS_EXPLORER_STANDARDS.high },
      urgent: { ...this.BTCSTAMPS_EXPLORER_STANDARDS.urgent },
    };
  }

  /**
   * Update standard fee levels (for production environment synchronization)
   */
  static updateStandardFeeLevels(newLevels: Partial<StandardFeeLevels>): void {
    if (newLevels.low) this.BTCSTAMPS_EXPLORER_STANDARDS.low = newLevels.low;
    if (newLevels.medium) {
      this.BTCSTAMPS_EXPLORER_STANDARDS.medium = newLevels.medium;
    }
    if (newLevels.high) this.BTCSTAMPS_EXPLORER_STANDARDS.high = newLevels.high;
    if (newLevels.urgent) {
      this.BTCSTAMPS_EXPLORER_STANDARDS.urgent = newLevels.urgent;
    }
  }

  /**
   * Calculate fee estimate using normalized satsPerVB
   */
  static calculateFee(virtualSize: number, satsPerVB: number): number {
    return Math.ceil(virtualSize * satsPerVB);
  }

  /**
   * Validate fee rate is within reasonable bounds
   */
  static validateFeeRate(satsPerVB: number): boolean {
    return satsPerVB >= 1 && satsPerVB <= 1000 && Number.isFinite(satsPerVB);
  }

  /**
   * Convert legacy fee calculation to normalized format
   */
  static normalizeLegacyFee(
    totalFee: number,
    transactionSize: number,
    unit: 'bytes' | 'vbytes' = 'vbytes',
  ): NormalizedFeeRate {
    let satsPerVB: number;

    if (unit === 'bytes') {
      // Legacy calculation, approximate conversion
      satsPerVB = Math.ceil(totalFee / transactionSize);
    } else {
      // Modern calculation
      satsPerVB = Math.ceil(totalFee / transactionSize);
    }

    return {
      satsPerVB,
      unit: 'sat/vB' as FeeUnit,
      confidence: 0.8, // Lower confidence for legacy conversions
      source: 'explorer',
      timestamp: Date.now(),
    };
  }

  // Private helper methods

  /**
   * Calculate variable integer encoding size
   */
  private static getVarIntSize(value: number): number {
    if (value < 0xfd) return 1;
    if (value <= 0xffff) return 3;
    if (value <= 0xffffffff) return 5;
    return 9;
  }

  /**
   * Calculate confidence level based on fee rate and source
   */
  private static calculateConfidence(
    satsPerVB: number,
    source: FeeSource,
  ): number {
    let baseConfidence: number;

    switch (source) {
      case 'explorer':
        baseConfidence = 0.9;
        break;
      case 'mempool':
        baseConfidence = 0.85;
        break;
      case 'electrum':
        baseConfidence = 0.8;
        break;
      default:
        baseConfidence = 0.7;
    }

    // Adjust confidence based on fee rate reasonableness
    if (satsPerVB < 1 || satsPerVB > 500) {
      baseConfidence *= 0.7; // Lower confidence for extreme values
    } else if (satsPerVB >= 5 && satsPerVB <= 100) {
      baseConfidence *= 1.0; // Normal range
    } else {
      baseConfidence *= 0.9; // Slightly lower for edge cases
    }

    return Math.min(0.99, Math.max(0.1, baseConfidence));
  }
}

/**
 * Helper functions for common fee normalization tasks
 */

/**
 * Create normalized fee rate from raw API response
 */
export function createNormalizedFeeRate(
  rate: number,
  unit: FeeUnit,
  source: FeeSource,
): NormalizedFeeRate {
  const satsPerVB = FeeNormalizer.toSatsPerVB(rate, unit);
  return FeeNormalizer.normalizeFeeRate(satsPerVB, source);
}

/**
 * Calculate transaction fee using normalized rates
 */
export function calculateNormalizedFee(
  inputs: Array<{ type: InputType; witnessScript?: Buffer }>,
  outputs: Array<{ type: OutputType; size?: number }>,
  feeRate: NormalizedFeeRate,
): {
  virtualSize: number;
  totalFee: number;
  feePerVB: number;
  calculation: VirtualSizeCalculation;
} {
  const calculation = FeeNormalizer.calculateVirtualSizeFromParams(
    inputs,
    outputs,
  );
  const totalFee = FeeNormalizer.calculateFee(
    calculation.virtualSize,
    feeRate.satsPerVB,
  );

  return {
    virtualSize: calculation.virtualSize,
    totalFee,
    feePerVB: feeRate.satsPerVB,
    calculation,
  };
}

/**
 * Get fee estimate with multiple priority levels
 */
export function getFeeLevelsEstimate(
  inputs: Array<{ type: InputType; witnessScript?: Buffer }>,
  outputs: Array<{ type: OutputType; size?: number }>,
): {
  virtualSize: number;
  estimates: Record<
    FeePriority,
    { totalFee: number; feeRate: NormalizedFeeRate }
  >;
} {
  const calculation = FeeNormalizer.calculateVirtualSizeFromParams(
    inputs,
    outputs,
  );
  const standardLevels = FeeNormalizer.getAllStandardFeeLevels();

  const estimates = Object.entries(standardLevels).reduce(
    (acc, [priority, feeRate]) => {
      acc[priority as FeePriority] = {
        totalFee: FeeNormalizer.calculateFee(
          calculation.virtualSize,
          feeRate.satsPerVB,
        ),
        feeRate,
      };
      return acc;
    },
    {} as Record<FeePriority, { totalFee: number; feeRate: NormalizedFeeRate }>,
  );

  return {
    virtualSize: calculation.virtualSize,
    estimates,
  };
}

/**
 * Validate and normalize fee from external source
 */
export function validateAndNormalizeFee(
  rate: any,
  source: FeeSource,
  minSatsPerVB = 1,
  maxSatsPerVB = 1000,
): NormalizedFeeRate | null {
  try {
    // First check if the raw input is within bounds before normalization
    let rawSatsPerVB: number;

    if (typeof rate === 'number') {
      if (source === 'electrum') {
        rawSatsPerVB = rate / 1000; // Convert from sat/kB
      } else {
        rawSatsPerVB = rate;
      }
    } else {
      // Try to normalize first to get the value
      const normalized = FeeNormalizer.normalizeFeeRate(rate, source);
      rawSatsPerVB = normalized.satsPerVB;
    }

    // Check bounds on the raw value
    if (rawSatsPerVB < minSatsPerVB || rawSatsPerVB > maxSatsPerVB) {
      return null; // Out of acceptable range
    }

    // If bounds check passes, return the normalized rate
    return FeeNormalizer.normalizeFeeRate(rate, source);
  } catch {
    // Silently handle errors for testing - in production you might want to log
    return null;
  }
}
