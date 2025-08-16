/**
 * Enhanced Workflow Test Fixtures
 *
 * Provides realistic test data and utilities for enhanced script functionality testing
 */

import { Buffer } from 'node:buffer';
import * as bitcoin from 'bitcoinjs-lib';
import type { UTXO } from '../../src/interfaces/provider.interface';

/**
 * Interface for test scenarios and benchmarks
 */
export interface BenchmarkScenario {
  name: string;
  description: string;
  expectedSavingsRange: [number, number]; // [min, max] percentage
  complexity: 'low' | 'medium' | 'high';
}

export interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: number;
  savingsPercentage: number;
  transactionSize: number;
  optimizationsApplied: string[];
}

/**
 * Create mock stamp image data with realistic properties
 */
export function createMockStampImageData(
  format: 'png' | 'gif' | 'jpeg' | 'webp',
  width: number = 24,
  height: number = 24,
  targetSize: number = 2048,
): Buffer {
  // Create proper image headers with dimension information
  let header: Buffer;
  let dimensionMetadataSize = 0;

  if (format === 'png') {
    // PNG signature (8 bytes) + IHDR chunk (25 bytes)
    const pngSignature = Buffer.from([
      0x89,
      0x50,
      0x4E,
      0x47,
      0x0D,
      0x0A,
      0x1A,
      0x0A,
    ]);

    // IHDR chunk: length (4) + type (4) + data (13) + CRC (4) = 25 bytes
    const ihdrLength = Buffer.alloc(4);
    ihdrLength.writeUInt32BE(13, 0); // IHDR data is 13 bytes

    const ihdrType = Buffer.from('IHDR', 'ascii');

    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0); // Width (bytes 0-3)
    ihdrData.writeUInt32BE(height, 4); // Height (bytes 4-7)
    ihdrData.writeUInt8(8, 8); // Bit depth
    ihdrData.writeUInt8(2, 9); // Color type (RGB)
    ihdrData.writeUInt8(0, 10); // Compression method
    ihdrData.writeUInt8(0, 11); // Filter method
    ihdrData.writeUInt8(0, 12); // Interlace method

    // Simple CRC placeholder (in real PNG this would be calculated)
    const ihdrCrc = Buffer.from([0x00, 0x00, 0x00, 0x00]);

    header = Buffer.concat([
      pngSignature,
      ihdrLength,
      ihdrType,
      ihdrData,
      ihdrCrc,
    ]);
    dimensionMetadataSize = header.length;
  } else if (format === 'gif') {
    // GIF signature (6 bytes) + logical screen descriptor (7 bytes)
    const gifSignature = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
    const logicalScreenDescriptor = Buffer.alloc(7);
    logicalScreenDescriptor.writeUInt16LE(width, 0); // Width (little-endian)
    logicalScreenDescriptor.writeUInt16LE(height, 2); // Height (little-endian)
    logicalScreenDescriptor.writeUInt8(0, 4); // Global color table info
    logicalScreenDescriptor.writeUInt8(0, 5); // Background color index
    logicalScreenDescriptor.writeUInt8(0, 6); // Pixel aspect ratio

    header = Buffer.concat([gifSignature, logicalScreenDescriptor]);
    dimensionMetadataSize = header.length;
  } else {
    // For JPEG and WEBP, use simple headers (full implementation would be complex)
    const headers = {
      jpeg: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
      webp: Buffer.from([0x52, 0x49, 0x46, 0x46]),
    };
    header = headers[format as 'jpeg' | 'webp'];
    dimensionMetadataSize = header.length;
  }

  const remainingSize = Math.max(0, targetSize - dimensionMetadataSize);

  // Create pseudo-realistic image data with patterns that can benefit from compression
  const imageData = Buffer.alloc(remainingSize);

  // Fill with patterns that simulate image data
  if (format === 'png') {
    // PNG-like patterns: some repetition, some randomness
    for (let i = 0; i < remainingSize; i += 4) {
      const pixelGroup = i % 256;
      imageData[i] = pixelGroup; // R
      imageData[i + 1] = (pixelGroup + 50) % 256; // G
      imageData[i + 2] = (pixelGroup + 100) % 256; // B
      imageData[i + 3] = 255; // A
    }
  } else if (format === 'gif') {
    // GIF-like patterns: more repetitive (palette-based)
    const palette = [0x00, 0x33, 0x66, 0x99, 0xCC, 0xFF];
    for (let i = 0; i < remainingSize; i++) {
      imageData[i] = palette[i % palette.length];
    }
  } else if (format === 'jpeg') {
    // JPEG-like patterns: less repetitive, more compressed
    for (let i = 0; i < remainingSize; i++) {
      imageData[i] = Math.floor(Math.sin(i / 100) * 128) + 128;
    }
  } else {
    // WebP or other: mixed patterns
    for (let i = 0; i < remainingSize; i++) {
      if (i % 10 === 0) {
        imageData[i] = i % 256; // Some structure
      } else {
        imageData[i] = Math.floor(Math.random() * 256); // Some randomness
      }
    }
  }

  return Buffer.concat([header, imageData]);
}

