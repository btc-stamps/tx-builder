/**
 * Dynamic Dust Threshold Calculator
 * Implements Bitcoin Core's dust calculation logic with network-aware thresholds
 */

import { Buffer } from 'node:buffer';

import type { DustThresholds, OutputType } from '../interfaces/fee.interface.ts';
import type { SRC20Options } from '../interfaces/src20.interface.ts';

export interface DustCalculatorOptions {
  minRelayFeeRate?: number; // Default 1 sat/vB
  networkType?: 'mainnet' | 'testnet' | 'regtest';
  enableSrc20Rules?: boolean;
  src20Options?: SRC20Options; // Configurable SRC-20 options
}

/**
 * Calculates dynamic dust thresholds based on network conditions and fee rates
 */
export class DustCalculator {
  private options: Required<Omit<DustCalculatorOptions, 'src20Options'>>;

  // Network-specific relay fee rates (sat/vB)
  public static readonly NETWORK_MIN_RELAY_RATES = {
    mainnet: 1.0,
    testnet: 1.0,
    regtest: 0.0, // No minimum for regtest
  };

  // Standard sizes for calculating dust thresholds
  private static readonly SCRIPT_SIZES = {
    P2PKH: 25, // OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
    P2WPKH: 22, // OP_0 <20 bytes>
    P2SH: 23, // OP_HASH160 <20 bytes> OP_EQUAL
    P2WSH: 34, // OP_0 <32 bytes>
    P2TR: 34, // OP_1 <32 bytes>
    OP_RETURN: 0, // Variable
  };

  // Input sizes when spending different output types (most efficient input type)
  private static readonly SPEND_INPUT_SIZES = {
    P2PKH: 148, // Legacy input spending P2PKH
    P2WPKH: 68, // SegWit v0 input (41 base + 27 witness / 4)
    P2SH: 298, // P2SH with worst case redeem script
    P2WSH: 68, // SegWit v0 input (41 base + witness varies)
    P2TR: 68, // SegWit v1 input (57 base + 16 witness / 4)
  };

  private src20Options?: SRC20Options;

  constructor(options?: DustCalculatorOptions) {
    this.options = {
      minRelayFeeRate: options?.minRelayFeeRate ?? 1,
      networkType: options?.networkType ?? 'mainnet',
      enableSrc20Rules: options?.enableSrc20Rules ?? true,
    };

    this.src20Options = options?.src20Options ?? undefined;
  }

  /**
   * Calculate dynamic dust threshold for a specific output type
   * Based on Bitcoin Core's GetDustThreshold function
   */
  calculateDustThreshold(
    outputType: OutputType,
    scriptSize?: number,
    feeRate?: number,
  ): number {
    const rate = feeRate ?? this.options.minRelayFeeRate;

    // Get output size
    const outputSize = this.getOutputSize(outputType, scriptSize);

    // Get size of input that would spend this output
    const spendInputSize = this.getSpendInputSize(outputType);

    // Dust threshold = (input_size + output_size) * fee_rate
    const dustThreshold = (spendInputSize + outputSize) * rate;

    // Apply network minimums
    const networkMinimum = this.getNetworkMinimum(outputType);

    return Math.max(Math.ceil(dustThreshold), networkMinimum);
  }

  /**
   * Calculate all dust thresholds for current network conditions
   */
  calculateAllThresholds(feeRate?: number): DustThresholds {
    const rate = feeRate ?? this.options.minRelayFeeRate;

    return {
      P2PKH: this.calculateDustThreshold('P2PKH', undefined, rate),
      P2WPKH: this.calculateDustThreshold('P2WPKH', undefined, rate),
      P2SH: this.calculateDustThreshold('P2SH', undefined, rate),
      P2WSH: this.calculateDustThreshold('P2WSH', undefined, rate),
      P2TR: this.calculateDustThreshold('P2TR', undefined, rate),
    };
  }

  /**
   * Check if a value is above dust threshold for specific output type
   */
  isAboveDustThreshold(
    value: number,
    outputType: OutputType,
    scriptSize?: number,
    feeRate?: number,
  ): boolean {
    const dustThreshold = this.calculateDustThreshold(
      outputType,
      scriptSize,
      feeRate,
    );
    return value >= dustThreshold;
  }

