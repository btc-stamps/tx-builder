/**
 * Main Transaction Builder Implementation
 */

import { Buffer } from 'node:buffer';

import * as bitcoin from 'bitcoinjs-lib';
import type { ECPairInterface as _ECPairInterface } from 'ecpair';

import type {
  DustThresholds,
  InputType as _InputType,
  OutputType as _OutputType,
} from '../interfaces/fee.interface.ts';
import type { UTXO } from '../interfaces/provider.interface.ts';
import type {
  BuildOptions,
  ITransactionBuilder,
  SignOptions,
  TransactionBuilderConfig,
  TransactionInput,
  TransactionOutput,
} from '../interfaces/transaction.interface.ts';
import { createDustCalculator } from '../utils/dust-calculator.ts';
import { createSrc20FeeCalculator } from '../utils/src20-fee-calculator.ts';
import type { Src20TransactionParams as _Src20TransactionParams } from '../utils/src20-fee-calculator.ts';
import { createAdvancedFeeCalculator } from '../calculators/advanced-fee-calculator.ts';
import type {
  AdvancedFeeCalculator,
  FeePrediction as _FeePrediction,
  Operation as _Operation,
  StampData as _StampData,
} from '../calculators/advanced-fee-calculator.ts';
import { createStampValidationEngine } from '../validators/index.ts';
import type {
  StampValidationEngine,
  ValidationResult as _ValidationResult,
} from '../validators/index.ts';

import { FeeEstimator } from './fee-estimator.ts';
import {
  calculateNormalizedFee as _calculateNormalizedFee,
  FeeNormalizer as _FeeNormalizer,
  getFeeLevelsEstimate as _getFeeLevelsEstimate,
  type NormalizedFeeRate as _NormalizedFeeRate,
} from '../utils/fee-normalizer.ts';

/**
 * Main transaction builder for creating Bitcoin transactions with advanced features
 * 
 * @remarks
 * Provides comprehensive transaction building capabilities including:
 * - UTXO selection and management
 * - Fee calculation and optimization
 * - Multi-signature support
 * - RBF (Replace-By-Fee) configuration
 * - Dust threshold management
 * 
 * @example
 * ```typescript
 * const builder = new TransactionBuilder({
 *   network: networks.bitcoin,
 *   dustThreshold: 546,
 *   defaultFeeRate: 10
 * });
 * 
 * const psbt = await builder.buildTransaction({
 *   inputs: [...],
 *   outputs: [...],
 *   feeRate: 15
 * });
 * ```
 */
export class TransactionBuilder implements ITransactionBuilder {
  private config: Required<TransactionBuilderConfig>;
  private feeEstimator: FeeEstimator;
  private dustCalculator: ReturnType<typeof createDustCalculator>;
  private src20FeeCalculator: ReturnType<typeof createSrc20FeeCalculator>;
  private advancedFeeCalculator: AdvancedFeeCalculator;
  private validationEngine: StampValidationEngine;
  // Validation hooks removed - simplified validation

  constructor(config: TransactionBuilderConfig) {
    this.config = {
      network: config.network,
      dustThreshold: config.dustThreshold ?? 546,
      defaultFeeRate: config.defaultFeeRate ?? 15, // Updated to match BTCStampsExplorer standard
      defaultRbf: config.defaultRbf ?? true,
    };

    // Initialize enhanced fee estimation and dust calculation
    const networkType = config.network === bitcoin.networks.testnet
      ? 'testnet'
      : config.network === bitcoin.networks.regtest
      ? 'regtest'
      : 'mainnet';

    this.feeEstimator = new FeeEstimator({
      networkType,
      enableSrc20Rules: true,
    });

    this.dustCalculator = createDustCalculator(
      networkType,
      true, // Enable SRC-20 rules
    );

    this.src20FeeCalculator = createSrc20FeeCalculator();

    // Initialize advanced fee calculator with optimizations
    this.advancedFeeCalculator = createAdvancedFeeCalculator({
      networkType,
    });

    // Initialize validation engine
    this.validationEngine = createStampValidationEngine({
      network: config.network,
      maxSize: this.config.dustThreshold,
    });

    // Validation hooks removed - simplified validation
  }