/**
 * Create realistic UTXO sets for testing
 */
export function createMockUTXOs(
  count: number,
  minValue: number = 10000,
  maxValue: number = 100000,
  network: 'mainnet' | 'testnet' = 'testnet',
): UTXO[] {
  const utxos: UTXO[] = [];

  for (let i = 0; i < count; i++) {
    const value = Math.floor(Math.random() * (maxValue - minValue)) + minValue;
    const confirmations = Math.floor(Math.random() * 50) + 1;

    // Create realistic script types
    const scriptTypes = ['P2WPKH', 'P2PKH', 'P2SH'];
    const scriptType = scriptTypes[i % scriptTypes.length];

    let scriptPubKey: string;

    if (scriptType === 'P2WPKH') {
      // OP_0 + 20-byte pubkey hash
      const pubkeyHash = Buffer.alloc(20);
      pubkeyHash.fill(i); // Deterministic but varied
      scriptPubKey = Buffer.concat([Buffer.from([0x00, 0x14]), pubkeyHash])
        .toString('hex');
    } else if (scriptType === 'P2PKH') {
      // OP_DUP OP_HASH160 + 20-byte pubkey hash + OP_EQUALVERIFY OP_CHECKSIG
      const pubkeyHash = Buffer.alloc(20);
      pubkeyHash.fill(i + 50);
      scriptPubKey = Buffer.concat([
        Buffer.from([0x76, 0xa9, 0x14]),
        pubkeyHash,
        Buffer.from([0x88, 0xac]),
      ]).toString('hex');
    } else {
      // P2SH: OP_HASH160 + 20-byte script hash + OP_EQUAL
      const scriptHash = Buffer.alloc(20);
      scriptHash.fill(i + 100);
      scriptPubKey = Buffer.concat([
        Buffer.from([0xa9, 0x14]),
        scriptHash,
        Buffer.from([0x87]),
      ]).toString('hex');
    }

    utxos.push({
      txid: Buffer.alloc(32, i + 1).toString('hex'),
      vout: i % 4,
      value,
      scriptPubKey,
      confirmations,
      address: generateMockAddress(network, scriptType),
      scriptType: scriptType as any,
    });
  }

  return utxos;
}

/**
 * Generate mock addresses for different script types
 */
function generateMockAddress(
  network: 'mainnet' | 'testnet',
  scriptType: string,
): string {
  const isTestnet = network === 'testnet';

  switch (scriptType) {
    case 'P2WPKH':
      return isTestnet
        ? 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
        : 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
    case 'P2PKH':
      return isTestnet
        ? 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn'
        : '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    case 'P2SH':
      return isTestnet
        ? '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc'
        : '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
    default:
      return isTestnet
        ? 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
        : 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
  }
}

/**
 * Calculate savings percentage between two values
 */
export function calculateSavingsPercentage(
  original: number,
  optimized: number,
): number {
  if (original <= 0) return 0;
  return ((original - optimized) / original) * 100;
}

/**
 * Create realistic stamp collection data for testing
 */
