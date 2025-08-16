/**
 * Enhanced Fee Estimator Implementation
 * Provides accurate witness size calculation and dynamic dust thresholds
 * Uses normalized satsPerVB for consistency with BTCStampsExplorer
 */

import type {
  DustThresholds,
  FeeEstimate,
  FeeEstimatorOptions,
  FeeRate,
  IFeeEstimator,
  InputType,
  OutputType,
  SizeCalculation,
} from '../interfaces/fee.interface.ts';
import type { SRC20Options } from '../interfaces/src20.interface.ts';
import { createSRC20Options } from '../interfaces/src20.interface.ts';
import { ElectrumXProvider } from '../providers/electrumx-provider.ts';
import { ElectrumXFeeEstimator } from '../providers/electrumx-fee-estimator.ts';
import { createMockElectrumXFeeProvider } from '../providers/mock-electrumx-fee-provider.ts';
import type { MockElectrumXFeeProvider } from '../providers/mock-electrumx-fee-provider.ts';
import { FeeNormalizer, type FeeSource, type NormalizedFeeRate } from '../utils/fee-normalizer.ts';
import { Buffer } from 'node:buffer';
import process from 'node:process';

export class FeeEstimator implements IFeeEstimator {
  private options: Required<FeeEstimatorOptions>;
  private src20Options: Required<SRC20Options>;
  private electrumXFeeEstimator?: ElectrumXFeeEstimator;
  private mockElectrumXProvider?: MockElectrumXFeeProvider;

  // Accurate output sizes in bytes
  private static readonly OUTPUT_SIZES: Record<OutputType, number> = {
    P2PKH: 34, // 8 + 1 + 25 (value + script_len + script)
    P2WPKH: 31, // 8 + 1 + 22 (value + script_len + script)
    P2SH: 32, // 8 + 1 + 23 (value + script_len + script)
    P2WSH: 43, // 8 + 1 + 34 (value + script_len + script)
    P2TR: 43, // 8 + 1 + 34 (value + script_len + script)
    OP_RETURN: 0, // Variable, calculated separately
  };

  // Input base sizes (excluding witness data)
  private static readonly INPUT_BASE_SIZES: Record<InputType, number> = {
    P2PKH: 148, // 36 + 1 + 107 + 4 (outpoint + script_len + script + sequence)
    P2WPKH: 41, // 36 + 1 + 0 + 4 (outpoint + script_len + empty script + sequence)
    P2SH: 91, // Variable depending on redeem script
    P2WSH: 41, // 36 + 1 + 0 + 4 (outpoint + script_len + empty script + sequence)
    P2TR: 57, // 36 + 1 + 16 + 4 (outpoint + script_len + control block + sequence)
  };

  // Witness sizes for SegWit inputs
  private static readonly WITNESS_SIZES: Record<string, number> = {
    P2WPKH: 27, // 1 + 1 + 1 + 33 + 1 + 64 (items + sig_len + sig + pubkey_len + pubkey)
    P2WSH: 0, // Variable, depends on script
    P2TR: 16, // 1 + 1 + 64 (items + sig_len + signature)
  };

  // Standard dust thresholds (will be adjusted dynamically)
  private static readonly BASE_DUST_THRESHOLDS: DustThresholds = {
    P2PKH: 546,
    P2WPKH: 294,
    P2SH: 540,
    P2WSH: 330,
    P2TR: 330,
  };

  constructor(options?: FeeEstimatorOptions, src20Options?: SRC20Options) {
    this.options = {
      provider: options?.provider ?? 'mempool',
      fallbackFeeRate: options?.fallbackFeeRate ?? 10,
      minFeeRate: options?.minFeeRate ?? 1,
      maxFeeRate: options?.maxFeeRate ?? 1000,
      enableSrc20Rules: options?.enableSrc20Rules ?? true,
      networkType: options?.networkType ?? 'mainnet',
      useMockProvider: options?.useMockProvider ?? false, // Default to real provider
      electrumXProvider: options?.electrumXProvider ?? undefined,
    };

    this.src20Options = createSRC20Options(src20Options);

    // Initialize ElectrumX provider if configured
    if (this.options.provider === 'electrum') {
      if (this.options.useMockProvider || process.env.NODE_ENV === 'test') {
        // Use mock for testing
        this.mockElectrumXProvider = createMockElectrumXFeeProvider();
      } else if (this.options.electrumXProvider) {
        // Use injected provider
        this.electrumXFeeEstimator = new ElectrumXFeeEstimator(
          this.options.electrumXProvider,
        );
      } else {
        // Create real provider for production
        const realProvider = new ElectrumXProvider();
        this.electrumXFeeEstimator = new ElectrumXFeeEstimator(realProvider);
      }
    }
  }

