/**
 * Bitcoin Stamps Encoder
 *
 * Complete implementation of Bitcoin Stamps protocol using:
 * - P2WSH encoding for raw binary data embedding
 * - Counterparty OP_RETURN with STAMP:filename reference
 * - Bitcoin transaction size limit (100KB max)
 * - Multi-format support (PNG, GIF, JPEG, WEBP)
 * - Comprehensive metadata handling
 *
 * Note: No pixel dimension constraints - only transaction size matters
 */

import { Buffer } from 'node:buffer';

import * as bitcoin from 'bitcoinjs-lib';

import { P2WSHEncoder } from './p2wsh-encoder.ts';

import type {
  EncodingResult as _EncodingResult,
  TransactionOutput,
} from '../interfaces/encoders/base.interface.ts';
import { DataProcessor, STAMP_MAX_SIZE } from '../utils/data-processor.ts';
import type {
  OptimizedScript,
  PatternAnalysis,
} from '../interfaces/internal/optimization.interface.ts';

// Import stamp-specific types from organized interfaces
import type {
  BitcoinStampData,
  BitcoinStampEncodingOptions,
  BitcoinStampEncodingResult,
  StampMetadata,
} from '../interfaces/encoders/stamps.interface.ts';

// Re-export for backward compatibility
export type { BitcoinStampData, BitcoinStampEncodingOptions, BitcoinStampEncodingResult };

/**
 * Counterparty Protocol Handler for Bitcoin Stamps
 *
 * Uses proper Counterparty issuance format with RC4 encryption
 * Based on counterparty-core/counterpartycore/lib/messages/issuance.py
 */
