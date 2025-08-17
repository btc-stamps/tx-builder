import { beforeEach, describe, expect, it } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import {
  BinaryDataUtils,
  P2WSHEncoder,
  P2WSHScriptConstructor,
} from '../../../src/encoders/p2wsh-encoder.ts';
import type {
  P2WSHData,
  P2WSHEncodingOptions,
  P2WSHEncodingResult,
} from '../../../src/interfaces/encoders/p2wsh.interface.ts';

describe('P2WSHEncoder', () => {
  let encoder: P2WSHEncoder;

  // Sample binary data for testing
  const sampleBinaryData = Buffer.from('Hello, P2WSH World! This is test binary data.', 'utf8');
  const largeBinaryData = Buffer.alloc(5000, 0x42); // 5KB of data

  beforeEach(() => {
    encoder = new P2WSHEncoder(bitcoin.networks.testnet);
  });

  describe('Constructor', () => {
    it('should create encoder with default options', () => {
      const defaultEncoder = new P2WSHEncoder();
      expect(defaultEncoder).toBeDefined();
      expect(defaultEncoder.getType()).toBe('P2WSH');
    });

    it('should create encoder with custom network and dust value', () => {
      const customEncoder = new P2WSHEncoder(bitcoin.networks.bitcoin, 1000);
      expect(customEncoder).toBeDefined();
    });
  });

  describe('Basic Encoding', () => {
    it('should encode simple binary data', () => {
      const p2wshData: P2WSHData = {
        data: sampleBinaryData,
        protocol: 'P2WSH',
      };

      const result = encoder.encode(p2wshData);

      expect(result).toBeDefined();
      expect(result.outputs).toBeDefined();
      expect(result.outputs.length).toBeGreaterThan(0);
      expect(result.witnessScript).toBeDefined();
      expect(result.scriptHash).toBeDefined();
      expect(result.dataSize).toBe(sampleBinaryData.length);
    });

    it('should encode large binary data requiring multiple chunks', () => {
      const p2wshData: P2WSHData = {
        data: largeBinaryData,
        protocol: 'P2WSH',
      };

      const result = encoder.encode(p2wshData);

      expect(result).toBeDefined();
      expect(result.outputs.length).toBeGreaterThan(1); // Should need multiple outputs
      expect(result.dataSize).toBe(largeBinaryData.length);
    });

    it('should encode with custom dust value', () => {
      const p2wshData: P2WSHData = {
        data: sampleBinaryData,
        protocol: 'P2WSH',
      };

      const options: P2WSHEncodingOptions = {
        dustValue: 1000,
      };

      const result = encoder.encode(p2wshData, options);

      expect(result).toBeDefined();
      // Each output should use the custom dust value
      result.outputs.forEach((output) => {
        expect(output.value).toBe(1000);
      });
    });

    it('should respect maxOutputs limit', () => {
      const p2wshData: P2WSHData = {
        data: sampleBinaryData, // Use smaller data that fits in 5 outputs
        protocol: 'P2WSH',
      };

      const options: P2WSHEncodingOptions = {
        maxOutputs: 5,
      };

      const result = encoder.encode(p2wshData, options);
      expect(result.outputs.length).toBeLessThanOrEqual(5);
    });

    it('should throw error when data requires too many outputs', () => {
      const massiveData = Buffer.alloc(100000, 0x42); // 100KB
      const p2wshData: P2WSHData = {
        data: massiveData,
        protocol: 'P2WSH',
      };

      const options: P2WSHEncodingOptions = {
        maxOutputs: 2, // Very restrictive
      };

      expect(() => encoder.encode(p2wshData, options)).toThrow(
        'Too many chunks required',
      );
    });
  });

  describe('Data Validation', () => {
    it('should validate correct P2WSH data', () => {
      const validData: P2WSHData = {
        data: sampleBinaryData,
        protocol: 'P2WSH',
      };

      expect(() => encoder.validate(validData)).not.toThrow();
    });

    it('should reject null/undefined data', () => {
      expect(() => encoder.validate(null as any)).toThrow('P2WSH data must be an object');
      expect(() => encoder.validate(undefined as any)).toThrow('P2WSH data must be an object');
    });

    it('should reject non-object data', () => {
      expect(() => encoder.validate('invalid' as any)).toThrow('P2WSH data must be an object');
    });

    it('should reject non-Buffer data field', () => {
      const invalidData = {
        data: 'not a buffer',
        protocol: 'P2WSH',
      } as any;

      expect(() => encoder.validate(invalidData)).toThrow('P2WSH data.data must be a Buffer');
    });

    it('should reject empty data', () => {
      const invalidData: P2WSHData = {
        data: Buffer.alloc(0),
        protocol: 'P2WSH',
      };

      expect(() => encoder.validate(invalidData)).toThrow('Data cannot be empty');
    });

    it('should reject extremely large data', () => {
      const tooLargeData = Buffer.alloc(10000000, 0x42); // 10MB
      const invalidData: P2WSHData = {
        data: tooLargeData,
        protocol: 'P2WSH',
      };

      expect(() => encoder.validate(invalidData)).toThrow('Data too large');
    });
  });

  describe('Custom Templates', () => {
    it('should handle custom template with signature requirement', () => {
      const p2wshData: P2WSHData = {
        data: sampleBinaryData,
        protocol: 'P2WSH',
      };

      const customTemplate = {
        requireSignature: true,
      };

      const result = encoder.encode(p2wshData, undefined, customTemplate);

      expect(result).toBeDefined();
      expect(result.requiresSignature).toBe(true);
    });

    it('should handle custom template with timelock', () => {
      const p2wshData: P2WSHData = {
        data: sampleBinaryData,
        protocol: 'P2WSH',
      };

      const customTemplate = {
        timelock: 500000,
      };

      const result = encoder.encode(p2wshData, undefined, customTemplate);

      expect(result).toBeDefined();
      expect(result.timelock).toBe(500000);
    });

    it('should handle custom template with multisig', () => {
      const p2wshData: P2WSHData = {
        data: sampleBinaryData,
        protocol: 'P2WSH',
      };

      const customTemplate = {
        m: 2,
        n: 3,
      };

      const result = encoder.encode(p2wshData, undefined, customTemplate);

      expect(result).toBeDefined();
      expect(result.isMultisig).toBe(3); // This is the n value
      expect(result.requiredSignatures).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle decode errors gracefully', () => {
      const invalidOutputs = [
        {
          script: Buffer.from('invalid'),
          value: 546,
        },
      ];

      expect(() => encoder.decode(invalidOutputs)).toThrow(
        'Decoding from P2WSH outputs requires witness scripts',
      );
    });

    it('should handle decoding from witness scripts', () => {
      // Create a valid witness script for testing
      const scriptConstructor = new P2WSHScriptConstructor(bitcoin.networks.testnet);
      const testData = Buffer.from('test data');
      const witnessScript = scriptConstructor.createWitnessScript(testData);

      const decoded = encoder.decodeFromWitnessScripts([witnessScript]);

      expect(decoded).toBeDefined();
      expect(decoded.data).toEqual(testData);
      expect(decoded.protocol).toBe('P2WSH');
    });

    it('should handle invalid witness scripts in decoding', () => {
      const invalidWitnessScript = Buffer.from('invalid script');

      // Should throw when no valid scripts found
      expect(() => encoder.decodeFromWitnessScripts([invalidWitnessScript])).toThrow(
        'No valid data chunks found in witness scripts',
      );
    });

    it('should throw when no valid witness scripts found', () => {
      const invalidWitnessScripts = [
        Buffer.from('invalid1'),
        Buffer.from('invalid2'),
      ];

      expect(() => encoder.decodeFromWitnessScripts(invalidWitnessScripts)).toThrow(
        'No valid data chunks found in witness scripts',
      );
    });
  });

  describe('Utility Functions', () => {
    it('should report maximum data size', () => {
      const maxSize = encoder.getMaxDataSize();
      expect(typeof maxSize).toBe('number');
      expect(maxSize).toBeGreaterThan(0);
    });

    it('should report encoder type', () => {
      const type = encoder.getType();
      expect(type).toBe('P2WSH');
    });
  });
});

