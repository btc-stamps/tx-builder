/**
 * Bitcoin Stamp Builder
 *
 * Implements Bitcoin Stamp transaction construction with proper UTXO management,
 * P2WSH encoding, and Counterparty protocol integration. Provides a high-level
 * builder interface similar to SRC20TokenBuilder for consistent developer experience.
 */

import { Buffer } from 'node:buffer';

import * as bitcoin from 'bitcoinjs-lib';

import { TransactionBuilder } from '../core/transaction-builder.ts';
import {
  type BitcoinStampEncodingOptions,
  BitcoinStampsEncoder,
} from '../encoders/bitcoin-stamps-encoder.ts';
import type { UTXO } from '../interfaces/provider.interface.ts';
import type { SelectionOptions, SelectorFactory } from '../interfaces/selector.interface.ts';
import {
  type EnhancedSelectionResult,
  isSelectionSuccess as _isSelectionSuccess,
  SelectionFailureReason,
} from '../interfaces/selector-result.interface.ts';
import type { TransactionOutput } from '../interfaces/transaction.interface.ts';
import { ConsoleLogger, Logger } from '../utils/logger.ts';
import { createAdvancedFeeCalculator } from '../calculators/advanced-fee-calculator.ts';
import type { AdvancedFeeCalculator } from '../calculators/advanced-fee-calculator.ts';

/**
 * Bitcoin Stamp Transaction Builder Configuration
 */
export interface BitcoinStampBuilderConfig {
  network: bitcoin.networks.Network;
  feeRate: number;
  dustThreshold: number;
  maxInputs: number;
  enableRBF: boolean;
  enableCPFP?: boolean;
  utxoProvider: any;
  selectorFactory: SelectorFactory;
  assetValidationService?: any; // IAssetValidationService for CPID validation/generation
  logger?: Logger;
}

/**
 * Bitcoin Stamp Build Data
 */
export interface BitcoinStampBuildData {
  data: Buffer;
  fromAddress: string;
  encoding?: 'gzip' | 'brotli' | 'base64';
  cpid?: string; // CPID (Counterparty ID) for the stamp
  supply?: number;
  isLocked?: boolean;
  filename?: string;
  title?: string;
  description?: string;
  creator?: string;
}

/**
 * Simple issuance data (no image/file data)
 */
export interface BitcoinStampIssuanceData {
  sourceAddress: string;
  cpid: string;
  quantity: number;
  divisible?: boolean;
  lock?: boolean;
  description?: string;
  imageData?: string; // Optional image data for testing
}

/**
 * Bitcoin Stamp Builder
 * Provides builder pattern interface for constructing Bitcoin Stamp transactions
 */
export class BitcoinStampBuilder extends TransactionBuilder {
  public readonly network: bitcoin.networks.Network;
  public readonly dustThreshold: number;
  public readonly feeRate: number;
  public readonly maxInputs: number;
  public readonly enableRBF: boolean;
  public readonly enableCPFP: boolean;

  private readonly encoder: BitcoinStampsEncoder;
  private readonly selectorFactory: SelectorFactory;
  private readonly feeCalculator: AdvancedFeeCalculator;
  private readonly assetValidationService?: any; // IAssetValidationService
  private readonly utxoProvider: any; // IUTXOProvider
  private readonly logger: Logger;

  constructor(config: BitcoinStampBuilderConfig) {
    super({
      network: config.network,
      defaultRbf: config.enableRBF,
    });

    this.network = config.network;
    this.dustThreshold = config.dustThreshold;
    this.feeRate = config.feeRate;
    this.maxInputs = config.maxInputs;
    this.enableRBF = config.enableRBF;
    this.enableCPFP = config.enableCPFP || false;

    this.encoder = new BitcoinStampsEncoder();
    this.selectorFactory = config.selectorFactory;
    this.feeCalculator = createAdvancedFeeCalculator();
    this.assetValidationService = config.assetValidationService;
    this.utxoProvider = config.utxoProvider; // Store utxoProvider
    this.logger = config.logger || new ConsoleLogger();

    this.logger.debug?.('BitcoinStampBuilder initialized', {
      network: config.network.bech32,
      feeRate: this.feeRate,
      dustThreshold: this.dustThreshold,
      maxInputs: this.maxInputs,
      enableRBF: this.enableRBF,
      enableCPFP: this.enableCPFP,
    });
  }