export function createRealisticStampCollection(
  collectionSize: number,
  options: {
    formats?: ('png' | 'gif' | 'jpeg')[];
    sizeRange?: [number, number];
    dimensionsRange?: [number, number];
    theme?: 'uniform' | 'varied' | 'similar';
  } = {},
): Buffer[] {
  const {
    formats = ['png', 'gif', 'jpeg'],
    sizeRange = [500, 8000],
    dimensionsRange = [16, 24],
    theme = 'varied',
  } = options;

  const collection: Buffer[] = [];

  for (let i = 0; i < collectionSize; i++) {
    let format: 'png' | 'gif' | 'jpeg';
    let size: number;
    let dimensions: number;

    switch (theme) {
      case 'uniform':
        // All stamps similar format and size
        format = formats[0];
        size = sizeRange[0] + ((sizeRange[1] - sizeRange[0]) * 0.1);
        dimensions = dimensionsRange[1];
        break;

      case 'similar':
        // Stamps have some variation but are mostly similar
        format = formats[i % Math.min(2, formats.length)];
        size = sizeRange[0] + ((sizeRange[1] - sizeRange[0]) * 0.3) + (i * 100);
        dimensions = dimensionsRange[1] - (i % 3);
        break;

      default: // 'varied'
        // Maximum variation
        format = formats[i % formats.length];
        size = sizeRange[0] +
          Math.floor(Math.random() * (sizeRange[1] - sizeRange[0]));
        dimensions = dimensionsRange[0] +
          Math.floor(Math.random() * (dimensionsRange[1] - dimensionsRange[0]));
    }

    collection.push(
      createMockStampImageData(format, dimensions, dimensions, size),
    );
  }

  return collection;
}

/**
 * Predefined benchmark scenarios for consistent testing
 */
export const BENCHMARK_SCENARIOS: BenchmarkScenario[] = [
  {
    name: 'Single Small Stamp',
    description: 'Individual stamp under 1KB',
    expectedSavingsRange: [2, 5],
    complexity: 'low',
  },
  {
    name: 'Single Medium Stamp',
    description: 'Individual stamp 1-4KB',
    expectedSavingsRange: [4, 8],
    complexity: 'low',
  },
  {
    name: 'Single Large Stamp',
    description: 'Individual stamp 4-8KB',
    expectedSavingsRange: [6, 12],
    complexity: 'medium',
  },
  {
    name: 'Small Batch',
    description: '3-5 stamps in batch',
    expectedSavingsRange: [10, 18],
    complexity: 'medium',
  },
  {
    name: 'Medium Batch',
    description: '6-15 stamps in batch',
    expectedSavingsRange: [15, 25],
    complexity: 'medium',
  },
  {
    name: 'Large Batch',
    description: '16-50 stamps in batch',
    expectedSavingsRange: [20, 35],
    complexity: 'high',
  },
  {
    name: 'Collection Drop',
    description: 'Large collection with similar stamps',
    expectedSavingsRange: [25, 40],
    complexity: 'high',
  },
  {
    name: 'Mixed Operations',
    description: 'Combination of single and batch operations',
    expectedSavingsRange: [12, 22],
    complexity: 'high',
  },
];

/**
 * Mock performance metrics for baseline comparisons
 */
export function createMockPerformanceBaseline(): PerformanceMetrics {
  return {
    executionTime: 1500, // 1.5 seconds baseline
    memoryUsage: 50 * 1024 * 1024, // 50MB baseline
    savingsPercentage: 0, // No savings for baseline
    transactionSize: 250, // Typical transaction size
    optimizationsApplied: [],
  };
}

/**
 * Create mock SRC-20 operation data
 */
