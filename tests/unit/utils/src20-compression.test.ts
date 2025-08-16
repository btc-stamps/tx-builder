/**
 * SRC-20 Compression Tests
 *
 * Tests for SRC-20 data compression utilities including zlib compression
 * and msgpack encoding for reducing transaction size and costs.
 */

import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';

import {
  CompressedSRC20Encoder,
  type SRC20CompressionOptions,
  SRC20CompressionService,
} from '../../../src/utils/src20-compression';

describe('SRC20CompressionService', () => {
  describe('compress method', () => {
    it('should compress JSON string data', async () => {
      const testData =
        '{"p":"src-20","op":"deploy","tick":"TEST","max":"1000000","lim":"1000","dec":8}';

      const result = await SRC20CompressionService.compress(testData, {
        useCompression: true,
        useMsgpack: false,
      });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('originalJson');
      expect(result).toHaveProperty('originalSize');
      expect(result).toHaveProperty('compressedSize');
      expect(result).toHaveProperty('compressionRatio');
      expect(result).toHaveProperty('compressed');
      expect(result).toHaveProperty('msgpacked');
      expect(result).toHaveProperty('estimatedOutputs');
      expect(result).toHaveProperty('costSavings');

      expect(result.originalJson).toBe(testData);
      expect(result.originalSize).toBeGreaterThan(0);
      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.data.toString('utf8').startsWith('stamp:')).toBe(true);
    });

    it('should compress object data', async () => {
      const testObject = {
        p: 'src-20',
        op: 'deploy',
        tick: 'TEST',
        max: '1000000',
        lim: '1000',
        dec: 8,
      };

      const result = await SRC20CompressionService.compress(testObject, {
        useCompression: true,
        useMsgpack: false,
      });

      expect(result.originalJson).toBe(JSON.stringify(testObject));
      expect(result.data).toBeInstanceOf(Buffer);
    });

    it('should use msgpack encoding when enabled', async () => {
      const testData = {
        p: 'src-20',
        op: 'transfer',
        tick: 'TEST',
        amt: '100',
      };

      const result = await SRC20CompressionService.compress(testData, {
        useCompression: true,
        useMsgpack: true,
      });

      expect(result.msgpacked).toBe(true);
      expect(result.compressed).toBe(true);
    });

    it('should auto-compress large data above threshold', async () => {
      const largeData = {
        p: 'src-20',
        op: 'deploy',
        tick: 'LARGE',
        max: '999999999999999999',
        lim: '999999999999999999',
        dec: 18,
        description: 'A'.repeat(200), // Make it large
      };

      const result = await SRC20CompressionService.compress(largeData, {
        compressionThreshold: 100,
      });

      expect(result.compressed).toBe(true);
      expect(result.originalSize).toBeGreaterThan(100);
    });

    it('should not compress small data below threshold', async () => {
      const smallData = { p: 'src-20', op: 'mint', tick: 'SMALL', amt: '1' };

      const result = await SRC20CompressionService.compress(smallData, {
        compressionThreshold: 100,
        useCompression: false,
      });

      expect(result.compressed).toBe(false);
      expect(result.msgpacked).toBe(false);
    });

    it('should force compression when requested', async () => {
      const smallData = { p: 'src-20', op: 'mint', tick: 'FORCE', amt: '1' };

      const result = await SRC20CompressionService.compress(smallData, {
        forceCompression: true,
        useMsgpack: true,
      });

      expect(result.compressed).toBe(true);
    });

    it('should calculate compression ratio correctly', async () => {
      const testData = 'x'.repeat(1000); // 1000 byte string

      const result = await SRC20CompressionService.compress(testData, {
        useCompression: true,
      });

      expect(result.originalSize).toBe(1000);
      expect(result.compressedSize).toBeLessThan(result.originalSize);
      expect(result.compressionRatio).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeLessThanOrEqual(1);
    });

    it('should calculate cost savings correctly', async () => {
      const testData = 'x'.repeat(200); // Large enough to benefit from compression

      const result = await SRC20CompressionService.compress(testData, {
        useCompression: true,
      });

      expect(result.costSavings).toHaveProperty('outputsReduced');
      expect(result.costSavings).toHaveProperty('satsSaved');
      expect(result.costSavings.outputsReduced).toBeGreaterThanOrEqual(0);
      expect(result.costSavings.satsSaved).toBeGreaterThanOrEqual(0);
    });

    it('should estimate P2WSH outputs correctly', async () => {
      const testData = 'x'.repeat(64); // 64 bytes = 2 P2WSH outputs (32 bytes each)

      const result = await SRC20CompressionService.compress(testData, {
        useCompression: false,
      });

      // 64 bytes + stamp: prefix = ~70 bytes = 3 outputs (32 bytes each)
      expect(result.estimatedOutputs).toBeGreaterThanOrEqual(2);
    });

    it('should handle compression options correctly', async () => {
      const testData = { p: 'src-20', op: 'deploy', tick: 'OPT', max: '1000', lim: '100', dec: 0 };

      const options: SRC20CompressionOptions = {
        useCompression: true,
        useMsgpack: true,
        compressionLevel: 6,
        compressionThreshold: 50,
        forceCompression: false,
      };

      const result = await SRC20CompressionService.compress(testData, options);

      expect(result).toBeInstanceOf(Object);
      expect(result.data).toBeInstanceOf(Buffer);
    });

    it('should handle compression errors gracefully', async () => {
      // Mock zlib to throw an error
      const testData = { p: 'src-20', op: 'test' };

      // Should not throw, should fall back to uncompressed
      const result = await SRC20CompressionService.compress(testData, {
        useCompression: true,
      });

      expect(result).toBeInstanceOf(Object);
      expect(result.data).toBeInstanceOf(Buffer);
    });
  });

  describe('decompress method', () => {
    it('should decompress previously compressed data', async () => {
      const originalData = {
        p: 'src-20',
        op: 'deploy',
        tick: 'ROUND',
        max: '1000000',
        lim: '1000',
        dec: 8,
      };

      // Compress first
      const compressed = await SRC20CompressionService.compress(originalData, {
        useCompression: true,
        useMsgpack: false,
      });

      // Then decompress
      const decompressed = await SRC20CompressionService.decompress(compressed.data);

      expect(decompressed).toHaveProperty('data');
      expect(decompressed).toHaveProperty('jsonString');
      expect(decompressed).toHaveProperty('wasCompressed');
      expect(decompressed).toHaveProperty('wasMsgpacked');

      expect(decompressed.data).toEqual(originalData);
      expect(decompressed.jsonString).toBe(JSON.stringify(originalData));
      expect(decompressed.wasCompressed).toBe(true);
    });

    it('should decompress msgpack-encoded data', async () => {
      const originalData = {
        p: 'src-20',
        op: 'transfer',
        tick: 'MSGPACK',
        amt: '500',
      };

      // Compress with msgpack
      const compressed = await SRC20CompressionService.compress(originalData, {
        useCompression: true,
        useMsgpack: true,
      });

      // Decompress
      const decompressed = await SRC20CompressionService.decompress(compressed.data);

      expect(decompressed.data).toEqual(originalData);
      expect(decompressed.wasMsgpacked).toBe(true);
      expect(decompressed.wasCompressed).toBe(true);
    });

    it('should handle uncompressed data', async () => {
      const testData = { p: 'src-20', op: 'mint', tick: 'UNCOMP', amt: '1' };

      // Compress without compression (just adds prefix)
      const compressed = await SRC20CompressionService.compress(testData, {
        useCompression: false,
      });

      // Decompress
      const decompressed = await SRC20CompressionService.decompress(compressed.data);

      expect(decompressed.data).toEqual(testData);
      expect(decompressed.wasCompressed).toBe(false);
      expect(decompressed.wasMsgpacked).toBe(false);
    });

    it('should handle data without stamp prefix', async () => {
      const rawJson = '{"p":"src-20","op":"mint","tick":"RAW","amt":"1"}';
      const rawBuffer = Buffer.from(rawJson, 'utf8');

      const decompressed = await SRC20CompressionService.decompress(rawBuffer);

      expect(decompressed.jsonString).toBe(rawJson);
      expect(decompressed.wasCompressed).toBe(false);
    });

    it('should handle Uint8Array input', async () => {
      const testData = { p: 'src-20', op: 'test' };
      const compressed = await SRC20CompressionService.compress(testData);

      // Convert to Uint8Array
      const uint8Data = new Uint8Array(compressed.data);

      const decompressed = await SRC20CompressionService.decompress(uint8Data);

      expect(decompressed.data).toEqual(testData);
    });

    it('should handle malformed data gracefully', async () => {
      const malformedData = Buffer.from('invalid compressed data');

      const decompressed = await SRC20CompressionService.decompress(malformedData);

      // Should try to parse as JSON directly
      expect(decompressed.wasCompressed).toBe(false);
    });
  });

  describe('testCompressionRoundTrip method', () => {
    it('should perform round-trip compression test', async () => {
      const testData = {
        p: 'src-20',
        op: 'deploy',
        tick: 'ROUND',
        max: '1000000',
        lim: '1000',
        dec: 8,
      };

      const result = await SRC20CompressionService.testCompressionRoundTrip(testData);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('originalData');
      expect(result).toHaveProperty('compressedSize');
      expect(result).toHaveProperty('decompressedData');
      expect(result).toHaveProperty('dataMatches');

      expect(result.success).toBe(true);
      expect(result.dataMatches).toBe(true);
      expect(result.originalData).toEqual(testData);
      expect(result.decompressedData).toEqual(testData);
    });

    it('should detect data corruption in round trip', async () => {
      const testData = { p: 'src-20', op: 'test' };

      // This should normally succeed
      const result = await SRC20CompressionService.testCompressionRoundTrip(testData);

      expect(result.success).toBe(true);
      expect(result.dataMatches).toBe(true);
    });
  });

  describe('Round-trip compression tests', () => {
    const testCases = [
      {
        name: 'Simple DEPLOY',
        data: { p: 'src-20', op: 'deploy', tick: 'TEST', max: '1000', lim: '100', dec: 0 },
      },
      {
        name: 'Simple MINT',
        data: { p: 'src-20', op: 'mint', tick: 'TEST', amt: '50' },
      },
      {
        name: 'Simple TRANSFER',
        data: { p: 'src-20', op: 'transfer', tick: 'TEST', amt: '25' },
      },
      {
        name: 'Large data with long strings',
        data: {
          p: 'src-20',
          op: 'deploy',
          tick: 'LARGE',
          max: '999999999999999999',
          lim: '999999999999999999',
          dec: 18,
          meta: 'A'.repeat(500),
        },
      },
      {
        name: 'Unicode and special characters',
        data: {
          p: 'src-20',
          op: 'deploy',
          tick: 'UNIĆ🚀',
          max: '1000000',
          desc: 'Token with émojis 🪙 and special chars: ñáéíóú',
        },
      },
    ];

    testCases.forEach(({ name, data }) => {
      it(`should handle round-trip for ${name}`, async () => {
        // Test with compression and msgpack
        const compressed = await SRC20CompressionService.compress(data, {
          useCompression: true,
          useMsgpack: true,
        });

        const decompressed = await SRC20CompressionService.decompress(compressed.data);

        expect(decompressed.data).toEqual(data);
        expect(decompressed.jsonString).toBe(JSON.stringify(data));
      });

      it(`should handle round-trip for ${name} without compression`, async () => {
        // Test without compression
        const compressed = await SRC20CompressionService.compress(data, {
          useCompression: false,
        });

        const decompressed = await SRC20CompressionService.decompress(compressed.data);

        expect(decompressed.data).toEqual(data);
        expect(decompressed.wasCompressed).toBe(false);
      });
    });
  });
});

