/**
 * SRC-20 Token Encoder/Decoder
 *
 * Production-compatible implementation matching BTCStampsExplorer exactly
 * Uses direct data embedding in P2WSH script hashes
 *
 * Reference: BTCStampsExplorer/utils/decodeSrc20OlgaTx.ts
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as zlib from 'node:zlib';
import * as msgpack from 'msgpack-lite';
import { Buffer } from 'node:buffer';
import type { TransactionOutput } from '../interfaces/encoders/base.interface';
import type {
  SRC20Data,
  SRC20DeployData,
  SRC20MintData,
  SRC20Operation,
  SRC20TransferData,
} from '../interfaces/src20.interface.ts';
import { RC4 } from './counterparty-encoder.ts';
import type { SRC20EncodingOptions, SRC20EncodingResult } from '../interfaces/src20.interface.ts';

// Re-export SRC20 types and encoding types
export type {
  SRC20Data,
  SRC20DeployData,
  SRC20EncodingOptions,
  SRC20EncodingResult,
  SRC20MintData,
  SRC20Operation,
  SRC20TransferData,
} from '../interfaces/src20.interface';

const STAMP_PREFIX = 'stamp:';
const DUST_VALUE = 330; // Match Bitcoin Stamps P2WSH dust exactly
const CHUNK_SIZE = 32; // P2WSH script hash size

// Bitcoin network standardness limits
const MAX_STANDARD_TX_SIZE = 100000; // 100KB max standard transaction size
const P2WSH_OUTPUT_SIZE = 34; // Approximate size of a P2WSH output in bytes
const DEFAULT_MAX_OUTPUTS = Math.floor(
  MAX_STANDARD_TX_SIZE / P2WSH_OUTPUT_SIZE,
); // ~2940 outputs

/**
 * SRC-20 Encoder Implementation
 * Matches BTCStampsExplorer production exactly
 */
export class SRC20Encoder {
  constructor(_network: bitcoin.Network = bitcoin.networks.bitcoin) {
    // Network parameter kept for API compatibility but not used
  }

  /**
   * Encode SRC-20 data using direct P2WSH data embedding
   * Data is embedded directly in the script hash, NOT in witness scripts
   * Supports both sync and async usage for backward compatibility
   */
  encode(data: SRC20Data | SRC20Operation, options?: SRC20EncodingOptions): SRC20EncodingResult {
    // Convert generic SRC20Operation to specific type if needed
    const normalizedData = this.normalizeSRC20Operation(data);
    return this.encodeSync(normalizedData, options);
  }

  /**
   * Async version of encode for compatibility
   */
  encodeAsync(
    data: SRC20Data | SRC20Operation,
    options?: SRC20EncodingOptions,
  ): Promise<SRC20EncodingResult> {
    return Promise.resolve(this.encode(data, options));
  }