export function createMockSRC20Operations(): Array<{
  operation: 'DEPLOY' | 'MINT' | 'TRANSFER';
  params: any;
  expectedOptimizations: string[];
}> {
  return [
    {
      operation: 'DEPLOY',
      params: {
        tick: 'TEST',
        max: '1000000',
        lim: '10000',
        dec: 0,
        description: 'Test SRC-20 Token',
      },
      expectedOptimizations: ['dust_management'],
    },
    {
      operation: 'MINT',
      params: {
        tick: 'TEST',
        amt: '5000',
      },
      expectedOptimizations: ['dust_management'],
    },
    {
      operation: 'TRANSFER',
      params: {
        tick: 'TEST',
        amt: '1000',
      },
      expectedOptimizations: ['dust_management'],
    },
  ];
}

/**
 * Create realistic network condition scenarios
 */
export function createNetworkConditionScenarios(): Array<{
  name: string;
  feeRate: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  expectedOptimizationImpact: number; // Expected additional savings percentage
}> {
  return [
    {
      name: 'Low Congestion',
      feeRate: 5,
      priority: 'low',
      expectedOptimizationImpact: 3, // Lower fees make optimization more impactful percentage-wise
    },
    {
      name: 'Normal Congestion',
      feeRate: 15,
      priority: 'medium',
      expectedOptimizationImpact: 2,
    },
    {
      name: 'High Congestion',
      feeRate: 50,
      priority: 'high',
      expectedOptimizationImpact: 1.5, // Higher fees make optimization less impactful percentage-wise
    },
    {
      name: 'Emergency',
      feeRate: 100,
      priority: 'urgent',
      expectedOptimizationImpact: 1,
    },
  ];
}

/**
 * Create test data for compression effectiveness testing
 */
export function createCompressionTestData(): Array<{
  name: string;
  data: Buffer;
  expectedCompressionRatio: number; // 0-1, lower is better compression
  algorithm: string;
}> {
  return [
    {
      name: 'Highly Compressible (Repeated Pattern)',
      data: Buffer.alloc(4096, 0x42), // All same byte
      expectedCompressionRatio: 0.1, // Expect 90% compression
      algorithm: 'rle',
    },
    {
      name: 'Moderately Compressible (PNG-like)',
      data: createMockStampImageData('png', 24, 24, 2048),
      expectedCompressionRatio: 0.7, // Expect 30% compression
      algorithm: 'gzip',
    },
    {
      name: 'Low Compressibility (Random Data)',
      data: Buffer.from(
        Array.from({ length: 2048 }, () => Math.floor(Math.random() * 256)),
      ),
      expectedCompressionRatio: 0.95, // Expect 5% compression
      algorithm: 'custom',
    },
    {
      name: 'Medium Compressibility (Structured Data)',
      data: (() => {
        const structured = Buffer.alloc(3072);
        for (let i = 0; i < structured.length; i += 3) {
          structured[i] = (i / 3) % 256;
          structured[i + 1] = ((i / 3) + 50) % 256;
          structured[i + 2] = ((i / 3) + 100) % 256;
        }
        return structured;
      })(),
      expectedCompressionRatio: 0.5, // Expect 50% compression
      algorithm: 'lz4',
    },
  ];
}

/**
 * Validate performance metrics against expected ranges
 */