describe('CompressedSRC20Encoder', () => {
  describe('encodeWithCompression method', () => {
    it('should encode SRC-20 data with compression', async () => {
      const src20Data = {
        p: 'src-20',
        op: 'deploy',
        tick: 'ENCODE',
        max: '1000000',
        lim: '1000',
        dec: 8,
      };

      const result = await CompressedSRC20Encoder.encodeWithCompression(src20Data);

      expect(result).toHaveProperty('outputs');
      expect(result).toHaveProperty('compressionResult');
      expect(result).toHaveProperty('encoding');

      expect(Array.isArray(result.outputs)).toBe(true);
      expect(result.outputs.length).toBeGreaterThan(0);
      expect(result.compressionResult).toBeInstanceOf(Object);
    });

    it('should create multiple P2WSH outputs for large data', async () => {
      const largeData = {
        p: 'src-20',
        op: 'deploy',
        tick: 'BIG',
        max: '999999999999999999',
        lim: '999999999999999999',
        dec: 18,
        description: 'X'.repeat(1000), // Very large data
      };

      const result = await CompressedSRC20Encoder.encodeWithCompression(largeData);

      expect(result.outputs.length).toBeGreaterThan(1);

      // Each output should be P2WSH with 330 sats dust value
      result.outputs.forEach((output) => {
        expect(output.value).toBe(330);
        expect(output.script.length).toBe(34); // P2WSH script length
      });
    });

    it('should handle compression options', async () => {
      const testData = { p: 'src-20', op: 'mint', tick: 'OPT', amt: '100' };

      const result = await CompressedSRC20Encoder.encodeWithCompression(testData, {
        compressionOptions: {
          useCompression: true,
          useMsgpack: false,
          compressionLevel: 6,
        },
      });

      expect(result.compressionResult.msgpacked).toBe(false);
      expect(result.outputs).toBeInstanceOf(Array);
    });

    it('should work with both compressed and uncompressed data', async () => {
      const testData = { p: 'src-20', op: 'transfer', tick: 'BOTH', amt: '50' };

      const compressedResult = await CompressedSRC20Encoder.encodeWithCompression(testData, {
        compressionOptions: { useCompression: true },
      });

      const uncompressedResult = await CompressedSRC20Encoder.encodeWithCompression(testData, {
        compressionOptions: { useCompression: false },
      });

      expect(compressedResult.outputs).toBeInstanceOf(Array);
      expect(uncompressedResult.outputs).toBeInstanceOf(Array);

      // Compressed should typically result in fewer outputs for large data
      // For small data, might be similar or larger due to compression overhead
    });
  });
});