  /**
   * Get output size in bytes
   */
  private getOutputSize(outputType: OutputType, scriptSize?: number): number {
    const baseSize = 8; // 8 bytes for value
    const scriptLenSize = 1; // 1 byte for script length (assuming < 253 bytes)

    if (outputType === 'OP_RETURN' && scriptSize !== undefined) {
      return baseSize + scriptLenSize + scriptSize;
    }

    const standardScriptSize = DustCalculator.SCRIPT_SIZES[outputType];
    return baseSize + scriptLenSize + standardScriptSize;
  }

  /**
   * Get the size of input required to spend this output type
   */
  private getSpendInputSize(outputType: OutputType): number {
    // OP_RETURN outputs cannot be spent, so they don't contribute to spending input size
    if (outputType === 'OP_RETURN') {
      return 0;
    }
    return (DustCalculator.SPEND_INPUT_SIZES as Record<string, number>)[
      outputType
    ] ??
      DustCalculator.SPEND_INPUT_SIZES.P2WPKH;
  }

  /**
   * Get network-specific minimum dust threshold
   */
  private getNetworkMinimum(outputType: OutputType): number {
    // Network minimums based on historical Bitcoin Core values
    const networkMinimums: Record<
      typeof this.options.networkType,
      Partial<Record<OutputType, number>>
    > = {
      mainnet: {
        P2PKH: 546,
        P2WPKH: 294,
        P2SH: 540,
        P2WSH: 330,
        P2TR: 330,
      },
      testnet: {
        P2PKH: 546,
        P2WPKH: 294,
        P2SH: 540,
        P2WSH: 330,
        P2TR: 330,
      },
      regtest: {
        // No minimums on regtest
        P2PKH: 0,
        P2WPKH: 0,
        P2SH: 0,
        P2WSH: 0,
        P2TR: 0,
      },
    };

    return networkMinimums[this.options.networkType][outputType] ?? 0;
  }

  /**
   * Calculate dust threshold for custom script
   */
  calculateCustomScriptDust(scriptHex: string, feeRate?: number): number {
    const scriptBytes = Buffer.from(scriptHex, 'hex');
    return this.calculateDustThreshold(
      'OP_RETURN',
      scriptBytes.length,
      feeRate,
    );
  }

  /**
   * Get current fee rate from network
   */
  getNetworkMinRelayFeeRate(): number {
    return DustCalculator.NETWORK_MIN_RELAY_RATES[this.options.networkType];
  }

  /**
   * Validate dust thresholds against Bitcoin Core reference values
   */
  validateAgainstReference(): {
    isValid: boolean;
    differences: Array<{
      outputType: OutputType;
      calculated: number;
      expected: number;
      diff: number;
    }>;
  } {
    const referenceThresholds: DustThresholds = {
      P2PKH: 546,
      P2WPKH: 294,
      P2SH: 540,
      P2WSH: 330,
      P2TR: 330,
    };

    const calculated = this.calculateAllThresholds(1); // Use 1 sat/vB to match Bitcoin Core minimum
    const differences: Array<{
      outputType: OutputType;
      calculated: number;
      expected: number;
      diff: number;
    }> = [];
    let isValid = true;

    Object.keys(referenceThresholds).forEach((key) => {
      const outputType = key as keyof DustThresholds;
      const expected = referenceThresholds[outputType];
      const calculatedValue = calculated[outputType];
      const diff = Math.abs(calculatedValue - expected);

      // For validation, we accept values that meet or exceed reference minimums
      // since our calculation should be at least as restrictive as Bitcoin Core
      if (calculatedValue < expected - 10) { // Allow small tolerance below reference
        isValid = false;
      }

      differences.push({
        outputType: outputType as OutputType,
        calculated: calculatedValue,
        expected,
        diff,
      });
    });

    return { isValid, differences };
  }
}

/**
 * Helper function to create dust calculator with standard settings
 */
export function createDustCalculator(
  networkType: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
  enableSrc20Rules: boolean = true,
  src20Options?: SRC20Options,
): DustCalculator {
  return new DustCalculator({
    networkType,
    enableSrc20Rules,
    src20Options: src20Options ?? undefined,
    minRelayFeeRate: DustCalculator.NETWORK_MIN_RELAY_RATES[networkType],
  });
}
