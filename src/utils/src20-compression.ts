/**
 * SRC-20 Compression Utilities
 *
 * Provides zlib compression and msgpack encoding for SRC-20 data
 * to reduce transaction size and costs. Compatible with BTCStampsExplorer
 * decodeSrc20OlgaTx decoder which supports both compressed and uncompressed formats.
 */

import { Buffer } from 'node:buffer';
import * as zlib from 'node:zlib';
import { promisify } from 'node:util';
import * as msgpack from 'msgpack-lite';

const zlibDeflate = promisify(zlib.deflate);
const zlibInflate = promisify(zlib.inflate);

export interface SRC20CompressionOptions {
  /** Enable zlib compression (default: true for large data) */
  useCompression?: boolean;
  /** Enable msgpack encoding (default: true when compression is used) */
  useMsgpack?: boolean;
  /** Compression level 0-9 (default: 9 for maximum compression) */
  compressionLevel?: number;
  /** Auto-compress if data exceeds this size (default: 100 bytes) */
  compressionThreshold?: number;
  /** Force compression even for small data */
  forceCompression?: boolean;
}

export interface SRC20CompressionResult {
  /** Compressed/encoded data ready for P2WSH embedding */
  data: Buffer;
  /** Original JSON string */
  originalJson: string;
  /** Original size in bytes */
  originalSize: number;
  /** Compressed size in bytes */
  compressedSize: number;
  /** Compression ratio (0-1, higher is better) */
  compressionRatio: number;
  /** Whether compression was applied */
  compressed: boolean;
  /** Whether msgpack was used */
  msgpacked: boolean;
  /** Estimated P2WSH outputs needed */
  estimatedOutputs: number;
  /** Estimated transaction cost savings */
  costSavings: {
    outputsReduced: number;
    satsSaved: number;
  };
}

export interface SRC20DecompressionResult {
  /** Decompressed JSON data */
  data: any;
  /** JSON string representation */
  jsonString: string;
  /** Whether data was compressed */
  wasCompressed: boolean;
  /** Whether msgpack was used */
  wasMsgpacked: boolean;
  /** Original compressed size */
  compressedSize: number;
  /** Decompressed size */
  decompressedSize: number;
}

/**
 * SRC-20 Compression Service
 *
 * Handles compression and decompression of SRC-20 JSON data
 * for efficient storage in Bitcoin transactions.
 */
export class SRC20CompressionService {
  private static readonly STAMP_PREFIX = 'stamp:';
  private static readonly CHUNK_SIZE = 32; // P2WSH data size per output
  private static readonly DUST_VALUE = 330; // Standard dust value per output
  private static readonly DEFAULT_THRESHOLD = 100; // Auto-compress above 100 bytes

  /**
   * Compress SRC-20 data for transaction embedding
   */
  static async compress(
    jsonData: string | object,
    options: SRC20CompressionOptions = {},
  ): Promise<SRC20CompressionResult> {
    // Convert to JSON string if needed
    const jsonString = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);

    const originalSize = Buffer.byteLength(jsonString, 'utf8');

    // Determine compression settings
    const opts = {
      compressionThreshold: this.DEFAULT_THRESHOLD,
      compressionLevel: 9,
      ...options,
    };

    // Auto-enable compression for large data or when explicitly requested
    const shouldCompress = opts.forceCompression ||
      opts.useCompression === true ||
      (opts.useCompression !== false && originalSize >= opts.compressionThreshold);

    // Allow msgpack to be used independently when explicitly requested
    const shouldUseMsgpack = (shouldCompress || opts.useMsgpack === true) &&
      opts.useMsgpack !== false;

    let processedData: Buffer;
    let compressed = false;
    let msgpacked = false;