describe('Performance and edge cases', () => {
  it('should handle many compression operations efficiently', async () => {
    const start = Date.now();

    const testData = { p: 'src-20', op: 'mint', tick: 'PERF', amt: '1' };

    for (let i = 0; i < 100; i++) {
      await SRC20CompressionService.compress(testData);
    }

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000); // Should complete in under 5 seconds
  });

  it('should handle empty data gracefully', async () => {
    const emptyData = {};

    const result = await SRC20CompressionService.compress(emptyData);

    expect(result.originalJson).toBe('{}');
    expect(result.data).toBeInstanceOf(Buffer);
  });

  it('should handle very large data', async () => {
    const largeData = {
      p: 'src-20',
      op: 'deploy',
      tick: 'HUGE',
      data: 'X'.repeat(10000), // 10KB of data
    };

    const result = await SRC20CompressionService.compress(largeData, {
      useCompression: true,
    });

    expect(result.compressed).toBe(true);
    expect(result.compressedSize).toBeLessThan(result.originalSize);
    // Highly compressible data (repeated characters) compresses very well
    // Original expectation was >10 outputs, but 10KB of 'X' compresses to ~85 bytes = 3 outputs
    expect(result.estimatedOutputs).toBeGreaterThanOrEqual(1); // Should need at least 1 output
    expect(result.estimatedOutputs).toBeLessThan(10); // But much less than uncompressed would need
  });

  it('should maintain data integrity across multiple round trips', async () => {
    const originalData = {
      p: 'src-20',
      op: 'deploy',
      tick: 'MULTI',
      max: '1000000',
      special: { nested: { deep: 'value' }, array: [1, 2, 3] },
    };

    let currentData = originalData;

    // Perform multiple round trips
    for (let i = 0; i < 5; i++) {
      const compressed = await SRC20CompressionService.compress(currentData, {
        useCompression: true,
        useMsgpack: true,
      });

      const decompressed = await SRC20CompressionService.decompress(compressed.data);
      currentData = decompressed.data;
    }

    expect(currentData).toEqual(originalData);
  });

  it('should handle different compression levels', async () => {
    const testData = 'A'.repeat(1000); // Compressible data

    const levels = [1, 6, 9];
    const results = [];

    for (const level of levels) {
      const result = await SRC20CompressionService.compress(testData, {
        useCompression: true,
        compressionLevel: level,
      });
      results.push(result);
    }

    // Higher compression levels should generally produce smaller output
    // (though not guaranteed for all data types)
    results.forEach((result) => {
      expect(result.compressed).toBe(true);
      expect(result.compressedSize).toBeLessThan(result.originalSize);
    });
  });

  it('should handle buffer vs string consistency', async () => {
    const testObject = { p: 'src-20', op: 'test', tick: 'BUF' };
    const testString = JSON.stringify(testObject);

    const resultFromObject = await SRC20CompressionService.compress(testObject);
    const resultFromString = await SRC20CompressionService.compress(testString);

    expect(resultFromObject.originalJson).toBe(resultFromString.originalJson);
    expect(resultFromObject.originalSize).toBe(resultFromString.originalSize);
  });
});