  /**
   * Build a Bitcoin Stamp transaction
   */
  async buildStampTransaction(buildData: BitcoinStampBuildData): Promise<bitcoin.Transaction> {
    this.logger.debug?.('Building Bitcoin Stamp transaction', {
      dataSize: buildData.data.length,
      fromAddress: buildData.fromAddress,
      encoding: buildData.encoding,
    });

    try {
      // Validate build data
      this.validateBuildData(buildData);

      // Validate description length for OP_RETURN constraints
      this.validateDescriptionLength(buildData.description || '');

      // Get funding UTXOs
      const utxos = await this.getUTXOs(buildData.fromAddress);

      // Validate or generate CPID
      let cpid = buildData.cpid;
      if (this.assetValidationService) {
        if (cpid) {
          // Validate the provided CPID using validateAndPrepareAssetName
          // This will throw if invalid or unavailable
          cpid = await this.assetValidationService.validateAndPrepareAssetName(cpid);
          this.logger.debug?.(`CPID validated: ${cpid}`);
        } else {
          // Generate a new CPID if not provided
          cpid = await this.assetValidationService.generateAvailableAssetName();
          this.logger.debug?.(`Generated new CPID: ${cpid}`);
        }
      } else if (!cpid) {
        // If no validation service and no CPID provided, generate a simple one
        cpid = `A${Date.now()}${Math.floor(Math.random() * 1000000)}`;
        this.logger.debug?.(`Generated fallback CPID: ${cpid}`);
      }

      // Create stamp data for encoder
      const stampData = {
        imageData: buildData.data,
        filename: buildData.filename,
        title: buildData.title,
        description: buildData.description,
        creator: buildData.creator,
      };

      // Create encoding options
      // The encoder needs UTXOs for RC4 key generation, so we pass the first UTXO
      const encodingOptions: BitcoinStampEncodingOptions = {
        cpid: cpid, // Pass validated/generated CPID to the encoder
        supply: buildData.supply || 1,
        isLocked: buildData.isLocked !== false, // Default to true
        utxos: utxos.slice(0, 1).map((u) => ({ // Pass first UTXO for RC4 key
          txid: u.txid,
          vout: u.vout,
          value: u.value,
        })),
      };

      // Encode the stamp data
      const encodingResult = await this.encoder.encode(stampData, encodingOptions);
      if (!encodingResult) {
        throw new Error('Failed to encode Bitcoin Stamp data');
      }

      // CRITICAL: Use ALL outputs from encoder (OP_RETURN + P2WSH)
      // The encoder returns both the Counterparty OP_RETURN and the fake P2WSH outputs
      if (!encodingResult.outputs || encodingResult.outputs.length === 0) {
        throw new Error('Failed to create stamp outputs');
      }

      // Use the encoder's outputs directly - they are already properly formatted
      const outputs: TransactionOutput[] = encodingResult.outputs.map((output) => ({
        script: output.script,
        value: output.value,
      }));

      // Calculate total output value
      const totalOutputValue = outputs.reduce((sum, output) => sum + output.value, 0);

      // Estimate fee
      const estimatedSize = this.estimateTransactionSize(utxos.length, outputs.length + 1); // +1 for change
      const estimatedFee = Math.ceil(estimatedSize * this.feeRate); // Simple fee calculation: size * rate

      const targetValue = totalOutputValue + estimatedFee;

      // Select UTXOs
      const selectionResult = this.selectUTXOs(
        utxos,
        targetValue,
        this.feeRate,
        this.dustThreshold,
      );

      if (!selectionResult.success) {
        throw new Error(`UTXO selection failed: ${selectionResult.message}`);
      }

      // Add change output if necessary
      // IMPORTANT: Change goes to an address, not a script
      if (selectionResult.change > this.dustThreshold) {
        const changeScript = bitcoin.address.toOutputScript(buildData.fromAddress, this.network);
        outputs.push({
          script: changeScript,
          value: selectionResult.change,
        });
      }

      this.logger.debug?.('Building transaction with selected UTXOs', {
        inputCount: selectionResult.inputs.length,
        outputCount: outputs.length,
        totalValue: selectionResult.totalValue,
        fee: selectionResult.fee,
        change: selectionResult.change,
      });

      // Build the transaction
      const transaction = new bitcoin.Transaction();
      transaction.version = 2;

      // Add inputs
      selectionResult.inputs.forEach((input: UTXO) => {
        transaction.addInput(
          Buffer.from(input.txid, 'hex').reverse(),
          input.vout,
        );
      });

      // Add outputs - all should have scripts at this point
      outputs.forEach((output) => {
        if (output.script) {
          transaction.addOutput(output.script, output.value);
        } else {
          throw new Error('Output missing script');
        }
      });

      this.logger.debug?.('Bitcoin Stamp transaction built successfully', {
        txid: transaction.getId(),
        size: transaction.virtualSize(),
        fee: selectionResult.fee,
      });

      return transaction;
    } catch (error) {
      this.logger.error?.(
        'Failed to build Bitcoin Stamp transaction:',
        error as Record<string, unknown>,
      );
      throw error;
    }
  }