    try {
      // Handle msgpack encoding first if requested
      if (shouldUseMsgpack) {
        try {
          const parsedData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
          processedData = Buffer.from(msgpack.encode(parsedData));
          msgpacked = true;
          console.log(`📦 Msgpack encoding: ${processedData.length} bytes`);
        } catch {
          // If string is not valid JSON, treat as raw string data in an object
          const wrappedData = { data: jsonData };
          processedData = Buffer.from(msgpack.encode(wrappedData));
          msgpacked = true;
          console.log(`📦 Msgpack encoding (wrapped string): ${processedData.length} bytes`);
        }
      } else {
        // Use UTF-8 encoded JSON
        processedData = Buffer.from(jsonString, 'utf8');
      }

      // Apply compression if requested
      if (shouldCompress) {
        console.log(`🗜️  Compressing data (${processedData.length} bytes)...`);

        const compressedData = await zlibDeflate(processedData, {
          level: opts.compressionLevel,
        });

        console.log(`   🎯 Compressed to: ${compressedData.length} bytes`);

        // If compression made it larger, use original (unless forced or explicitly requested)
        if (
          compressedData.length >= processedData.length && !opts.forceCompression &&
          opts.useCompression !== true
        ) {
          console.log(`   ⚠️  Compression ineffective, using original`);
          // Keep processedData as is (msgpack or JSON)
        } else {
          if (compressedData.length >= processedData.length) {
            console.log(`   ⚠️  Compression ineffective, but using compressed data as requested`);
          } else {
            console.log(`   ✅ Using compressed data`);
          }
          processedData = compressedData;
          compressed = true;
        }
      }
    } catch (error) {
      console.error('Compression failed, using uncompressed data:', error);
      processedData = Buffer.from(jsonString, 'utf8');
      compressed = false;
      // Keep msgpacked = true if msgpack was attempted before the error
    }

    // Add stamp: prefix
    const stampPrefix = Buffer.from(this.STAMP_PREFIX, 'utf8');
    const finalData = Buffer.concat([stampPrefix, processedData]);

    // Calculate metrics
    const compressedSize = finalData.length;
    const compressionRatio = compressed ? (originalSize - compressedSize) / originalSize : 0;

    // Calculate P2WSH outputs needed
    const originalOutputs = Math.ceil(
      (originalSize + stampPrefix.length + 2) / this.CHUNK_SIZE,
    );
    const compressedOutputs = Math.ceil((compressedSize + 2) / this.CHUNK_SIZE); // +2 for length prefix
    const outputsReduced = Math.max(0, originalOutputs - compressedOutputs);
    const satsSaved = outputsReduced * this.DUST_VALUE;