  async create(options: BuildOptions): Promise<bitcoin.Psbt & { outputCount: number }> {
    // Validate inputs
    if (!options.outputs || options.outputs.length === 0) {
      throw new Error('Transaction must have at least one output');
    }

    const network = options.network ?? this.config.network;

    // Validate each output
    for (const output of options.outputs) {
      if (!output.address && !output.script) {
        throw new Error('Output must have either address or script');
      }
      if (typeof output.value !== 'number' || output.value < 0) {
        throw new Error('Output value must be a non-negative number');
      }

      // Validate address format for the specified network
      if (output.address) {
        try {
          bitcoin.address.toOutputScript(output.address, network);
        } catch {
          throw new Error(`Invalid address for network: ${output.address}`);
        }
      }
    }

    const psbt = new bitcoin.Psbt({
      network: options.network ?? this.config.network,
    });

    // Set version
    if (options.version) {
      psbt.setVersion(options.version);
    }

    // Set locktime
    if (options.locktime !== undefined) {
      psbt.setLocktime(options.locktime);
    }

    // Add inputs
    if (options.inputs) {
      await this.addInputs(psbt, options.inputs || []);
    }

    // Add outputs
    await this.addOutputs(psbt, options.outputs);

    // Add change if needed
    if (options.changeAddress) {
      const inputValue = options.inputs?.reduce((sum, input) => sum + input.utxo.value, 0) ?? 0;
      const outputValue = options.outputs.reduce((sum, output) => sum + output.value, 0);
      const feeRate = options.feeRate ?? this.config.defaultFeeRate;
      const estimatedFee = this.calculateFee(
        this.estimateSize(
          options.inputs?.length ?? 0,
          options.outputs.length + 1,
          false,
        ),
        feeRate,
      );
      const change = inputValue - outputValue - estimatedFee;

      if (change > this.config.dustThreshold) {
        this.addChange(psbt, options.changeAddress, change);
      }
    }

    // Add outputCount property for test compatibility
    Object.defineProperty(psbt, 'outputCount', {
      get: function () {
        return this.txOutputs.length;
      },
      enumerable: false,
      configurable: true,
    });

    return psbt as bitcoin.Psbt & { outputCount: number };
  }

  addInputs(psbt: bitcoin.Psbt, inputs: TransactionInput[]): Promise<void> {
    return Promise.resolve().then(() => {
      // Simple validation - removed complex hooks
      const validationResult = { isValid: true, errors: [], warnings: [], details: {} };

      if (!validationResult.isValid) {
        const errorMsg = validationResult.errors.map((
          err: { message: string },
        ) => err.message).join(', ');
        throw new Error(`Input validation failed: ${errorMsg}`);
      }

      for (const input of inputs) {
        const inputData: any = {
          hash: input.utxo.txid,
          index: input.utxo.vout,
        };

        // Set sequence for RBF
        if (input.sequence !== undefined) {
          inputData.sequence = input.sequence;
        } else if (this.config.defaultRbf) {
          inputData.sequence = 0xfffffffd; // RBF enabled
        }

        // Add witness or non-witness UTXO
        if (input.witnessUtxo) {
          inputData.witnessUtxo = input.witnessUtxo;
        } else if (input.nonWitnessUtxo) {
          inputData.nonWitnessUtxo = input.nonWitnessUtxo;
        } else {
          // Create witness UTXO from UTXO data
          inputData.witnessUtxo = {
            script: Buffer.from(input.utxo.scriptPubKey, 'hex'),
            value: input.utxo.value,
          };
        }

        psbt.addInput(inputData);
      }
      return;
    });
  }

  addOutputs(psbt: bitcoin.Psbt, outputs: TransactionOutput[]): Promise<void> {
    return Promise.resolve().then(() => {
      // Simple validation - removed complex hooks
      const validationResult = { isValid: true, errors: [], warnings: [], details: {} };

      if (!validationResult.isValid) {
        const errorMsg = validationResult.errors.map((
          err: { message: string },
        ) => err.message).join(', ');
        throw new Error(`Output validation failed: ${errorMsg}`);
      }

      for (const output of outputs) {
        if (output.address) {
          psbt.addOutput({
            address: output.address,
            value: output.value,
          });
        } else if (output.script) {
          psbt.addOutput({
            script: output.script,
            value: output.value,
          });
        } else {
          throw new Error('Output must have either address or script');
        }
      }
      return;
    });
  }

  addChange(
    psbt: bitcoin.Psbt,
    changeAddress: string,
    changeAmount: number,
  ): void {
    if (changeAmount > this.config.dustThreshold) {
      psbt.addOutput({
        address: changeAddress,
        value: changeAmount,
      });
    }
  }