export function validatePerformanceMetrics(
  actual: PerformanceMetrics,
  expected: {
    maxExecutionTime?: number;
    minSavingsPercentage?: number;
    maxTransactionSize?: number;
    requiredOptimizations?: string[];
  },
): {
  isValid: boolean;
  violations: string[];
  score: number; // 0-100
} {
  const violations: string[] = [];
  let score = 100;

  if (
    expected.maxExecutionTime &&
    actual.executionTime > expected.maxExecutionTime
  ) {
    violations.push(
      `Execution time ${actual.executionTime}ms exceeds limit ${expected.maxExecutionTime}ms`,
    );
    score -= 20;
  }

  if (
    expected.minSavingsPercentage &&
    actual.savingsPercentage < expected.minSavingsPercentage
  ) {
    violations.push(
      `Savings ${actual.savingsPercentage}% below minimum ${expected.minSavingsPercentage}%`,
    );
    score -= 30;
  }

  if (
    expected.maxTransactionSize &&
    actual.transactionSize > expected.maxTransactionSize
  ) {
    violations.push(
      `Transaction size ${actual.transactionSize} exceeds limit ${expected.maxTransactionSize}`,
    );
    score -= 15;
  }

  if (expected.requiredOptimizations) {
    const missing = expected.requiredOptimizations.filter((opt) =>
      !actual.optimizationsApplied.includes(opt)
    );
    if (missing.length > 0) {
      violations.push(`Missing required optimizations: ${missing.join(', ')}`);
      score -= missing.length * 10;
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
    score: Math.max(0, score),
  };
}

/**
 * Create edge case test scenarios for robustness testing
 */
export function createEdgeCaseScenarios(): Array<{
  name: string;
  description: string;
  setup: () => any;
  expectation: 'success' | 'graceful_failure' | 'optimization_minimal';
}> {
  return [
    {
      name: 'Minimal Size Stamp',
      description: 'Stamp with minimal viable size',
      setup: () => ({
        imageData: createMockStampImageData('png', 1, 1, 100),
        utxos: createMockUTXOs(1, 100000, 100000),
      }),
      expectation: 'success',
    },
    {
      name: 'Maximum Size Stamp',
      description: 'Stamp at maximum allowed size',
      setup: () => ({
        imageData: createMockStampImageData('png', 24, 24, 8192), // 8KB limit
        utxos: createMockUTXOs(2, 200000, 300000),
      }),
      expectation: 'success',
    },
    {
      name: 'Insufficient UTXOs',
      description: 'UTXOs with insufficient total value',
      setup: () => ({
        imageData: createMockStampImageData('png', 24, 24, 2048),
        utxos: createMockUTXOs(2, 1000, 2000), // Very small UTXOs
      }),
      expectation: 'graceful_failure',
    },
    {
      name: 'Incompressible Data',
      description: 'Data that cannot be compressed effectively',
      setup: () => ({
        imageData: Buffer.from(
          Array.from({ length: 4096 }, () => Math.floor(Math.random() * 256)),
        ),
        utxos: createMockUTXOs(3, 50000, 100000),
      }),
      expectation: 'optimization_minimal',
    },
    {
      name: 'Single Large UTXO',
      description: 'Only one very large UTXO available',
      setup: () => ({
        imageData: createMockStampImageData('png', 24, 24, 2048),
        utxos: createMockUTXOs(1, 1000000, 1000000), // 1M sats
      }),
      expectation: 'success',
    },
  ];
}

/**
 * Calculate consistency score across multiple benchmark runs
 */
export function calculateConsistencyScore(results: number[]): number {
  if (results.length < 2) return 100;

  const mean = results.reduce((sum, val) => sum + val, 0) / results.length;
  const variance = results.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    results.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / mean;

  // Convert coefficient of variation to consistency score (0-100, higher is better)
  return Math.max(0, 100 - (coefficientOfVariation * 100));
}

/**
 * Generate realistic transaction history for advanced testing
 */
export function createMockTransactionHistory(count: number): Array<{
  txid: string;
  size: number;
  fee: number;
  feeRate: number;
  timestamp: Date;
  confirmed: boolean;
  optimizationsUsed: string[];
  savingsAchieved: number;
}> {
  const history = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const size = 200 + Math.floor(Math.random() * 800); // 200-1000 bytes
    const feeRate = 5 + Math.floor(Math.random() * 45); // 5-50 sats/vB
    const fee = size * feeRate;

    const optimizations = ['dust_management'];
    if (Math.random() > 0.5) optimizations.push('witness_compression');
    if (Math.random() > 0.7) optimizations.push('batch_consolidation');

    const savingsAchieved = optimizations.length * (2 + Math.random() * 8); // 2-10% per optimization

    history.push({
      txid: Buffer.alloc(32, i).toString('hex'),
      size,
      fee: Math.floor(fee * (1 - savingsAchieved / 100)), // Apply savings to fee
      feeRate,
      timestamp: new Date(now.getTime() - (i * 3600000)), // 1 hour intervals
      confirmed: Math.random() > 0.1, // 90% confirmation rate
      optimizationsUsed: optimizations,
      savingsAchieved,
    });
  }

  return history;
}