  /**
   * Build a simple issuance transaction (for testing or simple asset creation)
   */
  async buildIssuance(issuanceData: BitcoinStampIssuanceData): Promise<bitcoin.Transaction> {
    this.logger.debug?.(
      'Building Bitcoin Stamp issuance transaction',
      issuanceData as unknown as Record<string, unknown>,
    );

    // Validate description length for OP_RETURN constraints
    this.validateDescriptionLength(issuanceData.description || '');

    try {
      // Get funding UTXOs
      const utxos = await this.getUTXOs(issuanceData.sourceAddress);

      // Convert to CounterpartyEncoder format
      const encoder = new (await import('../encoders/counterparty-encoder.ts'))
        .CounterpartyEncoder();
      const assetIdNum = BigInt(issuanceData.cpid.slice(1)); // Remove 'A' prefix

      // Encode the issuance message
      const encodingResult = encoder.encodeIssuance({
        assetId: assetIdNum,
        quantity: issuanceData.quantity,
        divisible: issuanceData.divisible || false,
        lock: issuanceData.lock || false,
        description: issuanceData.description || '',
      });

      if (!encodingResult) {
        throw new Error('Failed to encode issuance data');
      }

      // Create OP_RETURN output
      const opReturnData = Buffer.concat([
        Buffer.from('CNTRPRTY', 'utf8'), // Add prefix
        encodingResult.data,
      ]);

      const opReturnScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_RETURN ?? 0x6a,
        opReturnData,
      ]);

      const outputs: TransactionOutput[] = [
        {
          script: opReturnScript,
          value: 0,
        },
      ];

