/**
 * P2WSH Data Encoder
 *
 * Implements P2WSH-based data embedding for Bitcoin data storage.
 * Supports both SRC-20 tokens and Bitcoin Stamps data embedding using direct binary data handling.
 *
 * Key Features:
 * - Direct binary data handling without base64 encoding for blockchain storage
 * - P2WSH (Pay-to-Witness-Script-Hash) script construction following BIP-141
 * - Intelligent data chunking for large binary payloads
 * - Script size validation (10,000 byte script limit, 520 byte push data limit)
 * - Witness script template: OP_FALSE OP_IF <raw_binary_chunk> OP_ENDIF
 */

import { Buffer } from 'node:buffer';

import * as bitcoin from 'bitcoinjs-lib';

import type {
  EncodingOptions as _EncodingOptions,
  EncodingResult as _EncodingResult,
  IDataEncoder,
  TransactionOutput,
} from '../interfaces/encoders/base.interface.ts';

import type {
  P2WSHData,
  P2WSHEncodingOptions,
  P2WSHEncodingResult,
} from '../interfaces/encoders/p2wsh.interface.ts';

// Re-export for backward compatibility
export type { P2WSHData, P2WSHEncodingOptions, P2WSHEncodingResult };

// Local interface for chunk results
export interface P2WSHChunkResult {
  chunks: Buffer[];
  totalSize: number;
  chunkCount: number;
}

/**
 * Binary Data Utilities for P2WSH encoding
 */
export class BinaryDataUtils {
  // Bitcoin Script limits
  static readonly MAX_SCRIPT_SIZE = 10000; // Bitcoin's maximum script size
  static readonly MAX_PUSH_DATA_SIZE = 520; // Maximum data that can be pushed in one operation
  static readonly WITNESS_SCRIPT_OVERHEAD = 6; // OP_FALSE OP_IF ... OP_ENDIF overhead

  // P2WSH specific limits
  static readonly MAX_CHUNK_SIZE = 519; // MAX_PUSH_DATA_SIZE - 1, leave room for op codes
  static readonly DEFAULT_DUST_VALUE = 546; // Minimum UTXO value in satoshis

  /**
   * Validate if binary data can be encoded within Bitcoin's limits
   */
  static validateBinaryData(data: Buffer): void {
    if (!Buffer.isBuffer(data)) {
      throw new Error('Data must be a Buffer');
    }

    if (data.length === 0) {
      throw new Error('Data cannot be empty');
    }

    // Calculate maximum data size based on script limits
    const maxDataPerScript = this.MAX_SCRIPT_SIZE -
      this.WITNESS_SCRIPT_OVERHEAD;
    const maxTotalData = maxDataPerScript * 100; // Reasonable limit for multiple outputs

    if (data.length > maxTotalData) {
      throw new Error(
        `Data too large: ${data.length} bytes > ${maxTotalData} bytes maximum`,
      );
    }
  }

  /**
   * Chunk binary data into sizes suitable for Bitcoin script embedding
   */
  static chunkBinaryData(
    data: Buffer,
    chunkSize = this.MAX_CHUNK_SIZE,
  ): P2WSHChunkResult {
    this.validateBinaryData(data);

    const chunks: Buffer[] = [];
    let offset = 0;

    while (offset < data.length) {
      const remainingBytes = data.length - offset;
      const currentChunkSize = Math.min(chunkSize, remainingBytes);

      chunks.push(data.subarray(offset, offset + currentChunkSize));
      offset += currentChunkSize;
    }

    return {
      chunks,
      totalSize: data.length,
      chunkCount: chunks.length,
    };
  }

  /**
   * Reconstruct original data from chunks
   */
  static reconstructFromChunks(chunks: Buffer[]): Buffer {
    if (chunks.length === 0) {
      throw new Error('No chunks provided for reconstruction');
    }

    return Buffer.concat(chunks);
  }

  /**
   * Calculate the total transaction size for given data
   */
  static estimateTransactionSize(
    dataSize: number,
    outputCount: number,
  ): number {
    const baseTransactionSize = 10; // Version, locktime, input/output counts
    const inputSize = 148; // P2WPKH input size including witness
    const outputOverhead = 8; // Value (8 bytes)
    const scriptSizeOverhead = 1; // Script size varint
    const averageScriptSize = 34; // P2WSH output script is 34 bytes
    const witnessOverhead = Math.ceil(dataSize / 32) * 40; // Witness script overhead per chunk

    // More comprehensive estimation including witness data
    return (
      baseTransactionSize +
      inputSize +
      (outputOverhead + scriptSizeOverhead + averageScriptSize) * outputCount +
      witnessOverhead
    );
  }