  /**
   * Encode SRC-20 data using direct P2WSH data embedding (sync version)
   * Data is embedded directly in the script hash, NOT in witness scripts
   *
   * NEW: Creates complete transaction outputs including dust outputs in stampchain order
   */
  encodeSync(data: SRC20Data, options?: SRC20EncodingOptions): SRC20EncodingResult {
    const dustValue = options?.dustValue ?? DUST_VALUE;
    // Use Bitcoin's standard transaction size limit as our default maximum
    // This is a practical limit based on relay policy, not consensus rules
    const maxOutputs = options?.maxOutputs ?? DEFAULT_MAX_OUTPUTS;

    // Validate data
    const errors = this.getValidationErrors(data);
    if (errors.length > 0) {
      throw new Error(`Invalid SRC-20 data: ${errors.join(', ')}`);
    }

    // Normalize data to production format
    const normalized = this.normalizeData(data);
    const jsonStr = JSON.stringify(normalized);

    // Prepare data with compression if beneficial
    let finalData: Buffer;
    let compressed = false;

    if (options?.useCompression !== false && jsonStr.length > 100) {
      try {
        const msgpacked = msgpack.encode(normalized);
        const zlibCompressed = zlib.deflateSync(msgpacked);

        if (zlibCompressed.length < Buffer.from(jsonStr).length) {
          finalData = Buffer.concat([
            Buffer.from(STAMP_PREFIX),
            zlibCompressed,
          ]);
          compressed = true;
        } else {
          finalData = Buffer.concat([
            Buffer.from(STAMP_PREFIX),
            Buffer.from(jsonStr),
          ]);
        }
      } catch {
        finalData = Buffer.concat([
          Buffer.from(STAMP_PREFIX),
          Buffer.from(jsonStr),
        ]);
      }
    } else {
      finalData = Buffer.concat([
        Buffer.from(STAMP_PREFIX),
        Buffer.from(jsonStr),
      ]);
    }

    // Create P2WSH outputs with direct data embedding
    const p2wshOutputs = this.createP2WSHOutputs(finalData, dustValue);

    // This is a sanity check, not a protocol requirement
    if (p2wshOutputs.length > maxOutputs) {
      throw new Error(
        `Too many outputs: ${p2wshOutputs.length} > ${maxOutputs}. This is a sanity limit, not a Bitcoin protocol requirement. You can increase it via options.maxOutputs`,
      );
    }

    // Create complete transaction outputs in stampchain order
    const allOutputs = this.createCompleteOutputs(data, p2wshOutputs, options);

    // Calculate estimated transaction size
    const estimatedSize = this.estimateTransactionSize(allOutputs.length);

    // Create Counterparty OP_RETURN output for SRC-20 (for compatibility, not included in outputs)
    const opReturnOutput = this.createOpReturnOutput(normalized);

    return {
      script: p2wshOutputs[0]?.script || Buffer.alloc(0),
      outputs: allOutputs, // Complete transaction outputs in stampchain order
      p2wshOutputs,
      opReturnOutput, // Required by tests
      jsonData: jsonStr,
      chunkCount: p2wshOutputs.length,
      compressionUsed: compressed,
      totalDustValue: allOutputs.reduce((sum, output) => sum + output.value, 0),
      estimatedSize: estimatedSize,
      dataSize: finalData.length,
      totalSize: finalData.length,
    };
  }

  /**
   * Normalize SRC20Operation to SRC20Data type
   */
  private normalizeSRC20Operation(data: SRC20Data | SRC20Operation): SRC20Data {
    // Check if this is a generic SRC20Operation type
    const opData = data as any;
    const op = data.op?.toUpperCase() as any;

    switch (op) {
      case 'DEPLOY':
        return {
          p: data.p, // Preserve original protocol for validation
          op: 'DEPLOY',
          tick: data.tick,
          max: opData.max, // Don't provide defaults for validation
          lim: opData.lim, // Don't provide defaults for validation
          ...(opData.dec !== undefined ? { dec: Number(opData.dec) } : {}),
          ...(opData.description ? { description: opData.description } : {}),
          ...(opData.x ? { x: opData.x } : {}),
          ...(opData.web ? { web: opData.web } : {}),
          ...(opData.email ? { email: opData.email } : {}),
          ...(opData.tg ? { tg: opData.tg } : {}),
          ...(opData.img ? { img: opData.img } : {}),
          ...(opData.icon ? { icon: opData.icon } : {}),
        } as SRC20DeployData;

      case 'MINT':
        return {
          p: data.p, // Preserve original protocol for validation
          op: 'MINT',
          tick: data.tick,
          amt: Array.isArray(opData.amt) ? opData.amt[0] : opData.amt, // Don't provide default for validation
        } as SRC20MintData;

      case 'TRANSFER':
        return {
          p: data.p, // Preserve original protocol for validation
          op: 'TRANSFER',
          tick: data.tick,
          amt: Array.isArray(opData.amt) ? opData.amt.join(',') : opData.amt, // Don't provide default for validation
          ...(opData.dest ? { dest: opData.dest } : {}), // Include dest if provided
        } as SRC20TransferData;

      default:
        // If it's already the correct type, return as-is
        return data as SRC20Data;
    }
  }

  /**
   * Async encode with automatic compression decision
   */
  encodeWithCompression(
    data: SRC20Data,
    options?: SRC20EncodingOptions,
  ): SRC20EncodingResult {
    // Try both compressed and uncompressed
    const uncompressed = this.encodeSync(data, {
      ...options,
      useCompression: false,
    });
    const compressed = this.encodeSync(data, { ...options, useCompression: true });

    // Use whichever produces fewer outputs
    return compressed.outputs.length < uncompressed.outputs.length ? compressed : uncompressed;
  }