    return {
      data: finalData,
      originalJson: jsonString,
      originalSize,
      compressedSize,
      compressionRatio,
      compressed,
      msgpacked,
      estimatedOutputs: compressedOutputs,
      costSavings: {
        outputsReduced,
        satsSaved,
      },
    };
  }

  /**
   * Decompress SRC-20 data from transaction
   */
  static async decompress(
    data: Buffer | Uint8Array,
  ): Promise<SRC20DecompressionResult> {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const compressedSize = dataBuffer.length;

    // Remove stamp: prefix if present
    let processedData = dataBuffer;
    if (
      dataBuffer.toString('utf8', 0, this.STAMP_PREFIX.length) ===
        this.STAMP_PREFIX
    ) {
      processedData = dataBuffer.slice(this.STAMP_PREFIX.length);
    }

    let decompressedData: any;
    let wasCompressed = false;
    let wasMsgpacked = false;
    let jsonString = '';

    try {
      // Try to decompress with zlib
      const inflated = await zlibInflate(processedData);
      wasCompressed = true;

      // Try to decode as JSON first (more common for compressed data)
      try {
        jsonString = inflated.toString('utf8');
        decompressedData = JSON.parse(jsonString);
        console.log('✅ Decompressed JSON data');
      } catch (jsonError) {
        console.log('🚫 Not JSON data, trying msgpack...');
        // Try to decode as msgpack
        try {
          decompressedData = msgpack.decode(inflated);
          wasMsgpacked = true;
          console.log('🎯 Decoded msgpack data:', decompressedData);
          // Check if this is wrapped string data
          if (
            decompressedData && typeof decompressedData === 'object' && decompressedData.data &&
            Object.keys(decompressedData).length === 1
          ) {
            // This was a wrapped string, unwrap it
            jsonString = typeof decompressedData.data === 'string'
              ? decompressedData.data
              : JSON.stringify(decompressedData.data);
            decompressedData = decompressedData.data;
          } else {
            jsonString = JSON.stringify(decompressedData);
          }
          console.log('✅ Decompressed and decoded msgpack data');
        } catch (msgpackError) {
          console.error('Failed to parse decompressed data as JSON or msgpack:', {
            jsonError,
            msgpackError,
          });
          // Fall back to raw string
          decompressedData = jsonString;
          console.log('✅ Using raw decompressed string data');
        }
      }
    } catch {
      // Not compressed, try direct parsing
      try {
        // Try JSON first
        jsonString = processedData.toString('utf8');
        decompressedData = JSON.parse(jsonString);
        console.log('✅ Parsed uncompressed JSON data');
      } catch (jsonError) {
        console.log('🚫 Not JSON data, trying msgpack...');
        // Try msgpack
        try {
          decompressedData = msgpack.decode(processedData);
          wasMsgpacked = true;
          // Check if this is wrapped string data
          if (
            decompressedData && typeof decompressedData === 'object' && decompressedData.data &&
            Object.keys(decompressedData).length === 1
          ) {
            // This was a wrapped string, unwrap it
            jsonString = typeof decompressedData.data === 'string'
              ? decompressedData.data
              : JSON.stringify(decompressedData.data);
            decompressedData = decompressedData.data;
          } else {
            jsonString = JSON.stringify(decompressedData);
          }
          console.log('✅ Decoded uncompressed msgpack data');
        } catch (msgpackError) {
          console.error('Failed to parse as JSON or msgpack:', { jsonError, msgpackError });
          // Fall back to raw string
          decompressedData = jsonString;
          console.log('✅ Using raw string data');
        }
      }
    }

    return {
      data: decompressedData,
      jsonString,
      wasCompressed,
      wasMsgpacked,
      compressedSize,
      decompressedSize: Buffer.byteLength(jsonString, 'utf8'),
    };
  }

  /**
   * Analyze compression benefits for SRC-20 data
   */
  static analyzeCompressionBenefits(
    jsonData: string | object,
  ): {
    originalSize: number;
    estimatedCompressedSize: number;
    estimatedSavings: number;
    outputsOriginal: number;
    outputsCompressed: number;
    outputsSaved: number;
    satsSaved: number;
    recommendCompression: boolean;
    analysis: string[];
  } {
    const jsonString = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);

    const originalSize = Buffer.byteLength(jsonString, 'utf8');

    // Estimate compression ratio based on JSON structure
    // Typical JSON compresses to 20-40% of original size
    const hasRepeatingKeys = /("p"|"op"|"tick"|"amt"|"max"|"lim"|"dec")/.test(
      jsonString,
    );
    const hasLongStrings = jsonString.includes('description') ||
      jsonString.includes('img');

    let estimatedRatio = 0.3; // Default 30% of original
    if (hasRepeatingKeys) estimatedRatio *= 0.8; // Better compression
    if (hasLongStrings) estimatedRatio *= 0.9; // Slightly better

    const estimatedCompressedSize = Math.ceil(originalSize * estimatedRatio);
    const estimatedSavings = originalSize - estimatedCompressedSize;

    // Calculate P2WSH outputs
    const stampPrefixSize = this.STAMP_PREFIX.length;
    const lengthPrefixSize = 2;

    const outputsOriginal = Math.ceil(
      (originalSize + stampPrefixSize + lengthPrefixSize) / this.CHUNK_SIZE,
    );
    const outputsCompressed = Math.ceil(
      (estimatedCompressedSize + stampPrefixSize + lengthPrefixSize) /
        this.CHUNK_SIZE,
    );
    const outputsSaved = outputsOriginal - outputsCompressed;
    const satsSaved = outputsSaved * this.DUST_VALUE;

    const analysis: string[] = [];
    analysis.push(`📊 Original size: ${originalSize} bytes`);
    analysis.push(`🗜️  Estimated compressed: ${estimatedCompressedSize} bytes`);
    analysis.push(
      `💾 Estimated savings: ${estimatedSavings} bytes (${
        Math.round((1 - estimatedRatio) * 100)
      }%)`,
    );
    analysis.push(
      `📤 Outputs needed: ${outputsOriginal} → ${outputsCompressed} (${outputsSaved} saved)`,
    );
    analysis.push(`💰 Cost savings: ${satsSaved} sats`);

    const recommendCompression = originalSize >= this.DEFAULT_THRESHOLD &&
      outputsSaved > 0;

    if (recommendCompression) {
      analysis.push(`✅ Compression recommended`);
    } else if (originalSize < this.DEFAULT_THRESHOLD) {
      analysis.push(`ℹ️  Data too small to benefit from compression`);
    } else {
      analysis.push(`⚠️  Compression may not provide significant benefits`);
    }

    return {
      originalSize,
      estimatedCompressedSize,
      estimatedSavings,
      outputsOriginal,
      outputsCompressed,
      outputsSaved,
      satsSaved,
      recommendCompression,
      analysis,
    };
  }

  /**
   * Test compression round-trip
   */
  static async testCompressionRoundTrip(
    jsonData: string | object,
    options?: SRC20CompressionOptions,
  ): Promise<{
    success: boolean;
    originalData: any;
    compressedSize: number;
    decompressedData: any;
    dataMatches: boolean;
    compressed?: SRC20CompressionResult;
    decompressed?: SRC20DecompressionResult;
    error?: string;
  }> {
    try {
      // Compress
      const compressed = await this.compress(jsonData, options);

      // Decompress
      const decompressed = await this.decompress(compressed.data);

      // Parse original data
      let originalData: any;
      try {
        originalData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      } catch {
        // If not valid JSON, use the original string data
        originalData = jsonData;
      }

      const dataMatches = JSON.stringify(originalData) === JSON.stringify(decompressed.data);

      return {
        success: true,
        originalData,
        compressedSize: compressed.compressedSize,
        decompressedData: decompressed.data,
        dataMatches,
        compressed,
        decompressed,
      };
    } catch (error) {
      return {
        success: false,
        originalData: jsonData,
        compressedSize: 0,
        decompressedData: null,
        dataMatches: false,
        error: (error as Error).message,
      };
    }
  }
}