describe('BinaryDataUtils', () => {
  const testData = Buffer.from('Hello, Binary World!', 'utf8');
  const largeData = Buffer.alloc(2000, 0x42);

  describe('Data Validation', () => {
    it('should validate correct binary data', () => {
      expect(() => BinaryDataUtils.validateBinaryData(testData)).not.toThrow();
    });

    it('should reject non-Buffer data', () => {
      expect(() => BinaryDataUtils.validateBinaryData('not a buffer' as any)).toThrow(
        'Data must be a Buffer',
      );
    });

    it('should reject empty data', () => {
      expect(() => BinaryDataUtils.validateBinaryData(Buffer.alloc(0))).toThrow(
        'Data cannot be empty',
      );
    });

    it('should reject extremely large data', () => {
      const tooLarge = Buffer.alloc(10000000, 0x42); // 10MB
      expect(() => BinaryDataUtils.validateBinaryData(tooLarge)).toThrow(
        'Data too large',
      );
    });
  });

  describe('Data Chunking', () => {
    it('should chunk data into appropriate sizes', () => {
      const result = BinaryDataUtils.chunkBinaryData(testData);

      expect(result.chunks).toBeDefined();
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.totalSize).toBe(testData.length);
      expect(result.chunkCount).toBe(result.chunks.length);
    });

    it('should chunk large data into multiple chunks', () => {
      const result = BinaryDataUtils.chunkBinaryData(largeData);

      expect(result.chunks.length).toBeGreaterThan(1);
      expect(result.totalSize).toBe(largeData.length);

      // Each chunk should be within size limits
      result.chunks.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(BinaryDataUtils.MAX_CHUNK_SIZE);
      });
    });

    it('should handle custom chunk size', () => {
      const customChunkSize = 100;
      const result = BinaryDataUtils.chunkBinaryData(largeData, customChunkSize);

      // Each chunk (except possibly the last) should be the custom size
      for (let i = 0; i < result.chunks.length - 1; i++) {
        expect(result.chunks[i].length).toBe(customChunkSize);
      }
    });

    it('should reconstruct data from chunks correctly', () => {
      const result = BinaryDataUtils.chunkBinaryData(testData);
      const reconstructed = BinaryDataUtils.reconstructFromChunks(result.chunks);

      expect(reconstructed).toEqual(testData);
    });

    it('should handle empty chunks array in reconstruction', () => {
      expect(() => BinaryDataUtils.reconstructFromChunks([])).toThrow(
        'No chunks provided for reconstruction',
      );
    });

    it('should validate chunk integrity', () => {
      const result = BinaryDataUtils.chunkBinaryData(testData);
      const isValid = BinaryDataUtils.validateChunks(testData, result.chunks);

      expect(isValid).toBe(true);
    });

    it('should detect corrupted chunks', () => {
      const result = BinaryDataUtils.chunkBinaryData(testData);
      // Corrupt the first chunk
      result.chunks[0] = Buffer.from('corrupted');

      const isValid = BinaryDataUtils.validateChunks(testData, result.chunks);
      expect(isValid).toBe(false);
    });
  });

  describe('Size Estimation', () => {
    it('should estimate transaction size correctly', () => {
      const dataSize = 1000;
      const outputCount = 5;

      const estimatedSize = BinaryDataUtils.estimateTransactionSize(dataSize, outputCount);

      expect(typeof estimatedSize).toBe('number');
      expect(estimatedSize).toBeGreaterThan(0);
    });

    it('should increase size estimate with more outputs', () => {
      const dataSize = 1000;
      const size1 = BinaryDataUtils.estimateTransactionSize(dataSize, 1);
      const size5 = BinaryDataUtils.estimateTransactionSize(dataSize, 5);

      expect(size5).toBeGreaterThan(size1);
    });
  });

  describe('Constants', () => {
    it('should have correct size constants', () => {
      expect(BinaryDataUtils.MAX_SCRIPT_SIZE).toBe(10000);
      expect(BinaryDataUtils.MAX_PUSH_DATA_SIZE).toBe(520);
      expect(BinaryDataUtils.WITNESS_SCRIPT_OVERHEAD).toBe(6);
      expect(BinaryDataUtils.MAX_CHUNK_SIZE).toBe(519);
      expect(BinaryDataUtils.DEFAULT_DUST_VALUE).toBe(546);
    });
  });
});