      // Add optional image data as P2WSH outputs (for testing compatibility)
      if (issuanceData.imageData) {
        const imageBuffer = Buffer.from(issuanceData.imageData, 'utf8');
        const p2wshScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_1 ?? 0x51,
          imageBuffer.slice(0, Math.min(imageBuffer.length, 32)), // Limit to 32 bytes
        ]);

        outputs.push({
          script: p2wshScript,
          value: this.dustThreshold,
        });
      }

      // Calculate total output value
      const totalOutputValue = outputs.reduce((sum, output) => sum + output.value, 0);

      // Estimate fee
      const estimatedSize = this.estimateTransactionSize(utxos.length, outputs.length + 1);
      const estimatedFee = Math.ceil(estimatedSize * this.feeRate);
      const targetValue = totalOutputValue + estimatedFee;

      // Select UTXOs
      const selectionResult = this.selectUTXOs(
        utxos,
        targetValue,
        this.feeRate,
        this.dustThreshold,
      );

      if (!selectionResult.success) {
        throw new Error(`UTXO selection failed: ${selectionResult.message}`);
      }

      // Add change output if necessary
      if (selectionResult.change > this.dustThreshold) {
        const changeScript = bitcoin.address.toOutputScript(
          issuanceData.sourceAddress,
          this.network,
        );
        outputs.push({
          script: changeScript,
          value: selectionResult.change,
        });
      }

      // Build the transaction
      const transaction = this.buildRawTransaction(selectionResult.inputs, outputs);

      this.logger.debug?.('Bitcoin Stamp issuance transaction built successfully', {
        txid: transaction.getId(),
        size: transaction.virtualSize(),
        fee: selectionResult.fee,
      });

      return transaction;
    } catch (error) {
      this.logger.error?.(
        'Failed to build Bitcoin Stamp issuance transaction:',
        error as Record<string, unknown>,
      );
      throw error;
    }
  }

  /**
   * Validate description length to prevent OP_RETURN overflow
   */
  private validateDescriptionLength(description: string): void {
    if (!description) return;

    // Calculate the space used by other fields in OP_RETURN
    // Structure: CNTRPRTY(8) + Type(1) + AssetID(8) + Quantity(8) + Flags(1) = 26 bytes
    const fixedFieldsSize = 26;

    // Standard OP_RETURN limit is 80 bytes total
    const maxOpReturnSize = 80;
    const maxDescriptionSize = maxOpReturnSize - fixedFieldsSize;

    const descriptionBytes = Buffer.from(description, 'utf8').length;

    if (descriptionBytes > maxDescriptionSize) {
      throw new Error(
        `Description too long: ${descriptionBytes} bytes exceeds maximum ${maxDescriptionSize} bytes. ` +
          `Please shorten the filename or description content. ` +
          `Current: "${description.substring(0, 50)}${description.length > 50 ? '...' : ''}"`,
      );
    }

    // Additional validation for STAMP: format
    if (description.startsWith('STAMP:')) {
      const filename = description.substring(6); // Remove 'STAMP:' prefix
      if (filename.length === 0) {
        throw new Error('STAMP: format requires a filename after the colon');
      }

      // Warn if filename is unusually long
      if (filename.length > 40) {
        this.logger.warn?.(
          `Long filename detected: "${filename}" (${filename.length} chars). Consider using a shorter name.`,
        );
      }
    }
  }

  /**
   * Build a raw transaction from inputs and outputs
   */
  private buildRawTransaction(inputs: UTXO[], outputs: TransactionOutput[]): bitcoin.Transaction {
    const transaction = new bitcoin.Transaction();
    transaction.version = 2;

    // Add inputs
    inputs.forEach((input) => {
      transaction.addInput(
        Buffer.from(input.txid, 'hex').reverse(),
        input.vout,
      );
    });

    // Add outputs
    outputs.forEach((output) => {
      if (output.script) {
        transaction.addOutput(output.script, output.value);
      } else {
        throw new Error('Output missing script');
      }
    });

    return transaction;
  }

  /**
   * Validate build data
   */
  private validateBuildData(buildData: BitcoinStampBuildData): void {
    if (!buildData.data || buildData.data.length === 0) {
      throw new Error('Stamp data is required');
    }

    if (!buildData.fromAddress || buildData.fromAddress.length === 0) {
      throw new Error('From address is required');
    }

    // Validate data size limits (Bitcoin Stamps typically have size constraints)
    if (buildData.data.length > 500000) {
      // 500KB limit as example
      throw new Error('Stamp data exceeds maximum size limit');
    }
  }

  /**
   * Get UTXOs for an address
   */
  private async getUTXOs(address: string): Promise<UTXO[]> {
    this.logger.debug?.(`Fetching UTXOs for address: ${address}`);

    const utxos = await this.utxoProvider.getUTXOs(address);

    if (!utxos || utxos.length === 0) {
      throw new Error(`No UTXOs found for address: ${address}`);
    }

    this.logger.debug?.(`Found ${utxos.length} UTXOs for address: ${address}`, {
      totalValue: utxos.reduce((sum: number, utxo: UTXO) => sum + utxo.value, 0),
      utxoCount: utxos.length,
    });

    return utxos;
  }

  /**
   * Select UTXOs for a transaction using the configured selector
   */
  protected selectUTXOs(
    utxos: UTXO[],
    targetValue: number,
    feeRate: number,
    dustThreshold: number,
    algorithm: 'accumulative' | 'branch-and-bound' | 'blackjack' | 'knapsack' = 'accumulative',
  ): EnhancedSelectionResult {
    const selector = this.selectorFactory.create(algorithm);

    const selectionOptions: SelectionOptions = {
      targetValue,
      feeRate,
      dustThreshold,
      maxInputs: 100, // Higher limit for stamp transactions due to data size
      consolidate: false,
    };

    const result: EnhancedSelectionResult = selector.select(utxos, selectionOptions);

    // Return structured result instead of null
    if ('success' in result) {
      if (result.success) {
        return {
          success: true,
          inputs: result.inputs,
          totalValue: result.totalValue,
          change: result.change,
          fee: result.fee,
          wasteMetric: result.wasteMetric,
          inputCount: result.inputCount,
          outputCount: result.outputCount,
          estimatedVSize: result.estimatedVSize,
          effectiveFeeRate: result.effectiveFeeRate,
        };
      } else {
        // Selection failed - return structured error instead of null
        this.logger.debug?.(`Selection failed: ${result.message}`);
        return {
          success: false,
          reason: result.reason || SelectionFailureReason.SELECTION_FAILED,
          message: result.message || 'UTXO selection failed',
          details: result.details || { targetValue, feeRate, dustThreshold },
        };
      }
    }

    // Legacy format handling (shouldn't happen with updated selectors)
    const legacyResult = result as any;
    if (legacyResult && legacyResult.inputs) {
      return {
        success: true,
        inputs: legacyResult.inputs,
        totalValue: legacyResult.totalValue,
        change: legacyResult.change,
        fee: legacyResult.fee,
        wasteMetric: legacyResult.wasteMetric || 0,
        inputCount: legacyResult.inputCount || legacyResult.inputs.length,
        outputCount: legacyResult.outputCount || 2,
        estimatedVSize: legacyResult.estimatedVSize || 0,
        effectiveFeeRate: legacyResult.effectiveFeeRate || feeRate,
      };
    }

    // No valid result found - return structured error
    return {
      success: false,
      reason: SelectionFailureReason.SELECTION_FAILED,
      message: 'Unknown selection result format',
      details: { targetValue, feeRate, dustThreshold },
    };
  }

  /**
   * Estimate transaction size for fee calculation
   */
  protected estimateTransactionSize(numInputs: number, numOutputs: number): number {
    // Base transaction overhead
    const baseSize = 10;

    // Input size (assuming P2WPKH inputs)
    const inputSize = 68; // Witness input size

    // Output size
    const outputSize = 34; // Standard P2WPKH output

    // Add sizes
    const totalSize = baseSize + (numInputs * inputSize) + (numOutputs * outputSize);

    // Add 10% buffer for safety
    return Math.ceil(totalSize * 1.1);
  }
}