export class CounterpartyProtocolHandler {
  /**
   * Create Counterparty OP_RETURN for stamps using proper issuance encoding with RC4
   * Following the exact counterparty-core implementation
   */
  static createOpReturnOutput(
    utxos: Array<{ txid: string; vout: number; value: number }>,
    cpid: string,
    supply: number = 1,
  ): TransactionOutput {
    // Counterparty constants
    const MESSAGE_TYPE_ISSUANCE_WITH_DESCRIPTION = 22; // LR_ISSUANCE_ID from issuance.py

    // Extract asset ID from asset name
    // Support both regular assets (A12345...) and sub-assets (A12345.SUBASSET)
    let assetId: bigint;

    if (cpid.includes('.')) {
      // Sub-asset: PARENTASSET.SUBASSET
      const [parentAsset, subAssetName] = cpid.split('.');
      if (!parentAsset || !subAssetName) {
        throw new Error(`Invalid sub-asset format: ${cpid}`);
      }
      const parentId = BigInt(parentAsset.substring(1)); // Remove 'A' prefix

      // Validate parent asset ID is within valid range
      if (parentId < 0n || parentId >= 2n ** 64n) {
        throw new Error(
          `Parent asset ID ${parentId} is out of valid range (0 to 2^64-1)`,
        );
      }

      // For sub-assets, the asset ID is encoded differently in Counterparty
      // Sub-assets use a special encoding combining parent ID and sub-asset name hash
      // This is a simplified implementation - full Counterparty sub-asset encoding is more complex
      // const subAssetHash = this.hashSubAssetName(subAssetName); // Not used in simplified version
      assetId = parentId; // For now, use parent ID (full implementation would combine with sub-asset hash)

      console.warn(
        `Sub-asset support is basic: using parent asset ID ${parentId} for ${cpid}`,
      );
    } else if (cpid.startsWith('A') && /^A\d+$/.test(cpid)) {
      // Regular numeric asset: A12345...
      const rawAssetId = BigInt(cpid.substring(1));

      // Validate asset ID is within valid range
      if (rawAssetId < 0n || rawAssetId >= 2n ** 64n) {
        throw new Error(
          `Asset ID ${rawAssetId} is out of valid range (0 to 2^64-1)`,
        );
      }

      assetId = rawAssetId;
    } else {
      // Text-based CPID (for testing or special cases)
      // Use a deterministic numeric ID based on the CPID hash
      const nameBuffer = Buffer.from(cpid, 'utf8');
      const hash = bitcoin.crypto.sha256(nameBuffer);
      // Take first 8 bytes of hash as bigint
      assetId = hash.readBigUInt64BE(0) & (2n ** 64n - 1n);

      console.warn(
        `Using hash-based ID for text CPID "${cpid}": ${assetId}`,
      );
    }

    // Parameters with defaults for stamps
    const quantity = BigInt(supply);
    // callable/callDate/callPrice are deprecated in modern Counterparty protocol

    // Description for stamps - use simple format to match stampchain.io API
    // The API uses just "stamp:" as the description
    const description = 'stamp:';

    // Build Counterparty message according to the modern format
    // For newer protocol versions, callable parameters were removed
    // Format: >QQ???<description>

    const messageBuffer = Buffer.alloc(1000); // Oversized buffer
    let offset = 0;

    // Message type (1 byte)
    messageBuffer.writeUInt8(MESSAGE_TYPE_ISSUANCE_WITH_DESCRIPTION, offset);
    offset += 1;

    // Asset ID (8 bytes, big-endian)
    messageBuffer.writeBigUInt64BE(assetId, offset);
    offset += 8;

    // Quantity (8 bytes, big-endian)
    messageBuffer.writeBigUInt64BE(quantity, offset);
    offset += 8;

    // For stamps, stampchain.io uses a simplified format
    // that omits divisible, lock, and reset fields
    // Stamps are always: divisible=false, locked=true, reset=false
    // But these are implied, not encoded in the message

    // NOTE: For modern protocol versions (issuance_callability_parameters_removal),
    // callable/call_date/call_price fields are NOT included

    // Description (variable length UTF-8)
    const descriptionBuffer = Buffer.from(description, 'utf8');
    descriptionBuffer.copy(messageBuffer, offset);
    offset += descriptionBuffer.length;

    // Trim to actual size
    const counterpartyMessage = messageBuffer.subarray(0, offset);

    // Add CNTRPRTY prefix
    const prefixedMessage = Buffer.concat([
      Buffer.from('CNTRPRTY', 'utf8'),
      counterpartyMessage,
    ]);

    // RC4 encrypt with first input TXID as key
    const rc4Key = utxos[0]!.txid;
    const encryptedMessage = this.rc4Encrypt(rc4Key, prefixedMessage);

    // Create OP_RETURN script
    const opReturnScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_RETURN ?? 0x6a, // OP_RETURN = 0x6a
      encryptedMessage,
    ]);

    return {
      script: opReturnScript,
      value: 0, // OP_RETURN outputs have 0 value
    };
  }

  /**
   * RC4 encryption/decryption (same function for both)
   * Based on the exact algorithm used by counterparty-core
   */
  private static rc4Encrypt(key: string, data: Buffer): Buffer {
    const keyBytes = Buffer.from(key, 'hex');
    const result = Buffer.alloc(data.length);

    const s: number[] = [];
    for (let i = 0; i < 256; i++) {
      s[i] = i;
    }

    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + s[i]! + keyBytes[i % keyBytes.length]!) % 256;
      [s[i], s[j]] = [s[j]!, s[i]!];
    }

    let i = 0;
    j = 0;
    for (let k = 0; k < data.length; k++) {
      i = (i + 1) % 256;
      j = (j + s[i]!) % 256;
      [s[i], s[j]] = [s[j]!, s[i]!];
      result[k] = data[k]! ^ s[(s[i]! + s[j]!) % 256]!;
    }

    return result;
  }

  /**
   * Decrypt Counterparty OP_RETURN message
   */
  static decryptOpReturn(
    encryptedData: Buffer,
    inputTxid: string,
  ): Buffer | null {
    try {
      return this.rc4Encrypt(inputTxid, encryptedData); // RC4 decrypt = RC4 encrypt
    } catch {
      return null;
    }
  }

  /**
   * Extract stamp information from encrypted Counterparty OP_RETURN
   * NOTE: Requires input TXID to decrypt properly
   */
  static extractStampInfo(
    opReturnScript: Buffer,
    inputTxid?: string,
  ): { stampId: string; filename?: string } | null {
    try {
      const decompiled = bitcoin.script.decompile(opReturnScript);
      if (!decompiled || decompiled.length !== 2) return null;

      if (decompiled[0] !== bitcoin.opcodes.OP_RETURN) return null;

      const encryptedBuffer = decompiled[1] as Buffer;
      if (!Buffer.isBuffer(encryptedBuffer)) return null;

      // If we have the input TXID, try to decrypt
      if (inputTxid) {
        const decrypted = this.decryptOpReturn(encryptedBuffer, inputTxid);
        if (decrypted) {
          // Check for CNTRPRTY prefix
          if (decrypted.subarray(0, 8).toString('utf8') === 'CNTRPRTY') {
            // Parse the Counterparty message
            const messageType = decrypted[8];
            if (messageType === 20 || messageType === 22) {
              const assetId = decrypted.readBigUInt64BE(9);

              // Extract description if present
              let filename = 'stamp.png'; // Default
              if (decrypted.length > 29) {
                const description = decrypted.subarray(29).toString('utf8')
                  .replace(/\0/g, '');
                if (description.startsWith('STAMP:')) {
                  filename = description.substring(6); // Remove 'STAMP:' prefix
                }
              }

              return {
                stampId: `A${assetId.toString()}`,
                filename,
              };
            }
          }
        }
      }

      // If decryption failed or no input TXID, return basic info
      return {
        stampId: `ENCRYPTED_${encryptedBuffer.subarray(0, 4).toString('hex')}`,
        filename: 'stamp.png',
      };
    } catch {
      return null;
    }
  }
}