  /**
   * Validate chunk integrity
   */
  static validateChunks(originalData: Buffer, chunks: Buffer[]): boolean {
    const reconstructed = this.reconstructFromChunks(chunks);
    return originalData.equals(reconstructed);
  }
}

/**
 * P2WSH Script Constructor for Data Embedding
 */
export class P2WSHScriptConstructor {
  private network: bitcoin.Network;

  constructor(network: bitcoin.Network = bitcoin.networks.bitcoin) {
    this.network = network;
  }

  /**
   * Create a witness script for embedding binary data
   * Pattern: OP_FALSE OP_IF <data_chunk> OP_ENDIF
   */
  createWitnessScript(dataChunk: Buffer): Buffer {
    if (dataChunk.length > BinaryDataUtils.MAX_PUSH_DATA_SIZE) {
      throw new Error(
        `Data chunk too large: ${dataChunk.length} > ${BinaryDataUtils.MAX_PUSH_DATA_SIZE}`,
      );
    }

    // Use typed array for compilation
    const witnessScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_FALSE as bitcoin.StackElement,
      bitcoin.opcodes.OP_IF as bitcoin.StackElement,
      dataChunk as bitcoin.StackElement,
      bitcoin.opcodes.OP_ENDIF as bitcoin.StackElement,
    ]);

    // Validate script size
    if (witnessScript.length > BinaryDataUtils.MAX_SCRIPT_SIZE) {
      throw new Error(
        `Witness script too large: ${witnessScript.length} > ${BinaryDataUtils.MAX_SCRIPT_SIZE}`,
      );
    }

    return witnessScript;
  }

  /**
   * Create P2WSH output script from witness script
   */
  createP2WSHOutput(
    witnessScript: Buffer,
    value = BinaryDataUtils.DEFAULT_DUST_VALUE,
  ): TransactionOutput {
    // Generate witness script hash
    const witnessScriptHash = bitcoin.crypto.sha256(witnessScript);

    // Create P2WSH script: OP_0 <32-byte-hash>
    const p2wshScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_0 ?? 0,
      witnessScriptHash,
    ]);

    return {
      script: p2wshScript,
      value: value,
    };
  }

  /**
   * Extract data from witness script
   */
  extractDataFromWitnessScript(witnessScript: Buffer): Buffer {
    const decompiled = bitcoin.script.decompile(witnessScript) ?? [];

    if (decompiled.length !== 4) {
      throw new Error('Invalid witness script format');
    }

    const [op0, opIf, dataChunk, opEndIf] = decompiled;

    if (
      op0 !== bitcoin.opcodes.OP_FALSE ||
      opIf !== bitcoin.opcodes.OP_IF ||
      opEndIf !== bitcoin.opcodes.OP_ENDIF
    ) {
      throw new Error('Invalid witness script pattern');
    }

    if (!Buffer.isBuffer(dataChunk)) {
      throw new Error('Invalid data chunk in witness script');
    }

    return dataChunk;
  }

  /**
   * Validate P2WSH output script
   */
  validateP2WSHOutput(outputScript: Buffer): boolean {
    const decompiled = bitcoin.script.decompile(outputScript);

    if (!decompiled || decompiled.length !== 2) {
      return false;
    }

    if (decompiled[0] !== bitcoin.opcodes.OP_0) {
      return false;
    }

    const hash = decompiled[1];
    return Buffer.isBuffer(hash) && hash.length === 32;
  }
}

/**
 * Main P2WSH Data Encoder implementation
 */
export class P2WSHEncoder implements IDataEncoder<P2WSHData, P2WSHEncodingOptions> {
  private scriptConstructor: P2WSHScriptConstructor;
  private readonly defaultDustValue: number;

  constructor(
    network: bitcoin.Network = bitcoin.networks.bitcoin,
    dustValue = BinaryDataUtils.DEFAULT_DUST_VALUE,
  ) {
    this.scriptConstructor = new P2WSHScriptConstructor(network);
    this.defaultDustValue = dustValue;
  }