describe('P2WSHScriptConstructor', () => {
  let constructor: P2WSHScriptConstructor;
  const testData = Buffer.from('Test data for witness script', 'utf8');

  beforeEach(() => {
    constructor = new P2WSHScriptConstructor(bitcoin.networks.testnet);
  });

  describe('Witness Script Creation', () => {
    it('should create valid witness script', () => {
      const witnessScript = constructor.createWitnessScript(testData);

      expect(witnessScript).toBeDefined();
      expect(Buffer.isBuffer(witnessScript)).toBe(true);
      expect(witnessScript.length).toBeGreaterThan(0);
    });

    it('should create witness script with correct pattern', () => {
      const witnessScript = constructor.createWitnessScript(testData);
      const decompiled = bitcoin.script.decompile(witnessScript);

      expect(decompiled).toBeDefined();
      expect(decompiled!.length).toBe(4);
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_FALSE);
      expect(decompiled![1]).toBe(bitcoin.opcodes.OP_IF);
      expect(decompiled![3]).toBe(bitcoin.opcodes.OP_ENDIF);

      // Data should be in the middle
      const embeddedData = decompiled![2] as Buffer;
      expect(Buffer.isBuffer(embeddedData)).toBe(true);
      expect(embeddedData).toEqual(testData);
    });

    it('should reject data chunks that are too large', () => {
      const tooLargeChunk = Buffer.alloc(BinaryDataUtils.MAX_PUSH_DATA_SIZE + 1, 0x42);

      expect(() => constructor.createWitnessScript(tooLargeChunk)).toThrow(
        'Data chunk too large',
      );
    });

    it('should reject witness scripts that exceed size limit', () => {
      // Create data that would result in a script exceeding the limit
      const tooLargeData = Buffer.alloc(BinaryDataUtils.MAX_PUSH_DATA_SIZE + 1, 0x42);

      expect(() => constructor.createWitnessScript(tooLargeData)).toThrow(
        'Data chunk too large',
      );
    });
  });

  describe('P2WSH Output Creation', () => {
    it('should create valid P2WSH output', () => {
      const witnessScript = constructor.createWitnessScript(testData);
      const output = constructor.createP2WSHOutput(witnessScript);

      expect(output).toBeDefined();
      expect(output.script).toBeDefined();
      expect(output.value).toBe(BinaryDataUtils.DEFAULT_DUST_VALUE);
    });

    it('should create P2WSH output with custom value', () => {
      const witnessScript = constructor.createWitnessScript(testData);
      const customValue = 1000;
      const output = constructor.createP2WSHOutput(witnessScript, customValue);

      expect(output.value).toBe(customValue);
    });

    it('should create P2WSH output with correct script format', () => {
      const witnessScript = constructor.createWitnessScript(testData);
      const output = constructor.createP2WSHOutput(witnessScript);

      const decompiled = bitcoin.script.decompile(output.script);
      expect(decompiled).toBeDefined();
      expect(decompiled!.length).toBe(2);
      expect(decompiled![0]).toBe(bitcoin.opcodes.OP_0);

      const hash = decompiled![1] as Buffer;
      expect(Buffer.isBuffer(hash)).toBe(true);
      expect(hash.length).toBe(32); // SHA256 hash length
    });
  });

  describe('Data Extraction', () => {
    it('should extract data from witness script correctly', () => {
      const witnessScript = constructor.createWitnessScript(testData);
      const extractedData = constructor.extractDataFromWitnessScript(witnessScript);

      expect(extractedData).toEqual(testData);
    });

    it('should reject invalid witness script format', () => {
      const invalidScript = Buffer.from([bitcoin.opcodes.OP_1]); // Just OP_1

      expect(() => constructor.extractDataFromWitnessScript(invalidScript)).toThrow(
        'Invalid witness script format',
      );
    });

    it('should reject witness script with wrong pattern', () => {
      // Create script with wrong opcodes
      const wrongScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_TRUE, // Should be OP_FALSE
        bitcoin.opcodes.OP_IF,
        testData,
        bitcoin.opcodes.OP_ENDIF,
      ]);

      expect(() => constructor.extractDataFromWitnessScript(wrongScript)).toThrow(
        'Invalid witness script pattern',
      );
    });

    it('should reject witness script with non-Buffer data', () => {
      // This is harder to test directly since bitcoin.script.compile validates inputs
      // But we can test the validation logic
      const scriptWithNumber = bitcoin.script.compile([
        bitcoin.opcodes.OP_FALSE,
        bitcoin.opcodes.OP_IF,
        bitcoin.opcodes.OP_1, // This is a number, not Buffer
        bitcoin.opcodes.OP_ENDIF,
      ]);

      expect(() => constructor.extractDataFromWitnessScript(scriptWithNumber)).toThrow(
        'Invalid data chunk in witness script',
      );
    });
  });

  describe('P2WSH Output Validation', () => {
    it('should validate correct P2WSH output script', () => {
      const witnessScript = constructor.createWitnessScript(testData);
      const output = constructor.createP2WSHOutput(witnessScript);

      const isValid = constructor.validateP2WSHOutput(output.script);
      expect(isValid).toBe(true);
    });

    it('should reject non-P2WSH scripts', () => {
      const nonP2WSHScript = Buffer.from([bitcoin.opcodes.OP_1]); // Simple OP_1

      const isValid = constructor.validateP2WSHOutput(nonP2WSHScript);
      expect(isValid).toBe(false);
    });

    it('should reject scripts with wrong length', () => {
      const wrongLengthScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_0,
        Buffer.alloc(20, 0x42), // 20 bytes instead of 32 (P2WPKH, not P2WSH)
      ]);

      const isValid = constructor.validateP2WSHOutput(wrongLengthScript);
      expect(isValid).toBe(false);
    });

    it('should reject scripts with wrong opcode', () => {
      const wrongOpcodeScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_1, // Should be OP_0
        Buffer.alloc(32, 0x42),
      ]);

      const isValid = constructor.validateP2WSHOutput(wrongOpcodeScript);
      expect(isValid).toBe(false);
    });

    it('should reject malformed scripts', () => {
      const malformedScript = Buffer.from('malformed');

      const isValid = constructor.validateP2WSHOutput(malformedScript);
      expect(isValid).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle maximum allowed data chunk', () => {
      const maxChunk = Buffer.alloc(BinaryDataUtils.MAX_PUSH_DATA_SIZE, 0x42);

      expect(() => constructor.createWitnessScript(maxChunk)).not.toThrow();
    });

    it('should handle single byte data', () => {
      const singleByte = Buffer.from([0x42]);

      const witnessScript = constructor.createWitnessScript(singleByte);
      const extractedData = constructor.extractDataFromWitnessScript(witnessScript);

      expect(extractedData).toEqual(singleByte);
    });

    it('should handle binary data with special characters', () => {
      const specialData = Buffer.from([0x00, 0xFF, 0x7F, 0x80, 0x01]);

      const witnessScript = constructor.createWitnessScript(specialData);
      const extractedData = constructor.extractDataFromWitnessScript(witnessScript);

      expect(extractedData).toEqual(specialData);
    });
  });
});