  async getFeeRates(): Promise<FeeRate> {
    try {
      // Use configured provider
      switch (this.options.provider) {
        case 'electrum':
          if (this.electrumXFeeEstimator) {
            // Use real ElectrumX fee estimator
            const [low, medium, high, urgent] = await Promise.all([
              this.electrumXFeeEstimator.getFeeEstimate('low'),
              this.electrumXFeeEstimator.getFeeEstimate('medium'),
              this.electrumXFeeEstimator.getFeeEstimate('high'),
              this.electrumXFeeEstimator.getFeeEstimate('urgent'),
            ]);

            return {
              low: low.feeRate,
              medium: medium.feeRate,
              high: high.feeRate,
              urgent: urgent.feeRate,
            };
          } else if (this.mockElectrumXProvider) {
            // Fallback to mock (test mode)
            const rates = await this.mockElectrumXProvider.getFeeRates();
            return this.normalizeFeeRatesFromProvider(rates, 'electrum');
          }
          break;
        case 'mempool': {
          const mempoolRates = await this.getMempoolSpaceFeeRates();
          return this.normalizeFeeRatesFromProvider(mempoolRates, 'mempool');
        }
        case 'blockstream': {
          const blockstreamRates = await this.getBlockstreamFeeRates();
          return this.normalizeFeeRatesFromProvider(
            blockstreamRates,
            'explorer',
          );
        }
        case 'custom':
          // Implementers can override this method
          break;
      }
    } catch (error) {
      console.warn(`Fee provider ${this.options.provider} failed:`, error);
    }

    // Fallback to BTCStampsExplorer standard rates (already normalized)
    const standardRates = FeeNormalizer.getAllStandardFeeLevels();
    return {
      low: standardRates.low.satsPerVB,
      medium: standardRates.medium.satsPerVB,
      high: standardRates.high.satsPerVB,
      urgent: standardRates.urgent.satsPerVB,
    };
  }

  async estimateFee(
    size: number,
    priority: 'low' | 'medium' | 'high' | 'urgent',
  ): Promise<FeeEstimate> {
    const feeRates = await this.getFeeRates();
    const feeRate = feeRates[priority] || feeRates.medium;

    const totalFee = Math.ceil(size * feeRate);

    const timeEstimates = {
      low: '1-2 hours',
      medium: '30-60 minutes',
      high: '10-20 minutes',
      urgent: '5-10 minutes',
    };

    const blockEstimates = {
      low: 6,
      medium: 3,
      high: 1,
      urgent: 1,
    };

    const confidenceLevel = {
      low: 0.7,
      medium: 0.85,
      high: 0.95,
      urgent: 0.99,
    };

    return {
      feeRate,
      totalFee,
      confidence: confidenceLevel[priority],
      blocks: blockEstimates[priority],
      confirmationTime: timeEstimates[priority],
      priority,
    };
  }

  calculateTransactionSize(
    inputs: Array<{ type: InputType; witnessScript?: Buffer }>,
    outputs: Array<{ type: OutputType; size?: number }>,
  ): SizeCalculation {
    // Use the normalized fee calculator for consistent virtual size calculation
    const calculation = FeeNormalizer.calculateVirtualSizeFromParams(
      inputs,
      outputs,
    );

    return {
      inputSize: calculation.inputSizes.reduce((sum, size) => sum + size, 0),
      outputSize: calculation.outputSizes.reduce((sum, size) => sum + size, 0),
      witnessSize: calculation.witnessSizes.reduce(
        (sum, size) => sum + size,
        0,
      ),
      virtualSize: calculation.virtualSize,
    };
  }