/**
 * Integration with SRC20Encoder
 */
export class CompressedSRC20Encoder {
  /**
   * Encode SRC-20 data with optional compression
   */
  static async encodeWithCompression(
    data: any,
    options?: { compressionOptions?: SRC20CompressionOptions },
  ): Promise<{
    outputs: Array<{ script: Buffer; value: number }>;
    compressionResult: SRC20CompressionResult;
    encoding: {
      compressed: boolean;
      originalSize: number;
      finalSize: number;
      outputCount: number;
    };
  }> {
    // Compress the data
    const compressionResult = await SRC20CompressionService.compress(
      data,
      options?.compressionOptions,
    );

    // Prepare data for P2WSH encoding
    const dataWithPrefix = compressionResult.data;

    // Add length prefix (2 bytes)
    const lengthPrefix = Buffer.alloc(2);
    lengthPrefix.writeUInt16BE(dataWithPrefix.length, 0);

    const finalData = Buffer.concat([lengthPrefix, dataWithPrefix]);

    // Split into P2WSH chunks
    const outputs: Array<{ script: Buffer; value: number }> = [];
    const CHUNK_SIZE = 32;

    for (let i = 0; i < finalData.length; i += CHUNK_SIZE) {
      const chunk = finalData.slice(i, i + CHUNK_SIZE);

      // Pad to 32 bytes if needed
      const paddedChunk = Buffer.alloc(CHUNK_SIZE);
      chunk.copy(paddedChunk);

      // Create P2WSH script
      const script = Buffer.concat([
        Buffer.from([0x00, 0x20]), // OP_0 + PUSH 32
        paddedChunk,
      ]);

      outputs.push({
        script,
        value: 330, // Standard dust value
      });
    }

    return {
      outputs,
      compressionResult,
      encoding: {
        compressed: compressionResult.compressed,
        originalSize: compressionResult.originalSize,
        finalSize: compressionResult.compressedSize,
        outputCount: outputs.length,
      },
    };
  }
}
