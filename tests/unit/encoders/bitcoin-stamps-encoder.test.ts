import { beforeEach, describe, expect, it } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import {
  BitcoinStampsEncoder,
  CounterpartyProtocolHandler,
  StampMetadataHandler,
} from '../../../src/encoders/bitcoin-stamps-encoder.ts';
import type {
  BitcoinStampData,
  BitcoinStampEncodingOptions,
  BitcoinStampEncodingResult,
} from '../../../src/interfaces/encoders/stamps.interface.ts';

describe('BitcoinStampsEncoder', () => {
  let encoder: BitcoinStampsEncoder;

  // Sample PNG header data (minimal valid PNG)
  const samplePngData = Buffer.from([
    0x89,
    0x50,
    0x4E,
    0x47,
    0x0D,
    0x0A,
    0x1A,
    0x0A, // PNG signature
    0x00,
    0x00,
    0x00,
    0x0D,
    0x49,
    0x48,
    0x44,
    0x52, // IHDR chunk
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x01, // 1x1 pixel
    0x08,
    0x06,
    0x00,
    0x00,
    0x00,
    0x1F,
    0x15,
    0xC4, // RGBA, CRC
    0x89,
    0x00,
    0x00,
    0x00,
    0x0A,
    0x49,
    0x44,
    0x41, // IDAT chunk
    0x54,
    0x78,
    0x9C,
    0x63,
    0x00,
    0x01,
    0x00,
    0x00, // Compressed data
    0x05,
    0x00,
    0x01,
    0x0D,
    0x0A,
    0x2D,
    0xB4,
    0x00, // More data + CRC
    0x00,
    0x00,
    0x00,
    0x49,
    0x45,
    0x4E,
    0x44,
    0xAE, // IEND chunk
    0x42,
    0x60,
    0x82, // CRC
  ]);

  beforeEach(() => {
    encoder = new BitcoinStampsEncoder(bitcoin.networks.testnet);
  });

  describe('Constructor', () => {
    it('should create encoder with default options', () => {
      const defaultEncoder = new BitcoinStampsEncoder();
      expect(defaultEncoder).toBeDefined();
      expect(defaultEncoder.getType()).toBe('bitcoin-stamps');
    });

    it('should create encoder with custom network', () => {
      const testnetEncoder = new BitcoinStampsEncoder(bitcoin.networks.testnet);
      expect(testnetEncoder).toBeDefined();
    });

    it('should create encoder with custom options', () => {
      const options = {
        dustValue: 1000,
        maxOutputs: 25,
        enableCompression: false,
      };
      const customEncoder = new BitcoinStampsEncoder(bitcoin.networks.bitcoin, options);
      expect(customEncoder).toBeDefined();
    });
  });

  describe('Basic Encoding', () => {
    it('should encode simple stamp data', async () => {
      const stampData: BitcoinStampData = {
        imageData: samplePngData,
        title: 'Test Stamp',
        description: 'A test Bitcoin stamp',
      };

      const result = await encoder.encode(stampData);

      expect(result).toBeDefined();
      expect(result.outputs).toBeDefined();
      expect(result.outputs.length).toBeGreaterThan(0);
      expect(result.compressionUsed).toBe(false); // Stamps don't use compression
      expect(result.metadata).toBeDefined();
    });

    it('should encode stamp with minimal data', async () => {
      const stampData: BitcoinStampData = {
        imageData: Buffer.from('Hello, World!', 'utf8'),
      };

      const result = await encoder.encode(stampData);

      expect(result).toBeDefined();
      expect(result.outputs).toBeDefined();
      expect(result.dataSize).toBe(stampData.imageData.length);
    });

    it('should encode stamp synchronously', () => {
      const stampData: BitcoinStampData = {
        imageData: samplePngData,
        filename: 'test.png',
      };

      const result = encoder.encodeSync(stampData);

      expect(result).toBeDefined();
      expect(result.outputs).toBeDefined();
      expect(result.metadata?.imageFormat).toBeDefined();
    });
  });

  describe('Data Validation', () => {
    it('should validate valid stamp data', () => {
      const validData: BitcoinStampData = {
        imageData: samplePngData,
        title: 'Valid Stamp',
      };

      expect(() => encoder.validate(validData)).not.toThrow();
    });

    it('should reject null/undefined data', () => {
      expect(() => encoder.validate(null as any)).toThrow('BitcoinStampData must be an object');
      expect(() => encoder.validate(undefined as any)).toThrow(
        'BitcoinStampData must be an object',
      );
    });

    it('should reject non-object data', () => {
      expect(() => encoder.validate('invalid' as any)).toThrow(
        'BitcoinStampData must be an object',
      );
    });

    it('should reject data without imageData', () => {
      const invalidData = {
        title: 'No Image Data',
      } as any;

      expect(() => encoder.validate(invalidData)).toThrow('imageData must be a non-empty Buffer');
    });

    it('should reject empty imageData', () => {
      const invalidData: BitcoinStampData = {
        imageData: Buffer.alloc(0),
      };

      expect(() => encoder.validate(invalidData)).toThrow('imageData must be a non-empty Buffer');
    });

    it('should reject non-Buffer imageData', () => {
      const invalidData = {
        imageData: 'not a buffer',
      } as any;

      expect(() => encoder.validate(invalidData)).toThrow('imageData must be a non-empty Buffer');
    });

    it('should validate string fields when provided', () => {
      const validData: BitcoinStampData = {
        imageData: samplePngData,
        title: 'Valid Title',
        description: 'Valid Description',
        creator: 'Valid Creator',
        filename: 'valid.png',
      };

      expect(() => encoder.validate(validData)).not.toThrow();
    });

    it('should reject invalid string field types', () => {
      const invalidData = {
        imageData: samplePngData,
        title: 123, // Should be string
      } as any;

      expect(() => encoder.validate(invalidData)).toThrow('title must be a string if provided');
    });
  });

  describe('Size Constraints', () => {
    it('should reject data exceeding maximum size', () => {
      // Create data larger than STAMP_MAX_SIZE (typically 100KB)
      const largeData = Buffer.alloc(200000, 0x42); // 200KB of data

      const stampData: BitcoinStampData = {
        imageData: largeData,
      };

      // Should reject when validation is not skipped (synchronous)
      expect(() => encoder.encodeSync(stampData)).toThrow(
        'Data exceeds maximum transaction size',
      );
    });

    it('should accept data within size limits', async () => {
      const reasonableSizeData = Buffer.alloc(1000, 0x42); // 1KB

      const stampData: BitcoinStampData = {
        imageData: reasonableSizeData,
      };

      const result = await encoder.encode(stampData);
      expect(result).toBeDefined();
    });

    it('should skip validation when requested', async () => {
      const largeData = Buffer.alloc(200000, 0x42); // 200KB of data

      const stampData: BitcoinStampData = {
        imageData: largeData,
      };

      const options: BitcoinStampEncodingOptions = {
        skipValidation: true,
      };

      // Should not throw when validation is skipped
      const result = await encoder.encode(stampData, options);
      expect(result).toBeDefined();
    });

    it('should report maximum data size', () => {
      const maxSize = encoder.getMaxDataSize();
      expect(typeof maxSize).toBe('number');
      expect(maxSize).toBeGreaterThan(0);
    });
  });

  describe('Output Structure', () => {
    it('should create outputs in correct order (OP_RETURN first, then P2WSH)', async () => {
      const stampData: BitcoinStampData = {
        imageData: samplePngData,
      };

      const result = await encoder.encode(stampData);

      // First output should be OP_RETURN
      const firstOutput = result.outputs[0];
      expect(firstOutput).toBeDefined();
      expect(firstOutput.value).toBe(0); // OP_RETURN has 0 value

      // Verify it's OP_RETURN by checking script
      const decompiled = bitcoin.script.decompile(firstOutput.script);
      expect(decompiled).toBeDefined();
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_RETURN);

      // Subsequent outputs should be P2WSH (fake P2WSH for stamps)
      if (result.outputs.length > 1) {
        const dataOutput = result.outputs[1];
        expect(dataOutput.value).toBeGreaterThan(0); // P2WSH has dust value
      }
    });

    it('should include OP_RETURN output in result', async () => {
      const stampData: BitcoinStampData = {
        imageData: samplePngData,
      };

      const result = await encoder.encode(stampData);

      expect(result.opReturnOutput).toBeDefined();
      expect(result.opReturnOutput.value).toBe(0);
      expect(result.opReturnOutput.script).toBeDefined();
    });

    it('should include P2WSH outputs in result', async () => {
      const stampData: BitcoinStampData = {
        imageData: samplePngData,
      };

      const result = await encoder.encode(stampData);

      expect(result.p2wshOutputs).toBeDefined();
      expect(result.p2wshOutputs.length).toBeGreaterThan(0);

      // Each P2WSH output should have dust value
      result.p2wshOutputs.forEach((output) => {
        expect(output.value).toBeGreaterThan(0);
      });
    });

    it('should estimate size correctly', async () => {
      const stampData: BitcoinStampData = {
        imageData: samplePngData,
      };

      const result = await encoder.encode(stampData);

      expect(result.estimatedSize).toBeGreaterThan(0);
      expect(typeof result.estimatedSize).toBe('number');
    });
  });

  describe('Encoding Options', () => {
    it('should use custom dust value', async () => {
      const customDustValue = 1000;
      const stampData: BitcoinStampData = {
        imageData: samplePngData,
      };

      const options: BitcoinStampEncodingOptions = {
        dustValue: customDustValue,
      };

      const result = await encoder.encode(stampData, options);

      // Check that P2WSH outputs use custom dust value
      result.p2wshOutputs.forEach((output) => {
        expect(output.value).toBe(customDustValue);
      });
    });

    it('should respect maxOutputs limit', async () => {
      const stampData: BitcoinStampData = {
        imageData: Buffer.alloc(50, 0x42), // Very small data that fits in 1-2 outputs
      };

      const options: BitcoinStampEncodingOptions = {
        maxOutputs: 5,
      };

      // Should not exceed maxOutputs
      const result = await encoder.encode(stampData, options);
      expect(result.outputs.length).toBeLessThanOrEqual(options.maxOutputs);
    });

    it('should handle custom CPID', async () => {
      const stampData: BitcoinStampData = {
        imageData: samplePngData,
      };

      const options: BitcoinStampEncodingOptions = {
        cpid: 'A95428956661682178',
        utxos: [{ txid: '1'.repeat(64), vout: 0, value: 100000 }],
      };

      const result = await encoder.encode(stampData, options);
      expect(result).toBeDefined();
      expect(result.opReturnOutput).toBeDefined();
    });

    it('should handle custom supply', async () => {
      const stampData: BitcoinStampData = {
        imageData: samplePngData,
      };

      const options: BitcoinStampEncodingOptions = {
        supply: 100,
        utxos: [{ txid: '1'.repeat(64), vout: 0, value: 100000 }],
      };

      const result = await encoder.encode(stampData, options);
      expect(result).toBeDefined();
    });
  });

  describe('Static Factory Methods', () => {
    it('should create stamp from base64 data', () => {
      const base64Data = samplePngData.toString('base64');

      const stampData = BitcoinStampsEncoder.fromBase64(base64Data, {
        title: 'Base64 Stamp',
        description: 'Created from base64',
      });

      expect(stampData.imageData).toEqual(samplePngData);
      expect(stampData.title).toBe('Base64 Stamp');
      expect(stampData.description).toBe('Created from base64');
    });

    it('should create stamp from data URL', () => {
      const dataUrl = `data:image/png;base64,${samplePngData.toString('base64')}`;

      const stampData = BitcoinStampsEncoder.fromBase64(dataUrl);
      expect(stampData.imageData).toEqual(samplePngData);
    });

    it('should create stamp from buffer', () => {
      const stampData = BitcoinStampsEncoder.fromBuffer(samplePngData, {
        filename: 'test.png',
        creator: 'Test Creator',
      });

      expect(stampData.imageData).toEqual(samplePngData);
      expect(stampData.filename).toBe('test.png');
      expect(stampData.creator).toBe('Test Creator');
    });

    it('should reject oversized data in factory methods', () => {
      const largeData = Buffer.alloc(200000, 0x42);

      expect(() => {
        BitcoinStampsEncoder.fromBuffer(largeData);
      }).toThrow('Data exceeds maximum transaction size');
    });

    it('should handle invalid base64 data', () => {
      // Buffer.from with invalid base64 doesn't throw, it just returns partial data
      // But we can test with size validation
      const largeInvalidData = 'a'.repeat(500000); // Too large
      expect(() => {
        BitcoinStampsEncoder.fromBase64(largeInvalidData);
      }).toThrow('Data exceeds maximum transaction size');
    });
  });

  describe('Error Handling', () => {
    it('should handle decode errors gracefully', () => {
      const invalidOutputs = [
        {
          script: Buffer.from('invalid'),
          value: 0,
        },
      ];

      expect(() => encoder.decode(invalidOutputs)).toThrow(
        'No Counterparty OP_RETURN output found',
      );
    });

    it('should handle missing OP_RETURN in decode', () => {
      const outputsWithoutOpReturn = [
        {
          script: Buffer.from([0x00, 0x20]), // OP_0 + 32 bytes (but no data)
          value: 330,
        },
      ];

      expect(() => encoder.decode(outputsWithoutOpReturn)).toThrow(
        'No Counterparty OP_RETURN output found',
      );
    });

    it('should handle missing P2WSH outputs in decode', () => {
      const opReturnOnly = [
        {
          script: Buffer.from([0x6a, 0x04, 0x74, 0x65, 0x73, 0x74]), // OP_RETURN "test"
          value: 0,
        },
      ];

      expect(() => encoder.decode(opReturnOnly)).toThrow(
        'No P2WSH data outputs found',
      );
    });
  });

  describe('Metadata Handling', () => {
    it('should create proper metadata for PNG', () => {
      const metadata = StampMetadataHandler.createMetadata(samplePngData);

      expect(metadata.imageFormat).toBe('PNG');
      expect(metadata.originalSize).toBe(samplePngData.length);
      expect(metadata.base64URI).toContain('data:image/png;base64,');
    });

    it('should handle unknown formats', () => {
      const unknownData = Buffer.from('unknown format data');
      const metadata = StampMetadataHandler.createMetadata(unknownData);

      expect(metadata.imageFormat).toBe('TEXT'); // DataProcessor detects text content
      expect(metadata.originalSize).toBe(unknownData.length);
    });

    it('should validate metadata constraints', () => {
      const validMetadata = StampMetadataHandler.createMetadata(samplePngData);
      const errors = StampMetadataHandler.validateMetadata(validMetadata);

      expect(errors).toEqual([]);
    });

    it('should detect oversized data in metadata validation', () => {
      const largeData = Buffer.alloc(200000, 0x42);
      const metadata = StampMetadataHandler.createMetadata(largeData, undefined, true);
      const errors = StampMetadataHandler.validateMetadata(metadata);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('exceeds maximum');
    });
  });
});