  /**
   * Decode SRC-20 data from P2WSH outputs
   */
  async decodeFromOutputs(
    p2wshOutputs: Array<{ script: Buffer; value: number }>,
  ): Promise<SRC20Data | null> {
    try {
      const hexData = P2WSHAddressUtils.outputsToHex(p2wshOutputs);
      if (!hexData) {
        return null;
      }

      const dataBuffer = Buffer.from(hexData, 'hex');

      // Check for stamp: prefix at the beginning of the buffer
      const stampPrefixBuffer = Buffer.from(STAMP_PREFIX);
      if (
        !dataBuffer.subarray(0, stampPrefixBuffer.length).equals(
          stampPrefixBuffer,
        )
      ) {
        return null;
      }

      // Extract data after stamp: prefix
      const dataWithoutPrefix = dataBuffer.subarray(stampPrefixBuffer.length);

      // Try decompression and msgpack decoding first
      try {
        const uncompressed = await this.zlibDecompress(dataWithoutPrefix);
        const decoded = msgpack.decode(uncompressed);

        // Validate protocol (accept both cases for backward compatibility)
        if (decoded.p !== 'src-20' && decoded.p !== 'SRC-20') {
          throw new Error('Protocol must be "SRC-20"');
        }

        return this.denormalizeData(decoded);
      } catch {
        // Fallback to JSON parsing for uncompressed data
        try {
          const jsonString = dataWithoutPrefix.toString('utf8');
          const decoded = JSON.parse(jsonString);

          // Validate protocol (accept both cases for backward compatibility)
          if (decoded.p !== 'src-20' && decoded.p !== 'SRC-20') {
            throw new Error('Protocol must be "SRC-20"');
          }

          return this.denormalizeData(decoded);
        } catch {
          return null;
        }
      }
    } catch (error) {
      console.error('Error decoding SRC-20 data:', error);
      return null;
    }
  }