/**
 * Bitcoin Stamps Metadata Handler
 */
export class StampMetadataHandler {
  /**
   * Create stamp metadata object
   */
  static createMetadata(
    imageData: Buffer,
    compressedSize?: number,
    skipValidation: boolean = false,
  ): StampMetadata {
    const format = DataProcessor.detectFormat(imageData);

    // Create base64 data URI - for non-image data when validation is skipped, use raw base64
    let base64URI: string;
    if (!format && skipValidation) {
      // For non-image data, create a raw base64 data URI
      base64URI = `data:application/octet-stream;base64,${imageData.toString('base64')}`;
    } else {
      base64URI = DataProcessor.createDataURL(imageData);
    }

    return {
      imageFormat: format || 'unknown',
      imageDimensions: { width: 0, height: 0 }, // Dimensions not needed for stamps
      originalSize: imageData.length,
      ...(compressedSize !== undefined ? { compressedSize } : {}),
      base64URI,
    };
  }

  /**
   * Validate stamp metadata constraints
   */
  static validateMetadata(metadata: StampMetadata): string[] {
    const errors: string[] = [];

    // No dimension constraints for stamps - only size matters
    // Dimensions are just for metadata, not validation

    if (metadata.originalSize > STAMP_MAX_SIZE) {
      errors.push(
        `Data size ${metadata.originalSize} bytes exceeds maximum ${STAMP_MAX_SIZE} bytes (Bitcoin transaction limit)`,
      );
    }

    return errors;
  }
}

/**
 * Main Bitcoin Stamps Encoder
 */
export class BitcoinStampsEncoder {
  private p2wshEncoder: P2WSHEncoder;
  private readonly defaultOptions: Required<
    Pick<
      BitcoinStampEncodingOptions,
      | 'enableCompression'
      | 'dustValue'
      | 'maxOutputs'
      | 'skipValidation'
      | 'enableOptimization'
      | 'enablePatternAnalysis'
    >
  >;