  getOutputSize(type: OutputType, scriptSize?: number): number {
    if (type === 'OP_RETURN' && scriptSize !== undefined) {
      return 8 + 1 + scriptSize; // value + script_len + script
    }

    return FeeEstimator.OUTPUT_SIZES[type];
  }

  getInputSize(type: InputType, witnessScript?: Buffer): SizeCalculation {
    const baseSize = FeeEstimator.INPUT_BASE_SIZES[type];
    let witnessSize: number = 0;

    switch (type) {
      case 'P2WPKH':
        witnessSize = FeeEstimator.WITNESS_SIZES.P2WPKH ?? 0;
        break;
      case 'P2WSH':
        if (witnessScript) {
          // Witness stack: script + other items
          witnessSize = 1 + witnessScript.length + 64; // items count + script + signature
        } else {
          witnessSize = FeeEstimator.WITNESS_SIZES.P2WSH ?? 0;
        }
        break;
      case 'P2TR':
        witnessSize = FeeEstimator.WITNESS_SIZES.P2TR ?? 0;
        break;
      case 'P2SH':
        // P2SH size depends on the redeem script
        if (witnessScript) {
          return {
            inputSize: baseSize + witnessScript.length,
            outputSize: 0,
            witnessSize: 0, // P2SH doesn't use witness data
            virtualSize: baseSize + witnessScript.length,
          };
        }
        witnessSize = 0; // P2SH doesn't use witness data
        break;
      case 'P2PKH':
        witnessSize = 0; // P2PKH doesn't use witness data
        break;
    }

    return {
      inputSize: baseSize,
      outputSize: 0,
      witnessSize,
      virtualSize: witnessSize > 0 ? baseSize + Math.ceil(witnessSize / 4) : baseSize,
    };
  }

  getDustThresholds(feeRate?: number): DustThresholds {
    const rate = feeRate || 3; // Default relay fee rate

    // Dynamic dust calculation: (input_size + output_size) * fee_rate
    const thresholds: DustThresholds = {
      P2PKH: 0,
      P2WPKH: 0,
      P2SH: 0,
      P2WSH: 0,
      P2TR: 0,
    };

    // Calculate dust for each output type
    Object.keys(thresholds).forEach((outputType) => {
      const type = outputType as keyof DustThresholds;
      const outputSize = FeeEstimator.OUTPUT_SIZES[type as OutputType];

      // Use P2WPKH input for spending the output (most efficient)
      const spendInputSize = this.getInputSize('P2WPKH').virtualSize;

      const dustValue = (outputSize + spendInputSize) * rate;
      thresholds[type] = Math.max(
        dustValue,
        FeeEstimator.BASE_DUST_THRESHOLDS[type],
      );
    });

    return thresholds;
  }

  async calculateCPFP(
    parentTxid: string,
    parentFee: number,
    childSize: number,
    targetFeeRate: number,
  ): Promise<number> {
    // Try to get parent transaction if we have a real provider
    if (this.electrumXFeeEstimator?.provider) {
      try {
        // Fetch parent transaction
        const parentTx = await this.electrumXFeeEstimator.provider.getTransaction(parentTxid);

        if (parentTx) {
          const parentSize = parentTx.vsize || parentTx.size || 250;
          const actualParentFee = parentTx.fee || parentFee;

          // Standard CPFP calculation
          const combinedSize = parentSize + childSize;
          const targetTotalFee = combinedSize * targetFeeRate;
          const requiredChildFee = Math.max(
            targetTotalFee - actualParentFee,
            childSize, // Minimum 1 sat/vbyte
          );

          return requiredChildFee;
        }
      } catch (error) {
        console.warn(
          `Failed to fetch parent transaction ${parentTxid}, using estimated size:`,
          error,
        );
      }
    }

    // Fallback to estimated calculation (for mock provider or if real fetch fails)
    const estimatedParentSize = 250; // Average transaction size
    const totalSize = estimatedParentSize + childSize;
    const totalFeeNeeded = totalSize * targetFeeRate;
    const childFeeNeeded = totalFeeNeeded - parentFee;

    return Math.max(childFeeNeeded, childSize); // Minimum 1 sat/vbyte
  }