describe('CounterpartyProtocolHandler', () => {
  describe('OP_RETURN Creation', () => {
    it('should create OP_RETURN output with valid CPID', () => {
      const utxos = [{ txid: '1'.repeat(64), vout: 0, value: 100000 }];
      const cpid = 'A95428956661682178';

      const opReturn = CounterpartyProtocolHandler.createOpReturnOutput(utxos, cpid);

      expect(opReturn.value).toBe(0);
      expect(opReturn.script).toBeDefined();

      // Should be OP_RETURN script
      const decompiled = bitcoin.script.decompile(opReturn.script);
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_RETURN);
    });

    it('should handle numeric asset IDs', () => {
      const utxos = [{ txid: '1'.repeat(64), vout: 0, value: 100000 }];
      const cpid = 'A12345678901234567';

      const opReturn = CounterpartyProtocolHandler.createOpReturnOutput(utxos, cpid);
      expect(opReturn).toBeDefined();
    });

    it('should handle text-based CPIDs', () => {
      const utxos = [{ txid: '1'.repeat(64), vout: 0, value: 100000 }];
      const cpid = 'TESTSTAMP';

      const opReturn = CounterpartyProtocolHandler.createOpReturnOutput(utxos, cpid);
      expect(opReturn).toBeDefined();
    });

    it('should handle sub-assets', () => {
      const utxos = [{ txid: '1'.repeat(64), vout: 0, value: 100000 }];
      const cpid = 'A12345.SUBSTAMP';

      const opReturn = CounterpartyProtocolHandler.createOpReturnOutput(utxos, cpid);
      expect(opReturn).toBeDefined();
    });

    it('should reject invalid asset ID range', () => {
      const utxos = [{ txid: '1'.repeat(64), vout: 0, value: 100000 }];
      const cpid = 'A99999999999999999999'; // Too large

      expect(() => {
        CounterpartyProtocolHandler.createOpReturnOutput(utxos, cpid);
      }).toThrow('out of valid range');
    });

    it('should handle custom supply values', () => {
      const utxos = [{ txid: '1'.repeat(64), vout: 0, value: 100000 }];
      const cpid = 'A95428956661682178';
      const supply = 1000;

      const opReturn = CounterpartyProtocolHandler.createOpReturnOutput(utxos, cpid, supply);
      expect(opReturn).toBeDefined();
    });
  });

  describe('RC4 Encryption/Decryption', () => {
    it('should encrypt and decrypt data correctly', () => {
      const key = '1234567890abcdef';
      const data = Buffer.from('Hello, Counterparty!');

      const encrypted = CounterpartyProtocolHandler['rc4Encrypt'](key, data);
      const decrypted = CounterpartyProtocolHandler['rc4Encrypt'](key, encrypted);

      expect(decrypted).toEqual(data);
    });

    it('should decrypt OP_RETURN data', () => {
      const inputTxid = '1'.repeat(64);
      const testData = Buffer.from('CNTRPRTYtest data');

      // This would normally be encrypted data
      const decrypted = CounterpartyProtocolHandler.decryptOpReturn(testData, inputTxid);
      expect(decrypted).toBeDefined();
    });

    it('should handle decryption errors', () => {
      const invalidData = Buffer.from('invalid');
      const inputTxid = '1'.repeat(64);

      const result = CounterpartyProtocolHandler.decryptOpReturn(invalidData, inputTxid);
      expect(result).toBeDefined(); // RC4 doesn't really "fail", it just returns different data
    });
  });

  describe('Stamp Info Extraction', () => {
    it('should extract stamp info from valid OP_RETURN', () => {
      // Create a valid OP_RETURN script
      const testData = Buffer.from('test');
      const opReturnScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_RETURN,
        testData,
      ]);

      const stampInfo = CounterpartyProtocolHandler.extractStampInfo(opReturnScript);
      expect(stampInfo).toBeDefined();

      if (stampInfo) {
        expect(stampInfo.stampId).toBeDefined();
        expect(stampInfo.filename).toBeDefined();
      }
    });

    it('should handle invalid OP_RETURN scripts', () => {
      const invalidScript = Buffer.from([0x51]); // OP_1, not OP_RETURN

      const stampInfo = CounterpartyProtocolHandler.extractStampInfo(invalidScript);
      expect(stampInfo).toBeNull();
    });

    it('should handle missing input TXID', () => {
      const testData = Buffer.from('test');
      const opReturnScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_RETURN,
        testData,
      ]);

      const stampInfo = CounterpartyProtocolHandler.extractStampInfo(opReturnScript);
      expect(stampInfo).toBeDefined();

      if (stampInfo) {
        expect(stampInfo.stampId).toContain('ENCRYPTED_');
      }
    });

    it('should handle malformed scripts', () => {
      const malformedScript = Buffer.from([0x6a]); // Just OP_RETURN, no data

      const stampInfo = CounterpartyProtocolHandler.extractStampInfo(malformedScript);
      expect(stampInfo).toBeNull();
    });
  });
});