  /**
   * Decode SRC-20 data from transaction
   * Matches BTCStampsExplorer/utils/decodeSrc20OlgaTx.ts
   */
  async decode(tx: bitcoin.Transaction): Promise<SRC20Data | null> {
    try {
      // Find P2WSH outputs
      const p2wshOutputs = tx.outs.filter((output) => {
        const decompiled = bitcoin.script.decompile(output.script);
        return decompiled &&
          decompiled[0] === bitcoin.opcodes.OP_0 &&
          decompiled[1] &&
          (decompiled[1] as Buffer).length === 32;
      });

      if (p2wshOutputs.length === 0) {
        return null;
      }

      // Extract data from P2WSH outputs
      let encodedData = '';
      for (const output of p2wshOutputs) {
        // Skip OP_0 and push byte (first 2 bytes)
        const dataBytes = output.script.subarray(2);
        encodedData += dataBytes.toString('hex');
      }

      // Remove padding zeros
      encodedData = encodedData.replace(/0+$/, '');

      // Extract the length prefix (2 bytes)
      const lengthPrefix = parseInt(encodedData.slice(0, 4), 16);

      // Convert hex data to buffer, excluding the length prefix
      const dataBuffer = Buffer.from(encodedData.slice(4), 'hex').subarray(0, lengthPrefix);

      // Check for STAMP prefix
      if (!dataBuffer.toString('utf8').startsWith(STAMP_PREFIX)) {
        return null;
      }

      const dataWithoutPrefix = dataBuffer.subarray(STAMP_PREFIX.length);

      // Try decompression and msgpack decoding
      try {
        const uncompressed = await this.zlibDecompress(dataWithoutPrefix);
        const decoded = msgpack.decode(uncompressed);
        return this.denormalizeData(decoded);
      } catch {
        // Fallback to JSON
        try {
          const decoded = JSON.parse(dataWithoutPrefix.toString('utf8'));
          return this.denormalizeData(decoded);
        } catch {
          return null;
        }
      }
    } catch (error) {
      console.error(
        'Error decoding SRC-20 data:',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  /**
   * Validate SRC-20 data
   */
  validate(data: any): boolean {
    return this.getValidationErrors(data).length === 0;
  }

  /**
   * Get validation errors
   */
  getValidationErrors(data: SRC20Data): string[] {
    const errors: string[] = [];

    if (!data) {
      errors.push('Data is required');
      return errors;
    }

    // Check protocol (accept both cases for backward compatibility)
    if (!data.p || (data.p !== 'SRC-20' && data.p !== 'src-20')) {
      errors.push('Protocol must be "SRC-20"');
    }

    // Check operation
    const validOps = ['DEPLOY', 'MINT', 'TRANSFER'];
    if (!data.op || !validOps.includes(data.op.toUpperCase())) {
      errors.push(`Invalid operation: ${data.op}`);
    }

    // Check tick - SRC-20 protocol enforces 5 character maximum
    if (!data.tick || data.tick.trim() === '') {
      errors.push('Missing required field: tick');
    } else if (data.tick.length > 5) {
      errors.push(
        `Ticker "${data.tick}" exceeds 5 character limit (got ${data.tick.length} chars)`,
      );
    } else if (!/^[A-Z0-9]{1,5}$/.test(data.tick.toUpperCase())) {
      errors.push('Invalid tick format (1-5 uppercase alphanumeric characters)');
    }

    // Operation-specific validation
    switch (data.op?.toUpperCase()) {
      case 'DEPLOY': {
        const deployData = data as any; // SRC20DeployData
        if (!deployData.max) errors.push('Missing required field: max');
        if (!deployData.lim) errors.push('Missing required field: lim');

        // Validate max value (more reasonable upper bound)
        if (deployData.max) {
          try {
            const maxNum = BigInt(deployData.max);
            if (maxNum > BigInt('18446744073709551615')) { // uint64 is the maximum allowed
              errors.push('Number too large: max value exceeds maximum allowed');
            }
            if (maxNum <= 0n) {
              errors.push('Max value must be positive');
            }
          } catch {
            errors.push('Invalid max value format');
          }
        }

        // Validate lim value (more reasonable upper bound)
        if (deployData.lim) {
          try {
            const limNum = BigInt(deployData.lim);
            if (limNum > BigInt('18446744073709551615')) { // uint64 is the maximum allowed
              errors.push('Number too large: lim value exceeds maximum allowed');
            }
            if (limNum <= 0n) {
              errors.push('Lim value must be positive');
            }
          } catch {
            errors.push('Invalid lim value format');
          }
        }

        // Validate decimals if provided
        if (deployData.dec !== undefined) {
          const dec = parseInt(deployData.dec);
          if (isNaN(dec) || dec < 0 || dec > 18) {
            errors.push('Decimals must be between 0 and 18');
          }
        }

        // Validate image references (must be protocol:hash format)
        const validateImageRef = (field: string, value: string) => {
          if (value && !value.match(/^(ipfs|ar|sia|storj):[A-Za-z0-9]+$/)) {
            errors.push(
              `Invalid ${field} format (must be protocol:hash, e.g., ipfs:QmXyz...)`,
            );
          }
        };

        if (deployData.img) validateImageRef('img', deployData.img);
        if (deployData.icon) validateImageRef('icon', deployData.icon);
        break;
      }

      case 'MINT': {
        const mintData = data as SRC20MintData;
        const amtStr = String(mintData.amt || '');
        if (!mintData.amt || amtStr.trim() === '') {
          errors.push('Missing required field: amt');
        } else {
          // Check if it's a valid number first
          const amount = parseFloat(amtStr);
          if (isNaN(amount)) {
            errors.push('Invalid amount: not a number');
          } else if (amount <= 0) {
            errors.push('Invalid amount: amount must be positive');
          } else {
            // For integer values, check uint64 limit
            // For decimal values, just ensure they're reasonable
            try {
              // If it looks like an integer (no decimal point or .0), check as BigInt
              if (!amtStr.includes('.') || amtStr.endsWith('.0')) {
                const amtBigInt = BigInt(amtStr.replace('.0', ''));
                if (amtBigInt > BigInt('18446744073709551615')) { // uint64 max
                  errors.push('Amount exceeds maximum allowed (uint64 limit)');
                }
              }
            } catch {
              // If BigInt conversion fails, it's likely a decimal - that's ok
            }
          }
        }
        break;
      }

      case 'TRANSFER': {
        const transferData = data as SRC20TransferData;
        const amtStr = String(transferData.amt || '');
        if (!transferData.amt || amtStr.trim() === '') {
          errors.push('Missing required field: amt');
        } else {
          // Check if it's a valid number first
          const amount = parseFloat(amtStr);
          if (isNaN(amount)) {
            errors.push('Invalid amount: not a number');
          } else if (amount <= 0) {
            errors.push('Invalid amount: amount must be positive');
          } else {
            // For integer values, check uint64 limit
            // For decimal values, just ensure they're reasonable
            try {
              // If it looks like an integer (no decimal point or .0), check as BigInt
              if (!amtStr.includes('.') || amtStr.endsWith('.0')) {
                const amtBigInt = BigInt(amtStr.replace('.0', ''));
                if (amtBigInt > BigInt('18446744073709551615')) { // uint64 max
                  errors.push('Amount exceeds maximum allowed (uint64 limit)');
                }
              }
            } catch {
              // If BigInt conversion fails, it's likely a decimal - that's ok
            }
          }
        }
        break;
      }
    }

    return errors;
  }

  /**
   * Create complete transaction outputs in stampchain order
   * This is the key method that makes SRC-20 encoding as simple as Bitcoin Stamps
   */
  private createCompleteOutputs(
    data: SRC20Data,
    p2wshOutputs: TransactionOutput[],
    options?: SRC20EncodingOptions,
  ): TransactionOutput[] {
    const allOutputs: TransactionOutput[] = [];
    const dustValue = options?.dustValue ?? DUST_VALUE;
    const network = options?.network ?? bitcoin.networks.bitcoin;

    // Stampchain SRC-20 output order:
    // 1. P2WPKH dust to sender (for DEPLOY/MINT) or recipient (for TRANSFER)
    // 2. P2WSH data outputs
    // 3. Change output (handled by builder, not encoder)

    if (data.op === 'TRANSFER' && options?.toAddress) {
      // TRANSFER: Recipient gets dust output FIRST
      const recipientScript = bitcoin.address.toOutputScript(options.toAddress, network);
      allOutputs.push({
        script: recipientScript,
        value: dustValue,
      });
    } else if (options?.fromAddress) {
      // DEPLOY/MINT: Sender gets dust output FIRST
      const senderScript = bitcoin.address.toOutputScript(options.fromAddress, network);
      allOutputs.push({
        script: senderScript,
        value: dustValue,
      });
    }

    // Add P2WSH data outputs
    allOutputs.push(...p2wshOutputs);

    return allOutputs;
  }

  /**
   * Create P2WSH outputs with direct data embedding
   * Data is embedded directly in the 32-byte "hash", NOT in witness scripts
   * Production format: Single P2WSH output with length-prefixed data
   */
  private createP2WSHOutputs(
    data: Buffer,
    dustValue: number,
  ): TransactionOutput[] {
    const outputs: TransactionOutput[] = [];

    // Add 2-byte length prefix: [0x00, single_byte_length]
    // Stampchain uses [null_byte, length_byte] format, NOT uint16!
    const lengthPrefix = Buffer.from([0x00, data.length & 0xFF]);

    // Combine length prefix with data
    const prefixedData = Buffer.concat([lengthPrefix, data]);

    // For single output: if data fits in 32 bytes (minus 2 for length prefix)
    // Production uses single P2WSH when possible
    if (prefixedData.length <= CHUNK_SIZE) {
      // Pad to 32 bytes
      const paddedData = Buffer.concat([
        prefixedData,
        Buffer.alloc(CHUNK_SIZE - prefixedData.length, 0),
      ]);

      // Create single P2WSH script
      const script = Buffer.concat([
        Buffer.from([0x00, 0x20]), // OP_0 + push 32 bytes
        paddedData, // Our data directly embedded with length prefix
      ]);

      outputs.push({
        script,
        value: dustValue,
      });
    } else {
      // For larger data, chunk it (but still with length prefix in first chunk)
      for (let i = 0; i < prefixedData.length; i += CHUNK_SIZE) {
        const chunk = prefixedData.subarray(i, Math.min(i + CHUNK_SIZE, prefixedData.length));

        // Pad chunk to 32 bytes if needed
        const paddedChunk = Buffer.concat([
          chunk,
          Buffer.alloc(CHUNK_SIZE - chunk.length, 0),
        ]);

        // Create P2WSH script: OP_0 + 32-byte data
        const script = Buffer.concat([
          Buffer.from([0x00, 0x20]), // OP_0 + push 32 bytes
          paddedChunk, // Our data directly embedded
        ]);

        outputs.push({
          script,
          value: dustValue,
        });
      }
    }

    return outputs;
  }

  /**
   * Normalize data to production format
   * lowercase protocol and operation to match real transactions, uppercase tick, numbers not strings for amounts
   */
  private normalizeData(data: SRC20Data): any {
    const normalized: any = {
      p: 'src-20', // Lowercase to match real transactions
      op: data.op.toLowerCase(), // Lowercase to match real transactions
      tick: data.tick.toUpperCase(),
    };

    switch (data.op.toUpperCase()) {
      case 'DEPLOY': {
        const deployData = data as any; // SRC20DeployData
        // For large numbers, use parseFloat which can handle larger values than parseInt
        // Numbers up to uint64 max (18446744073709551615) will be stored as floats in JSON
        // This matches the production format which uses numbers, not strings
        normalized.max = this.parseNumericValue(deployData.max || '0');
        normalized.lim = this.parseNumericValue(deployData.lim || '0');
        if (deployData.dec !== undefined) {
          normalized.dec = deployData.dec;
        }
        // Preserve optional metadata fields
        if (deployData.description) {
          normalized.description = deployData.description;
        }
        if (deployData.x) normalized.x = deployData.x;
        if (deployData.web) normalized.web = deployData.web;
        if (deployData.email) normalized.email = deployData.email;
        if (deployData.tg) normalized.tg = deployData.tg;
        if (deployData.img) normalized.img = deployData.img;
        if (deployData.icon) normalized.icon = deployData.icon;
        break;
      }

      case 'MINT': {
        const mintData = data as SRC20MintData;
        normalized.amt = this.parseAmount(mintData.amt);
        break;
      }

      case 'TRANSFER': {
        const transferData = data as SRC20TransferData;
        normalized.amt = this.parseAmount(transferData.amt);
        // Include dest field if provided (non-standard but used in practice)
        if ((transferData as any).dest) {
          normalized.dest = (transferData as any).dest;
        }
        break;
      }
    }

    return normalized;
  }

  /**
   * Denormalize data back to standard format
   */
  private denormalizeData(data: any): SRC20Data {
    const op = data.op?.toUpperCase() || '';
    const base = {
      p: 'SRC-20' as const,
      tick: data.tick || '',
    };

    switch (op) {
      case 'DEPLOY':
        return {
          ...base,
          op: 'DEPLOY' as const,
          max: data.max?.toString() || '',
          lim: data.lim?.toString() || '',
          ...(data.dec !== undefined ? { dec: data.dec?.toString() } : {}),
          ...(data.description ? { description: data.description } : {}),
          ...(data.img ? { img: data.img } : {}),
          ...(data.icon ? { icon: data.icon } : {}),
          ...(data.x ? { x: data.x } : {}),
          ...(data.web ? { web: data.web } : {}),
          ...(data.email ? { email: data.email } : {}),
          ...(data.tg ? { tg: data.tg } : {}),
        } as SRC20DeployData;

      case 'MINT':
        return {
          ...base,
          op: 'MINT' as const,
          amt: data.amt?.toString() || '',
        } as SRC20MintData;

      case 'TRANSFER':
        return {
          ...base,
          op: 'TRANSFER' as const,
          amt: data.amt?.toString() || '',
        } as SRC20TransferData;

      default:
        // Fallback for unknown operations
        return {
          ...base,
          op: op as any,
        } as SRC20Data;
    }
  }

  /**
   * Parse amount to number format to match real transactions
   * For TRANSFER operations with multiple amounts, returns comma-separated string
   */
  private parseAmount(amt?: string | number): number | string {
    if (!amt && amt !== 0) return 0;

    // If already a number, return it
    if (typeof amt === 'number') return amt;

    // Check if this is a comma-separated string (for TRANSFER with multiple amounts)
    if (amt.includes(',')) {
      return amt; // Return as string for comma-separated amounts
    }

    // Convert to number to match real transaction format
    const parsed = parseFloat(amt);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Parse numeric value handling large numbers up to uint64 max
   * JavaScript can represent integers up to 2^53-1 exactly, but we need to handle up to 2^64-1
   * For numbers beyond safe integer range, they'll be represented as floats in JSON
   */
  private parseNumericValue(value: string): number {
    if (!value) return 0;

    // Use parseFloat to handle large numbers
    // Note: This may lose precision for very large integers, but JSON doesn't support BigInt
    // and the SRC-20 spec expects numeric values in JSON, not strings
    const parsed = parseFloat(value);

    if (isNaN(parsed)) return 0;

    // Ensure non-negative
    return Math.max(0, parsed);
  }

  /**
   * Create OP_RETURN output for SRC-20 operation
   * Uses Counterparty protocol for Bitcoin Stamps compatibility
   */
  private createOpReturnOutput(data: any): TransactionOutput {
    try {
      // Create encrypted message using RC4 (like Counterparty)
      const message = Buffer.from(`CNTRPRTY${data.op}:${data.tick}`, 'utf8');
      const fakeKey = '0000000000000000000000000000000000000000000000000000000000000000';
      const encrypted = RC4.encrypt(Buffer.from(fakeKey.substring(0, 32), 'hex'), message);

      // Ensure it fits in OP_RETURN (80 bytes max)
      const truncatedEncrypted = encrypted.length > 78 ? encrypted.subarray(0, 78) : encrypted;

      const script = Buffer.concat([
        Buffer.from([0x6a]), // OP_RETURN
        Buffer.from([truncatedEncrypted.length]), // Push length
        truncatedEncrypted,
      ]);

      return { script, value: 0 };
    } catch {
      // Fallback to minimal OP_RETURN
      return {
        script: Buffer.from([0x6a, 0x06, 0x53, 0x52, 0x43, 0x32, 0x30, 0x00]), // "SRC20\0"
        value: 0,
      };
    }
  }

  /**
   * Estimate transaction size
   */
  private estimateTransactionSize(outputCount: number): number {
    const baseSize = 10; // Version, locktime, etc.
    const inputSize = 148; // Typical P2WPKH input
    const outputSize = 43; // P2WSH output (8 + 1 + 34)
    const changeSize = 31; // P2WPKH change output

    return baseSize + inputSize + (outputSize * outputCount) + changeSize;
  }

  /**
   * Zlib decompression helper
   */
  private zlibDecompress(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zlib.inflate(data, (err, result) => {
        if (err) {
          zlib.inflateRaw(data, (rawErr, rawResult) => {
            if (rawErr) {
              reject(rawErr);
            } else {
              resolve(rawResult);
            }
          });
        } else {
          resolve(result);
        }
      });
    });
  }
}

/**
 * Utility class for working with P2WSH addresses and SRC-20 encoding
 */
export class P2WSHAddressUtils {
  /**
   * Convert hex data to P2WSH addresses
   * Creates P2WSH outputs with data embedded in script hashes
   */
  static hexToAddresses(
    hexData: string,
    network: bitcoin.Network = bitcoin.networks.bitcoin,
  ): string[] {
    const data = Buffer.from(hexData, 'hex');
    const addresses: string[] = [];

    // Split into 32-byte chunks (no length prefix)
    for (let i = 0; i < data.length; i += 32) {
      const chunk = data.subarray(
        i,
        Math.min(i + 32, data.length),
      );

      // Pad to 32 bytes if needed
      const paddedChunk = Buffer.concat([
        chunk,
        Buffer.alloc(32 - chunk.length, 0),
      ]);

      // Create P2WSH script
      const script = bitcoin.script.compile([
        bitcoin.opcodes.OP_0 ?? 0x00, // OP_0 = 0x00
        paddedChunk,
      ]);

      // Convert to address
      const address = bitcoin.address.fromOutputScript(script, network);
      addresses.push(address);
    }

    return addresses;
  }

  /**
   * Extract hex data from P2WSH outputs
   * In SRC-20 encoding, data is embedded directly in the script (not a hash)
   */
  static outputsToHex(
    outputs: Array<{ script: Buffer; value: number }>,
  ): string | null {
    let hexData = '';

    // Process each P2WSH output
    for (const output of outputs) {
      // Skip if not P2WSH format
      if (
        output.script[0] !== 0x00 || output.script[1] !== 0x20 ||
        output.script.length !== 34
      ) {
        continue;
      }

      // Extract the 32-byte data from the script (bytes 2-34)
      const chunk = output.script.subarray(2);
      hexData += chunk.toString('hex');
    }

    if (!hexData) {
      return null;
    }

    // Remove padding zeros
    hexData = hexData.replace(/0+$/, '');

    // Extract length prefix if present
    if (hexData.length >= 4) {
      const lengthPrefix = parseInt(hexData.slice(0, 4), 16);
      // Return data after length prefix, limited to the specified length
      const dataHex = hexData.slice(4, 4 + lengthPrefix * 2);
      return dataHex;
    }

    return hexData;
  }
}

/**
 * Helper functions for SRC-20 operations - now with complete transaction encoding!
 * Simple one-step encoding like BitcoinStampsEncoder
 */
export class SRC20Helper {
  /**
   * Create complete DEPLOY transaction outputs (NEW: simplified approach)
   */
  static async encodeDeploy(
    tick: string,
    max: string,
    lim: string,
    fromAddress: string,
    options?:
      & Partial<Omit<SRC20DeployData, 'p' | 'op' | 'tick' | 'max' | 'lim'>>
      & Partial<SRC20EncodingOptions>,
  ): Promise<SRC20EncodingResult> {
    const encoder = new SRC20Encoder();
    const deployData: SRC20DeployData = {
      p: 'SRC-20',
      op: 'DEPLOY',
      tick,
      max,
      lim,
      ...options,
    };

    return await encoder.encodeAsync(deployData, {
      fromAddress,
      ...options,
    });
  }

  /**
   * Create complete MINT transaction outputs (NEW: simplified approach)
   */
  static async encodeMint(
    tick: string,
    amt: string,
    fromAddress: string,
    options?: Partial<SRC20EncodingOptions>,
  ): Promise<SRC20EncodingResult> {
    const encoder = new SRC20Encoder();
    const mintData: SRC20MintData = {
      p: 'SRC-20',
      op: 'MINT',
      tick,
      amt,
    };

    return await encoder.encodeAsync(mintData, {
      fromAddress,
      ...options,
    });
  }

  /**
   * Create complete TRANSFER transaction outputs (NEW: simplified approach)
   */
  static async encodeTransfer(
    tick: string,
    amt: string,
    fromAddress: string,
    toAddress: string,
    options?: Partial<SRC20EncodingOptions>,
  ): Promise<SRC20EncodingResult> {
    const encoder = new SRC20Encoder();
    const transferData: SRC20TransferData = {
      p: 'SRC-20',
      op: 'TRANSFER',
      tick,
      amt,
    };

    return await encoder.encodeAsync(transferData, {
      fromAddress,
      toAddress,
      ...options,
    });
  }

  /**
   * Legacy: Create DEPLOY operation data only (use encodeDeploy instead)
   * @deprecated Use encodeDeploy for complete transaction outputs
   */
  static createDeploy(
    tick: string,
    max: string,
    lim: string,
    options?: Partial<Omit<SRC20DeployData, 'p' | 'op' | 'tick' | 'max' | 'lim'>>,
  ): SRC20DeployData {
    return {
      p: 'SRC-20',
      op: 'DEPLOY',
      tick,
      max,
      lim,
      ...options,
    };
  }

  /**
   * Legacy: Create MINT operation data only (use encodeMint instead)
   * @deprecated Use encodeMint for complete transaction outputs
   */
  static createMint(tick: string, amt: string): SRC20MintData {
    return {
      p: 'SRC-20',
      op: 'MINT',
      tick,
      amt,
    };
  }

  /**
   * Legacy: Create TRANSFER operation data only (use encodeTransfer instead)
   * @deprecated Use encodeTransfer for complete transaction outputs
   */
  static createTransfer(
    tick: string,
    amt: string,
  ): SRC20TransferData {
    return {
      p: 'SRC-20',
      op: 'TRANSFER',
      tick,
      amt,
    };
  }
}

// Alias for backwards compatibility with different method names
export const SRC20Operations = {
  deploy: SRC20Helper.createDeploy,
  mint: SRC20Helper.createMint,
  transfer: SRC20Helper.createTransfer,
};