  calculateRBF(originalFee: number, minRelayFee: number = 1): number {
    // RBF requires absolute fee increase of at least 1 sat/vbyte of replacement tx size
    // For simplicity, add 25% to original fee or minimum relay fee, whichever is higher
    const minimumIncrease = Math.max(originalFee * 0.25, minRelayFee);
    return originalFee + minimumIncrease;
  }

  /**
   * Get fee estimation for specific transaction parameters
   */
  async getOptimalFee(params: {
    inputs: Array<{ type: InputType; witnessScript?: Buffer }>;
    outputs: Array<{ type: OutputType; size?: number }>;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }): Promise<FeeEstimate & { sizeBreakdown: SizeCalculation }> {
    const { inputs, outputs, priority = 'medium' } = params;

    const sizeBreakdown = this.calculateTransactionSize(inputs, outputs);
    const feeEstimate = await this.estimateFee(
      sizeBreakdown.virtualSize,
      priority,
    );

    return {
      ...feeEstimate,
      sizeBreakdown,
    };
  }

  /**
   * Validate if output value is above dust threshold
   */
  isAboveDustThreshold(
    value: number,
    outputType: OutputType,
    feeRate?: number,
  ): boolean {
    const thresholds = this.getDustThresholds(feeRate);
    const threshold = thresholds[outputType as keyof DustThresholds];

    return value >= threshold;
  }

  /**
   * Normalize fee rates from external providers to ensure consistency
   */
  private normalizeFeeRatesFromProvider(
    rates: FeeRate,
    source: FeeSource,
  ): FeeRate {
    return {
      low: FeeNormalizer.normalizeFeeRate(rates.low, source).satsPerVB,
      medium: FeeNormalizer.normalizeFeeRate(rates.medium, source).satsPerVB,
      high: FeeNormalizer.normalizeFeeRate(rates.high, source).satsPerVB,
      urgent: rates.urgent
        ? FeeNormalizer.normalizeFeeRate(rates.urgent, source).satsPerVB
        : undefined,
    };
  }

  /**
   * Get normalized fee rates for all priority levels
   */
  async getNormalizedFeeRates(): Promise<{
    low: NormalizedFeeRate;
    medium: NormalizedFeeRate;
    high: NormalizedFeeRate;
    urgent: NormalizedFeeRate;
  }> {
    try {
      switch (this.options.provider) {
        case 'electrum':
          if (this.electrumXFeeEstimator) {
            // Use real ElectrumX fee estimator
            const [low, medium, high, urgent] = await Promise.all([
              this.electrumXFeeEstimator.getFeeEstimate('low'),
              this.electrumXFeeEstimator.getFeeEstimate('medium'),
              this.electrumXFeeEstimator.getFeeEstimate('high'),
              this.electrumXFeeEstimator.getFeeEstimate('urgent'),
            ]);

            return {
              low: FeeNormalizer.normalizeFeeRate(low.feeRate, 'electrum'),
              medium: FeeNormalizer.normalizeFeeRate(medium.feeRate, 'electrum'),
              high: FeeNormalizer.normalizeFeeRate(high.feeRate, 'electrum'),
              urgent: FeeNormalizer.normalizeFeeRate(urgent.feeRate, 'electrum'),
            };
          } else if (this.mockElectrumXProvider) {
            // Fallback to mock (test mode)
            const rates = await this.mockElectrumXProvider.getFeeRates();
            return {
              low: FeeNormalizer.normalizeFeeRate(rates.low, 'electrum'),
              medium: FeeNormalizer.normalizeFeeRate(rates.medium, 'electrum'),
              high: FeeNormalizer.normalizeFeeRate(rates.high, 'electrum'),
              urgent: FeeNormalizer.normalizeFeeRate(
                rates.urgent || rates.high * 1.5,
                'electrum',
              ),
            };
          }
          break;
        case 'mempool': {
          const mempoolRates = await this.getMempoolSpaceFeeRates();
          return {
            low: FeeNormalizer.normalizeFeeRate(mempoolRates.low, 'mempool'),
            medium: FeeNormalizer.normalizeFeeRate(
              mempoolRates.medium,
              'mempool',
            ),
            high: FeeNormalizer.normalizeFeeRate(mempoolRates.high, 'mempool'),
            urgent: FeeNormalizer.normalizeFeeRate(
              mempoolRates.urgent || mempoolRates.high * 1.5,
              'mempool',
            ),
          };
        }
        case 'blockstream': {
          const blockstreamRates = await this.getBlockstreamFeeRates();
          return {
            low: FeeNormalizer.normalizeFeeRate(
              blockstreamRates.low,
              'explorer',
            ),
            medium: FeeNormalizer.normalizeFeeRate(
              blockstreamRates.medium,
              'explorer',
            ),
            high: FeeNormalizer.normalizeFeeRate(
              blockstreamRates.high,
              'explorer',
            ),
            urgent: FeeNormalizer.normalizeFeeRate(
              blockstreamRates.urgent || blockstreamRates.high * 1.5,
              'explorer',
            ),
          };
        }
      }
    } catch (error) {
      console.warn(`Fee provider ${this.options.provider} failed:`, error);
    }

    // Fallback to BTCStampsExplorer standard rates
    return FeeNormalizer.getAllStandardFeeLevels();
  }