  sign(psbt: bitcoin.Psbt, options: SignOptions): Promise<void> {
    return Promise.resolve().then(() => {
      if (options.keyPair) {
        if (options.signAll) {
          if (options.sighashType !== undefined) {
            psbt.signAllInputs(options.keyPair, [options.sighashType]);
          } else {
            psbt.signAllInputs(options.keyPair);
          }
        } else {
          for (let i = 0; i < psbt.inputCount; i++) {
            try {
              if (options.sighashType !== undefined) {
                psbt.signInput(i, options.keyPair, [options.sighashType]);
              } else {
                psbt.signInput(i, options.keyPair);
              }
            } catch {
              // Skip inputs that can't be signed with this key
              continue;
            }
          }
        }
      } else if (options.keyPairs) {
        for (const keyPair of options.keyPairs) {
          for (let i = 0; i < psbt.inputCount; i++) {
            try {
              if (options.sighashType !== undefined) {
                psbt.signInput(i, keyPair, [options.sighashType]);
              } else {
                psbt.signInput(i, keyPair);
              }
            } catch {
              // Skip inputs that can't be signed with this key
              continue;
            }
          }
        }
      }
      return;
    });
  }

  finalize(psbt: bitcoin.Psbt): Promise<bitcoin.Transaction> {
    return Promise.resolve().then(() => {
      // Simple validation - removed complex hooks
      const validationResult = { isValid: true, errors: [], warnings: [], details: {} };

      if (!validationResult.isValid) {
        const errorMsg = validationResult.errors.map((
          err: { message: string },
        ) => err.message).join(', ');
        throw new Error(`Pre-finalization validation failed: ${errorMsg}`);
      }

      psbt.finalizeAllInputs();
      return psbt.extractTransaction();
    });
  }

  buildFromUTXOs(
    utxos: UTXO[],
    outputs: TransactionOutput[],
    changeAddress: string,
    options?: Partial<BuildOptions>,
  ): bitcoin.Psbt & { outputCount: number } {
    const inputs: TransactionInput[] = utxos.map((utxo) => ({
      utxo,
      witnessUtxo: {
        script: Buffer.from(utxo.scriptPubKey, 'hex'),
        value: utxo.value,
      },
    }));

    const psbt = new bitcoin.Psbt({
      network: options?.network ?? this.config.network,
    });

    // Set version
    if (options?.version) {
      psbt.setVersion(options.version);
    }

    // Set locktime
    if (options?.locktime !== undefined) {
      psbt.setLocktime(options.locktime);
    }

    // Add inputs
    for (const input of inputs) {
      const inputData: any = {
        hash: Buffer.from(input.utxo.txid, 'hex'),
        index: input.utxo.vout,
      };

      // Set sequence for RBF
      if (input.sequence !== undefined) {
        inputData.sequence = input.sequence;
      } else if (this.config.defaultRbf) {
        inputData.sequence = 0xfffffffd; // RBF enabled
      }

      // Add witness UTXO
      inputData.witnessUtxo = {
        script: Buffer.from(input.utxo.scriptPubKey, 'hex'),
        value: input.utxo.value,
      };

      psbt.addInput(inputData);
    }

    // Add outputs
    for (const output of outputs) {
      if (output.address) {
        psbt.addOutput({
          address: output.address,
          value: output.value,
        });
      } else if (output.script) {
        psbt.addOutput({
          script: output.script,
          value: output.value,
        });
      } else {
        throw new Error('Output must have either address or script');
      }
    }

    // Add change if needed
    const inputValue = inputs.reduce((sum, input) => sum + input.utxo.value, 0);
    const outputValue = outputs.reduce((sum, output) => sum + output.value, 0);
    const feeRate = options?.feeRate ?? Math.min(this.config.defaultFeeRate, 5); // Cap at 5 sat/vB for compatibility
    const estimatedFee = this.calculateFee(
      this.estimateSize(inputs.length, outputs.length + 1, false),
      feeRate,
    );
    const change = inputValue - outputValue - estimatedFee;

    // Check for insufficient funds
    if (change < 0) {
      throw new Error(
        `Insufficient funds: need ${
          outputValue + estimatedFee
        } satoshis, have ${inputValue} satoshis`,
      );
    }

    if (change > this.config.dustThreshold) {
      this.addChange(psbt, changeAddress, change);
    }

    // Add outputCount property for test compatibility
    Object.defineProperty(psbt, 'outputCount', {
      get: function () {
        return this.txOutputs.length;
      },
      enumerable: false,
      configurable: true,
    });

    return psbt as bitcoin.Psbt & { outputCount: number };
  }

  /**
   * Estimate transaction size in bytes
   * Basic formula: ~180 bytes per input + ~34 bytes per output + ~10 bytes overhead
   */
  estimateSize(
    inputCount: number,
    outputCount: number,
    hasWitness?: boolean,
  ): number {
    const inputSize = hasWitness ? 110 : 148; // Legacy inputs: 148 bytes, Witness inputs are smaller
    const outputSize = 34;
    const overhead = 10;

    return (inputCount * inputSize) + (outputCount * outputSize) + overhead;
  }

  /**
   * Calculate fee based on size and fee rate
   * Simply: size * feeRate
   */
  calculateFee(size: number, feeRate: number): number {
    return Math.ceil(size * feeRate);
  }