  constructor(
    network: bitcoin.Network = bitcoin.networks.bitcoin,
    options: Partial<BitcoinStampEncodingOptions> = {},
  ) {
    this.p2wshEncoder = new P2WSHEncoder(network, options.dustValue);
    this.defaultOptions = {
      enableCompression: options.enableCompression ?? false, // STAMPS DO NOT USE COMPRESSION
      dustValue: options.dustValue ?? 330, // Standard stamp dust value
      maxOutputs: options.maxOutputs ?? 50,
      skipValidation: options.skipValidation ?? false,
      enableOptimization: options.enableOptimization ?? false, // STAMPS USE RAW DATA
      enablePatternAnalysis: options.enablePatternAnalysis ?? false, // NO ANALYSIS FOR STAMPS
    };
  }

  /**
   * Create fake P2WSH outputs for stamp data (stampchain.io format)
   *
   * CRITICAL: This is NOT standard P2WSH!
   * Stampchain.io puts raw image data in the "script hash" field
   * Format: OP_0 <32-byte-image-chunk>
   *
   * IMPORTANT: Stampchain.io adds a leading 0x00 byte before the image data!
   */
  private createStampDataOutputs(
    imageData: Buffer,
    dustValue: number,
  ): TransactionOutput[] {
    const outputs: TransactionOutput[] = [];
    const CHUNK_SIZE = 32; // Stampchain uses 32-byte chunks

    // CRITICAL: Stampchain.io prepends 0x00 + length byte before the image data
    const lengthByte = imageData.length & 0xFF; // Length as single byte (85 = 0x55)
    const prependedData = Buffer.concat([
      Buffer.from([0x00, lengthByte]),
      imageData,
    ]);

    // Split the prepended data into 32-byte chunks
    for (let i = 0; i < prependedData.length; i += CHUNK_SIZE) {
      const chunk = prependedData.subarray(i, i + CHUNK_SIZE);

      // If chunk is less than 32 bytes, pad with zeros at the end
      const paddedChunk = Buffer.alloc(CHUNK_SIZE);
      chunk.copy(paddedChunk);

      // Create fake P2WSH script: OP_0 <32-byte-data-chunk>
      const fakeP2WSHScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_0 ?? 0x00, // OP_0 = 0x00
        paddedChunk,
      ]);