describe('StampMetadataHandler', () => {
  const samplePngData = Buffer.from([
    0x89,
    0x50,
    0x4E,
    0x47,
    0x0D,
    0x0A,
    0x1A,
    0x0A, // PNG signature
    0x00,
    0x00,
    0x00,
    0x0D,
    0x49,
    0x48,
    0x44,
    0x52, // IHDR
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x01, // 1x1
    0x08,
    0x06,
    0x00,
    0x00,
    0x00,
    0x1F,
    0x15,
    0xC4, // RGBA
  ]);

  describe('Metadata Creation', () => {
    it('should create metadata for PNG data', () => {
      const metadata = StampMetadataHandler.createMetadata(samplePngData);

      expect(metadata.imageFormat).toBe('PNG');
      expect(metadata.originalSize).toBe(samplePngData.length);
      expect(metadata.imageDimensions.width).toBe(0); // Stamps don't use dimensions
      expect(metadata.imageDimensions.height).toBe(0);
      expect(metadata.base64URI).toContain('data:image/png;base64,');
    });

    it('should handle compressed size', () => {
      const compressedSize = 50;
      const metadata = StampMetadataHandler.createMetadata(samplePngData, compressedSize);

      expect(metadata.compressedSize).toBe(compressedSize);
    });

    it('should handle unknown format with validation skip', () => {
      const unknownData = Buffer.from('not an image');
      const metadata = StampMetadataHandler.createMetadata(unknownData, undefined, true);

      expect(metadata.imageFormat).toBe('TEXT'); // DataProcessor detects text content
      expect(metadata.base64URI).toContain('data:text/plain;base64,');
    });
  });

  describe('Metadata Validation', () => {
    it('should pass validation for normal-sized data', () => {
      const metadata = StampMetadataHandler.createMetadata(samplePngData);
      const errors = StampMetadataHandler.validateMetadata(metadata);

      expect(errors).toEqual([]);
    });

    it('should fail validation for oversized data', () => {
      const largeData = Buffer.alloc(200000, 0x42);
      const metadata = StampMetadataHandler.createMetadata(largeData, undefined, true);
      const errors = StampMetadataHandler.validateMetadata(metadata);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('exceeds maximum');
    });

    it('should not validate dimensions for stamps', () => {
      // Stamps don't have dimension constraints
      const metadata = StampMetadataHandler.createMetadata(samplePngData);
      metadata.imageDimensions = { width: 10000, height: 10000 }; // Large dimensions

      const errors = StampMetadataHandler.validateMetadata(metadata);
      expect(errors).toEqual([]); // Should not care about dimensions
    });
  });
});