  /**
   * Encode binary data using P2WSH standard
   */
  encode(
    data: P2WSHData,
    options?: P2WSHEncodingOptions,
    customTemplate?: any,
  ): P2WSHEncodingResult {
    this.validate(data);

    const dustValue = options?.dustValue ?? this.defaultDustValue;
    const maxOutputs = options?.maxOutputs ?? 100;

    // Chunk the binary data
    const chunkResult = BinaryDataUtils.chunkBinaryData(data.data);

    if (chunkResult.chunkCount > maxOutputs) {
      throw new Error(
        `Too many chunks required: ${chunkResult.chunkCount} > ${maxOutputs} maximum outputs`,
      );
    }

    const outputs: TransactionOutput[] = [];
    let totalScriptSize = 0;

    // Create P2WSH output for each chunk
    for (const chunk of chunkResult.chunks) {
      const witnessScript = this.scriptConstructor.createWitnessScript(chunk);
      const output = this.scriptConstructor.createP2WSHOutput(
        witnessScript,
        dustValue,
      );

      outputs.push(output);
      totalScriptSize += witnessScript.length;
    }

    const estimatedSize = BinaryDataUtils.estimateTransactionSize(
      data.data.length,
      outputs.length,
    );

    // Create a witness script and script hash for the first chunk
    const firstChunk = data.data.slice(0, 32);
    const paddedFirstChunk = Buffer.concat([
      firstChunk,
      Buffer.alloc(32 - firstChunk.length, 0),
    ]);

    const witnessScript = this.scriptConstructor.createWitnessScript(paddedFirstChunk);
    const scriptHash = bitcoin.crypto.sha256(witnessScript);

    const result: P2WSHEncodingResult = {
      script: outputs[0]?.script || Buffer.alloc(0),
      outputs,
      estimatedSize,
      dataSize: data.data.length,
      witnessScript,
      scriptHash,
      redeemScript: witnessScript, // Alias for compatibility
      requiresSignature: customTemplate?.requireSignature,
      timelock: customTemplate?.timelock,
      isMultisig: customTemplate?.m && customTemplate?.n,
      requiredSignatures: customTemplate?.m,
    };
    return result;
  }

  /**
   * Decode binary data from P2WSH outputs
   */
  decode(outputs: TransactionOutput[]): P2WSHData {
    for (const output of outputs) {
      if (!this.scriptConstructor.validateP2WSHOutput(output.script)) {
        continue; // Skip non-P2WSH outputs
      }

      // For decoding, we would need the witness script, which is not available
      // from just the output script. This would typically be provided separately
      // or extracted from the transaction's witness data.
      // For now, we'll throw an error indicating this limitation.
    }

    throw new Error(
      'Decoding from P2WSH outputs requires witness scripts from transaction data',
    );
  }

  /**
   * Decode from witness scripts (when available)
   */
  decodeFromWitnessScripts(witnessScripts: Buffer[]): P2WSHData {
    const dataChunks: Buffer[] = [];

    for (const witnessScript of witnessScripts) {
      try {
        const chunk = this.scriptConstructor.extractDataFromWitnessScript(
          witnessScript,
        );
        dataChunks.push(chunk);
      } catch (error) {
        // Skip invalid witness scripts
        console.warn('Skipping invalid witness script:', error);
      }
    }

    if (dataChunks.length === 0) {
      throw new Error('No valid data chunks found in witness scripts');
    }

    const reconstructedData = BinaryDataUtils.reconstructFromChunks(dataChunks);

    return {
      data: reconstructedData,
      protocol: 'P2WSH',
    };
  }

  /**
   * Validate P2WSH data
   */
  validate(data: P2WSHData): boolean {
    if (!data || typeof data !== 'object') {
      throw new Error('P2WSH data must be an object');
    }

    if (!Buffer.isBuffer(data.data)) {
      throw new Error('P2WSH data.data must be a Buffer');
    }

    BinaryDataUtils.validateBinaryData(data.data);

    return true;
  }

  /**
   * Get maximum data size that can be encoded
   */
  getMaxDataSize(): number {
    // Conservative estimate: 100 outputs * 519 bytes per chunk
    return 100 * BinaryDataUtils.MAX_CHUNK_SIZE;
  }

  /**
   * Get encoder type
   */
  getType(): string {
    return 'P2WSH';
  }
}