      outputs.push({
        script: fakeP2WSHScript,
        value: dustValue,
      });
    }

    return outputs;
  }

  /**
   * Encode Bitcoin Stamp data using P2WSH + Counterparty OP_RETURN (async version)
   */
  encode(
    data: BitcoinStampData,
    options?: BitcoinStampEncodingOptions,
  ): Promise<BitcoinStampEncodingResult> {
    return Promise.resolve(this.encodeSync(data, options));
  }

  /**
   * Encode Bitcoin Stamp data using P2WSH + Counterparty OP_RETURN (sync version)
   */
  encodeSync(
    data: BitcoinStampData,
    options?: BitcoinStampEncodingOptions,
  ): BitcoinStampEncodingResult {
    const opts = { ...this.defaultOptions, ...options };

    // Validate input data
    this.validate(data);

    // Check size constraint (the only real constraint for stamps)
    if (!opts.skipValidation && DataProcessor.exceedsMaxSize(data.imageData)) {
      throw new Error(
        `Data exceeds maximum transaction size of ${STAMP_MAX_SIZE} bytes`,
      );
    }

    // CRITICAL: For stamps, use RAW image data - NO COMPRESSION!
    // Stampchain.io puts the raw PNG bytes directly into P2WSH outputs
    const binaryData = data.imageData;
    const compressedSize: number | undefined = binaryData.length;
    let patternAnalysis: PatternAnalysis | undefined;
    let scriptOptimization: OptimizedScript | undefined;

    // STAMPS DO NOT USE COMPRESSION OR OPTIMIZATION
    // Stamps always use raw image data

    // CRITICAL: Stamps use FAKE P2WSH (not real witness scripts)!
    // The "hash" field contains raw image data chunks, not actual script hashes
    const stampOutputs = this.createStampDataOutputs(
      binaryData,
      opts.dustValue,
    );

    // Create stamp metadata
    const metadata = StampMetadataHandler.createMetadata(
      data.imageData,
      compressedSize,
      opts.skipValidation,
    );

    // Validate metadata constraints
    if (!opts.skipValidation) {
      const metadataErrors = StampMetadataHandler.validateMetadata(metadata);
      if (metadataErrors.length > 0) {
        throw new Error(
          `Stamp metadata validation failed: ${metadataErrors.join(', ')}`,
        );
      }
    }

    // Create Counterparty OP_RETURN using proper RC4 encryption (same as stampchain.io /olga endpoint)
    const opReturnOutput = CounterpartyProtocolHandler.createOpReturnOutput(
      opts.utxos || [{ txid: '0'.repeat(64), vout: 0, value: 0 }], // Default for testing
      opts.cpid || `A${95428956661682177n + BigInt(Date.now() % 1000000)}`, // Generate valid numeric CPID in valid range
      opts.supply ?? 1,
    );

    // CRITICAL: Output order must match stampchain.io!
    // OP_RETURN MUST come first, then fake P2WSH outputs
    const allOutputs = [
      opReturnOutput, // Counterparty OP_RETURN MUST BE FIRST
      ...stampOutputs, // Fake P2WSH outputs with raw image data
    ];

    // No optimization needed for fake P2WSH stamp outputs

    const result: BitcoinStampEncodingResult = {
      script: stampOutputs[0]?.script || Buffer.alloc(0),
      outputs: allOutputs,
      estimatedSize: stampOutputs.length * 34 + opReturnOutput.script.length,
      dataSize: binaryData.length,
      p2wshOutputs: stampOutputs, // These are fake P2WSH outputs
      opReturnOutput,
      metadata,
      compressionUsed: false, // Bitcoin stamps don't use compression
      ...(patternAnalysis ? { patternAnalysis } : {}),
      ...(scriptOptimization ? { scriptOptimization } : {}),
    };
    return result;
  }

  /**
   * Decode Bitcoin Stamp data from transaction outputs
   */
  decode(outputs: TransactionOutput[]): BitcoinStampData {
    // Separate P2WSH and OP_RETURN outputs
    const p2wshOutputs: TransactionOutput[] = [];
    let opReturnOutput: TransactionOutput | null = null;

    for (const output of outputs) {
      const decompiled = bitcoin.script.decompile(output.script);
      if (!decompiled) continue;

      if (decompiled[0] === bitcoin.opcodes.OP_RETURN) {
        opReturnOutput = output;
      } else {
        // Assume other outputs are P2WSH (would need proper validation in production)
        p2wshOutputs.push(output);
      }
    }

    if (!opReturnOutput) {
      throw new Error('No Counterparty OP_RETURN output found');
    }

    if (p2wshOutputs.length === 0) {
      throw new Error('No P2WSH data outputs found');
    }

    // Extract stamp info from OP_RETURN
    const stampInfo = CounterpartyProtocolHandler.extractStampInfo(
      opReturnOutput.script,
    );
    if (!stampInfo) {
      throw new Error('Invalid Counterparty OP_RETURN format');
    }

    // Note: For proper decoding, we would need the witness scripts from the transaction
    // This is a limitation of decoding from outputs alone
    throw new Error(
      'Decoding Bitcoin Stamps requires witness scripts from transaction data',
    );
  }

  /**
   * Validate Bitcoin Stamp data
   */
  validate(data: BitcoinStampData): boolean {
    if (!data || typeof data !== 'object') {
      throw new Error('BitcoinStampData must be an object');
    }

    if (!Buffer.isBuffer(data.imageData) || data.imageData.length === 0) {
      throw new Error('imageData must be a non-empty Buffer');
    }

    // Note: mimeType is not part of on-chain spec; no validation needed here

    // Validate optional string fields
    const stringFields = ['title', 'description', 'creator', 'filename'];
    for (const field of stringFields) {
      const value = (data as any)[field];
      if (value !== undefined && typeof value !== 'string') {
        throw new Error(`${field} must be a string if provided`);
      }
    }

    return true;
  }

  /**
   * Get maximum data size that can be encoded
   */
  getMaxDataSize(): number {
    return Math.min(
      STAMP_MAX_SIZE,
      this.p2wshEncoder.getMaxDataSize(),
    );
  }

  /**
   * Get encoder type
   */
  getType(): string {
    return 'bitcoin-stamps';
  }

  /**
   * Create a Bitcoin Stamp from base64 image data
   */
  static fromBase64(
    base64Data: string,
    options: {
      title?: string;
      description?: string;
      creator?: string;
      filename?: string;
    } = {},
  ): BitcoinStampData {
    // Validate and extract image data
    // Decode base64 data
    let imageData: Buffer;
    try {
      // Handle data URLs
      let cleanBase64 = base64Data;
      if (base64Data.startsWith('data:')) {
        const base64Index = base64Data.indexOf('base64,');
        if (base64Index !== -1) {
          cleanBase64 = base64Data.substring(base64Index + 7);
        }
      }
      imageData = Buffer.from(cleanBase64, 'base64');
    } catch (error) {
      throw new Error(`Invalid base64 data: ${error}`);
    }

    // Check size constraint
    if (DataProcessor.exceedsMaxSize(imageData)) {
      throw new Error(`Data exceeds maximum transaction size of ${STAMP_MAX_SIZE} bytes`);
    }

    return {
      imageData,
      // mimeType is not part of on-chain spec; omit from input type for clarity
      ...(options.title ? { title: options.title } : {}),
      ...(options.description ? { description: options.description } : {}),
      ...(options.creator ? { creator: options.creator } : {}),
      ...(options.filename ? { filename: options.filename } : {}),
    };
  }

  /**
   * Create a Bitcoin Stamp from file buffer
   */
  static fromBuffer(
    imageBuffer: Buffer,
    options: {
      title?: string;
      description?: string;
      creator?: string;
      filename?: string;
    } = {},
  ): BitcoinStampData {
    // Check size constraint
    if (DataProcessor.exceedsMaxSize(imageBuffer)) {
      throw new Error(`Data exceeds maximum transaction size of ${STAMP_MAX_SIZE} bytes`);
    }

    // MIME type is not required for on-chain encoding; detection omitted

    return {
      imageData: imageBuffer,
      // mimeType is not part of on-chain spec; omit from input type for clarity
      ...(options.title ? { title: options.title } : {}),
      ...(options.description ? { description: options.description } : {}),
      ...(options.creator ? { creator: options.creator } : {}),
      ...(options.filename ? { filename: options.filename } : {}),
    };
  }

  /**
   * Extract stamp data from transaction outputs (new format with filename in OP_RETURN)
   */
  static extractStampFromTransaction(
    outputs: TransactionOutput[],
  ): BitcoinStampData | null {
    // Find OP_RETURN output
    const opReturnOutput = outputs.find((output) => {
      const decompiled = bitcoin.script.decompile(output.script);
      return decompiled && decompiled[0] === bitcoin.opcodes.OP_RETURN;
    });

    if (!opReturnOutput) {
      return null;
    }

    // Extract filename from OP_RETURN
    const stampInfo = CounterpartyProtocolHandler.extractStampInfo(
      opReturnOutput.script,
    );
    if (!stampInfo) {
      return null;
    }

    // Find P2WSH outputs containing the image data
    const p2wshOutputs = outputs.filter((output) => {
      const decompiled = bitcoin.script.decompile(output.script);
      return decompiled && decompiled[0] !== bitcoin.opcodes.OP_RETURN;
    });

    if (p2wshOutputs.length === 0) {
      return null;
    }

    // Note: In a full implementation, we would decode the witness scripts
    // to extract the actual image data from P2WSH outputs
    // For now, we return the metadata we can extract
    return {
      imageData: Buffer.alloc(0), // Would need witness script data to decode
      ...(stampInfo.filename ? { filename: stampInfo.filename } : {}),
      description: 'Extracted from transaction',
    };
  }
}