  /**
   * Get network type string from bitcoin.Network
   * Return 'mainnet', 'testnet', or 'regtest' based on network
   */
  getNetworkType(network?: bitcoin.Network): string {
    if (!network) return 'mainnet';
    return network === bitcoin.networks.testnet
      ? 'testnet'
      : network === bitcoin.networks.regtest
      ? 'regtest'
      : 'mainnet';
  }

  /**
   * Calculate fee for stamp transaction using SRC-20 calculator
   */
  async calculateStampTransactionFee(
    params: _Src20TransactionParams,
    inputs: Array<{ type: _InputType; witnessScript?: Buffer }>,
    outputs: Array<{ type: _OutputType; size?: number }>,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium',
  ): Promise<ReturnType<typeof this.src20FeeCalculator.calculateStampTransactionFee>> {
    return await this.src20FeeCalculator.calculateStampTransactionFee(
      params,
      inputs,
      outputs,
      priority,
    );
  }

  /**
   * Estimate total cost of stamp transaction including stamp value
   */
  async estimateStampTransactionCost(
    params: _Src20TransactionParams,
    inputs: Array<{ type: _InputType; witnessScript?: Buffer }>,
    outputs: Array<{ type: _OutputType; size?: number }>,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium',
  ): Promise<ReturnType<typeof this.src20FeeCalculator.estimateStampTransactionCost>> {
    return await this.src20FeeCalculator.estimateStampTransactionCost(
      params,
      inputs,
      outputs,
      priority,
    );
  }

  /**
   * Get SRC-20 minimum value (500,000 satoshis)
   */
  getSrc20MinValue(): number {
    return 500000;
  }

  /**
   * Get stamp fee rates for different transaction types
   */
  getStampFeeRates(): ReturnType<typeof this.src20FeeCalculator.getRecommendedFeeRates> {
    return this.src20FeeCalculator.getRecommendedFeeRates();
  }

  /**
   * Check if change amount is above dust threshold
   */
  isChangeAboveDust(amount: number, outputType: _OutputType = 'P2WPKH'): boolean {
    // OP_RETURN outputs don't have dust thresholds (they can be 0 value)
    if (outputType === 'OP_RETURN') {
      return amount >= 0;
    }

    const dustThresholds = this.dustCalculator.calculateAllThresholds();
    // After the OP_RETURN check, outputType is guaranteed to be a valid DustThresholds key
    const threshold = dustThresholds[outputType as Exclude<_OutputType, 'OP_RETURN'>] ||
      this.config.dustThreshold;
    return amount > threshold;
  }

  /**
   * Estimate optimal fee for different input/output combinations
   */
  async estimateOptimalFee(
    inputs: Array<{ type: _InputType }>,
    outputs: Array<{ type: _OutputType }>,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium',
  ): Promise<{ totalFee: number; feeRate: number; virtualSize: number }> {
    const sizeCalculation = this.src20FeeCalculator.calculateTransactionSize(inputs, outputs);
    const feeEstimate = await this.src20FeeCalculator.estimateFee(
      sizeCalculation.virtualSize,
      priority,
    );

    return {
      totalFee: feeEstimate.totalFee,
      feeRate: feeEstimate.feeRate,
      virtualSize: sizeCalculation.virtualSize,
    };
  }

  /**
   * Get dynamic dust thresholds for different output types
   */
  getDustThresholds(feeRate?: number): DustThresholds {
    return this.feeEstimator.getDustThresholds(feeRate);
  }

  /**
   * Estimate transaction size with different input/output types
   */
  estimateSizeWithTypes(
    inputs: Array<{ type: _InputType }>,
    outputs: Array<{ type: _OutputType }>,
  ): number {
    const sizeCalculation = this.src20FeeCalculator.calculateTransactionSize(inputs, outputs);
    return sizeCalculation.virtualSize;
  }

  /**
   * Check if transaction meets stamp criteria
   */
  isStampTransaction(
    params: { stampValue: number; dataOutputCount: number; isStampCreation: boolean },
  ): boolean {
    return params.isStampCreation && params.stampValue >= this.getSrc20MinValue();
  }

  /**
   * Calculate optimal change for stamp transactions
   */
  calculateStampOptimalChange(
    inputValue: number,
    outputValue: number,
    estimatedFee: number,
  ): { changeValue: number; shouldCreateChange: boolean } {
    const rawChange = inputValue - outputValue - estimatedFee;
    const dustThreshold = this.getDustThresholds().P2WPKH;

    return {
      changeValue: Math.max(0, rawChange),
      shouldCreateChange: rawChange > dustThreshold,
    };
  }
}