  /**
   * Get fee rates from mempool.space API
   */
  private async getMempoolSpaceFeeRates(): Promise<FeeRate> {
    const response = await fetch(
      'https://mempool.space/api/v1/fees/recommended',
    );

    if (!response.ok) {
      throw new Error(`Mempool.space API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      low: data.economyFee || 5,
      medium: data.hourFee || 15,
      high: data.halfHourFee || 30,
      urgent: data.fastestFee || 50,
    };
  }

  /**
   * Get fee rates from Blockstream API
   */
  private async getBlockstreamFeeRates(): Promise<FeeRate> {
    const response = await fetch('https://blockstream.info/api/fee-estimates');

    if (!response.ok) {
      throw new Error(`Blockstream API error: ${response.status}`);
    }

    const data = await response.json();

    // Map block targets to priority levels
    return {
      urgent: data['1'] || 50, // Next block
      high: data['3'] || 30, // 3 blocks
      medium: data['6'] || 15, // 6 blocks
      low: data['25'] || 5, // 25 blocks
    };
  }

  /**
   * Set custom fee provider
   */
  setProvider(provider: NonNullable<FeeEstimatorOptions['provider']>): void {
    this.options.provider = provider;

    // Initialize ElectrumX if switching to electrum
    if (provider === 'electrum' && !this.electrumXFeeEstimator && !this.mockElectrumXProvider) {
      if (this.options.useMockProvider || process.env.NODE_ENV === 'test') {
        this.mockElectrumXProvider = createMockElectrumXFeeProvider();
      } else {
        const realProvider = new ElectrumXProvider();
        this.electrumXFeeEstimator = new ElectrumXFeeEstimator(realProvider);
      }
    }
  }

  /**
   * Get current provider configuration
   */
  getProviderInfo(): {
    provider: string;
    electrumXConnected: boolean;
    fallbackFeeRate: number;
    useMockProvider: boolean;
  } {
    return {
      provider: this.options.provider,
      electrumXConnected: !!(this.electrumXFeeEstimator || this.mockElectrumXProvider),
      fallbackFeeRate: this.options.fallbackFeeRate,
      useMockProvider: !!this.mockElectrumXProvider,
    };
  }

  /**
   * Test connection to current fee provider
   */
  async testProvider(): Promise<{
    success: boolean;
    provider: string;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      await this.getFeeRates();
      const latency = Date.now() - startTime;

      return {
        success: true,
        provider: this.options.provider,
        latency,
      };
    } catch (error) {
      return {
        success: false,
        provider: this.options.provider,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
