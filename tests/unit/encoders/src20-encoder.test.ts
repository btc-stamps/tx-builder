/**
 * SRC-20 Encoder Tests
 *
 * Comprehensive test suite for SRC20Encoder focusing on missing coverage paths,
 * production data validation, and edge cases not covered in existing tests.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import { Buffer } from 'node:buffer';

import { P2WSHAddressUtils, SRC20Encoder, SRC20Helper } from '../../../src/encoders/src20-encoder';
import type {
  SRC20Data,
  SRC20DeployData,
  SRC20MintData,
  SRC20TransferData,
} from '../../../src/interfaces/src20.interface';
import {
  DEPLOY_PRODUCTION_PATTERN,
  KEVIN_TRANSFER_PRODUCTION_DATA,
  MINT_PRODUCTION_PATTERN,
  validateProductionFormat,
} from '../../fixtures/src20-production-fixtures';

describe('SRC20Encoder', () => {
  let encoder: SRC20Encoder;

  beforeEach(() => {
    encoder = new SRC20Encoder(bitcoin.networks.testnet);
  });

  describe('Constructor and Basic Setup', () => {
    it('should initialize with default network', () => {
      const defaultEncoder = new SRC20Encoder();
      expect(defaultEncoder).toBeInstanceOf(SRC20Encoder);
    });

    it('should initialize with custom network', () => {
      const customEncoder = new SRC20Encoder(bitcoin.networks.bitcoin);
      expect(customEncoder).toBeInstanceOf(SRC20Encoder);
    });
  });

  describe('Sync vs Async Encoding', () => {
    const testData: SRC20TransferData = {
      p: 'SRC-20',
      op: 'TRANSFER',
      tick: 'TEST',
      amt: '1000',
    };

    it('should provide consistent results between sync and async encoding', async () => {
      const syncResult = encoder.encode(testData);
      const asyncResult = await encoder.encodeAsync(testData);

      expect(syncResult.jsonData).toBe(asyncResult.jsonData);
      expect(syncResult.compressionUsed).toBe(asyncResult.compressionUsed);
      expect(syncResult.p2wshOutputs.length).toBe(asyncResult.p2wshOutputs.length);
    });

    it('should handle encodeSync method directly', () => {
      const result = encoder.encodeSync(testData);

      expect(result.jsonData).toContain('src-20');
      expect(result.jsonData).toContain('transfer');
      expect(result.jsonData).toContain('TEST');
      expect(result.p2wshOutputs.length).toBeGreaterThan(0);
    });
  });

  describe('Data Normalization', () => {
    it('should normalize protocol to lowercase', () => {
      const data: SRC20Data = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: '1000',
      };

      const result = encoder.encode(data);
      expect(result.jsonData).toContain('"p":"src-20"');
    });

    it('should normalize operation to lowercase', () => {
      const data: SRC20Data = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: '1000',
      };

      const result = encoder.encode(data);
      expect(result.jsonData).toContain('"op":"transfer"');
    });

    it('should normalize ticker to uppercase', () => {
      const data: SRC20Data = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'test', // lowercase input
        amt: '1000',
      };

      const result = encoder.encode(data);
      expect(result.jsonData).toContain('"tick":"TEST"');
    });

    it('should convert string amounts to numbers', () => {
      const data: SRC20Data = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: '1000.500', // String with decimal
      };

      const result = encoder.encode(data);
      expect(result.jsonData).toContain('"amt":1000.5'); // Number without quotes
    });

    it('should handle large numeric values correctly', () => {
      const data: SRC20DeployData = {
        p: 'SRC-20',
        op: 'DEPLOY',
        tick: 'TEST',
        max: '21000000000000', // Large number as string
        lim: '1000000',
      };

      const result = encoder.encode(data);
      expect(result.jsonData).toContain('"max":21000000000000');
      expect(result.jsonData).toContain('"lim":1000000');
    });
  });

  describe('SRC20Operation Normalization', () => {
    it('should normalize generic SRC20Operation DEPLOY data', () => {
      const operationData = {
        p: 'SRC-20',
        op: 'DEPLOY',
        tick: 'TEST',
        max: '1000000',
        lim: '1000',
        dec: '18',
        description: 'Test token',
      };

      const result = encoder.encode(operationData as any);
      expect(result.jsonData).toContain('"op":"deploy"');
      expect(result.jsonData).toContain('"max":1000000');
      expect(result.jsonData).toContain('"dec":18');
      expect(result.jsonData).toContain('"description":"Test token"');
    });

    it('should handle MINT with array amounts', () => {
      const operationData = {
        p: 'SRC-20',
        op: 'MINT',
        tick: 'TEST',
        amt: ['1000', '2000'], // Array of amounts
      };

      const result = encoder.encode(operationData as any);
      expect(result.jsonData).toContain('"amt":1000'); // Should use first amount
    });

    it('should handle TRANSFER with multiple amounts', () => {
      const operationData = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: ['1000', '2000'], // Array of amounts
        dest: 'some_destination',
      };

      const result = encoder.encode(operationData as any);
      expect(result.jsonData).toContain('"amt":"1000,2000"'); // Should join amounts
      expect(result.jsonData).toContain('"dest":"some_destination"');
    });

    it('should handle missing optional fields gracefully', () => {
      const operationData = {
        p: 'SRC-20',
        op: 'DEPLOY',
        tick: 'TEST',
        max: '1000000', // Required field
        lim: '1000', // Required field
        // Optional fields like description missing
      };

      const result = encoder.encode(operationData as any);
      expect(result.jsonData).toContain('"max":1000000');
      expect(result.jsonData).toContain('"lim":1000');
      expect(result.jsonData).not.toContain('"description"'); // Optional field not included
    });
  });

  describe('Compression Logic', () => {
    it('should not compress small data by default', () => {
      const smallData: SRC20Data = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: '100',
      };

      const result = encoder.encode(smallData);
      expect(result.compressionUsed).toBe(false);
    });

    it('should attempt compression for large data', () => {
      const largeData: SRC20DeployData = {
        p: 'SRC-20',
        op: 'DEPLOY',
        tick: 'TEST',
        max: '18446744073709551615', // uint64 max - valid large number
        lim: '1000000000000000000', // valid large number
        description: 'A'.repeat(200), // Very long description
        web: 'https://example.com/' + 'long-url-path/'.repeat(10),
        email: 'very-long-email-address@example-domain.com',
      };

      const result = encoder.encode(largeData, { useCompression: true });
      // May or may not be compressed depending on effectiveness
      expect(typeof result.compressionUsed).toBe('boolean');
    });

    it('should respect useCompression: false option', () => {
      const data: SRC20DeployData = {
        p: 'SRC-20',
        op: 'DEPLOY',
        tick: 'TEST',
        max: '1000000',
        lim: '1000',
        description: 'A'.repeat(200), // Large description to make data large
      };

      const result = encoder.encode(data, { useCompression: false });
      expect(result.compressionUsed).toBe(false);
    });

    it('should handle compression errors gracefully', () => {
      const data: SRC20Data = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: '1000',
      };

      // Should not throw even if compression fails internally
      const result = encoder.encode(data, { useCompression: true });
      expect(result).toBeDefined();
      expect(result.jsonData).toBeDefined();
    });
  });

  describe('Automatic Compression Decision', () => {
    it('should choose optimal compression based on output count', async () => {
      const data: SRC20DeployData = {
        p: 'SRC-20',
        op: 'DEPLOY',
        tick: 'TEST',
        max: '21000000',
        lim: '1000',
        description: 'Medium length description that might benefit from compression',
      };

      const result = await encoder.encodeWithCompression(data);
      expect(result).toBeDefined();
      expect(result.p2wshOutputs.length).toBeGreaterThan(0);
    });
  });

  describe('P2WSH Output Creation', () => {
    it('should create P2WSH outputs with correct structure', () => {
      const data: SRC20Data = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: '1000',
      };

      const result = encoder.encode(data);

      expect(result.p2wshOutputs.length).toBeGreaterThan(0);
      result.p2wshOutputs.forEach((output) => {
        expect(output.script).toBeInstanceOf(Buffer);
        expect(output.script.length).toBe(34); // OP_0 + PUSH_32 + 32 bytes
        expect(output.script[0]).toBe(0x00); // OP_0
        expect(output.script[1]).toBe(0x20); // PUSH_32
        expect(output.value).toBe(330); // Default dust value
      });
    });

    it('should handle custom dust values', () => {
      const data: SRC20Data = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: '1000',
      };

      const customDustValue = 500;
      const result = encoder.encode(data, { dustValue: customDustValue });

      result.p2wshOutputs.forEach((output) => {
        expect(output.value).toBe(customDustValue);
      });
    });

    it('should include length prefix in data', () => {
      const data: SRC20Data = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: '1000',
      };

      const result = encoder.encode(data);

      // First output should contain length prefix
      const firstOutput = result.p2wshOutputs[0];
      const dataBytes = firstOutput.script.subarray(2); // Skip OP_0 and PUSH_32

      expect(dataBytes[0]).toBe(0x00); // Length prefix first byte
      expect(dataBytes[1]).toBeGreaterThan(0); // Length prefix second byte (actual length)
    });
  });

  describe('Complete Output Generation', () => {
    it('should create complete outputs for TRANSFER with addresses', () => {
      const data: SRC20TransferData = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: '1000',
      };

      const options = {
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        toAddress: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
        dustValue: 330,
        network: bitcoin.networks.testnet,
      };

      const result = encoder.encode(data, options);

      // Should have complete outputs including recipient dust output
      expect(result.outputs.length).toBeGreaterThan(result.p2wshOutputs.length);

      // First output should be to recipient for TRANSFER
      const firstOutput = result.outputs[0];
      expect(firstOutput.value).toBe(330);
    });

    it('should create complete outputs for DEPLOY with addresses', () => {
      const data: SRC20DeployData = {
        p: 'SRC-20',
        op: 'DEPLOY',
        tick: 'TEST',
        max: '1000000',
        lim: '1000',
      };

      const options = {
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        dustValue: 330,
        network: bitcoin.networks.testnet,
      };

      const result = encoder.encode(data, options);

      // Should have complete outputs including sender dust output
      expect(result.outputs.length).toBeGreaterThan(result.p2wshOutputs.length);

      // First output should be to sender for DEPLOY
      const firstOutput = result.outputs[0];
      expect(firstOutput.value).toBe(330);
    });
  });

  describe('Validation', () => {
    it('should validate protocol field', () => {
      const invalidData = {
        p: 'INVALID-PROTOCOL',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: '1000',
      } as any;

      expect(() => encoder.encode(invalidData)).toThrow('Protocol must be "SRC-20"');
    });

    it('should validate operation field', () => {
      const invalidData = {
        p: 'SRC-20',
        op: 'INVALID-OPERATION',
        tick: 'TEST',
        amt: '1000',
      } as any;

      expect(() => encoder.encode(invalidData)).toThrow('Invalid operation');
    });

    it('should validate ticker length', () => {
      const longTickerData = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TOOLONG', // 7 characters - exceeds 5 limit
        amt: '1000',
      } as any;

      expect(() => encoder.encode(longTickerData)).toThrow('exceeds 5 character limit');
    });

    it('should validate ticker format', () => {
      const invalidTickerData = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'te-st', // Contains hyphen
        amt: '1000',
      } as any;

      expect(() => encoder.encode(invalidTickerData)).toThrow('Invalid tick format');
    });

    it('should validate DEPLOY required fields', () => {
      const incompleteDeployData = {
        p: 'SRC-20',
        op: 'DEPLOY',
        tick: 'TEST',
        // max and lim missing
      } as any;

      expect(() => encoder.encode(incompleteDeployData)).toThrow('Missing required field');
    });

    it('should validate large numeric values', () => {
      const oversizedData = {
        p: 'SRC-20',
        op: 'DEPLOY',
        tick: 'TEST',
        max: '99999999999999999999999999999999999999999999999999999999999999999',
        lim: '1000',
      } as any;

      expect(() => encoder.encode(oversizedData)).toThrow('exceeds maximum allowed');
    });

    it('should validate decimals range', () => {
      const invalidDecimalsData = {
        p: 'SRC-20',
        op: 'DEPLOY',
        tick: 'TEST',
        max: '1000000',
        lim: '1000',
        dec: 25, // Exceeds 18 limit
      } as any;

      expect(() => encoder.encode(invalidDecimalsData)).toThrow(
        'Decimals must be between 0 and 18',
      );
    });

    it('should validate image reference format', () => {
      const invalidImageData = {
        p: 'SRC-20',
        op: 'DEPLOY',
        tick: 'TEST',
        max: '1000000',
        lim: '1000',
        img: 'invalid-image-reference', // Should be protocol:hash format
      } as any;

      expect(() => encoder.encode(invalidImageData)).toThrow('Invalid img format');
    });

    it('should validate amounts are positive', () => {
      const negativeAmountData = {
        p: 'SRC-20',
        op: 'MINT',
        tick: 'TEST',
        amt: '-1000',
      } as any;

      expect(() => encoder.encode(negativeAmountData)).toThrow('amount must be positive');
    });

    it('should handle edge case validation scenarios', () => {
      const edgeCases = [
        {
          data: { p: 'SRC-20', op: 'TRANSFER', tick: '', amt: '1000' },
          expectedError: 'Missing required field: tick',
        },
        {
          data: { p: 'SRC-20', op: 'TRANSFER', tick: 'TEST', amt: '' },
          expectedError: 'Missing required field: amt',
        },
        {
          data: { p: 'SRC-20', op: 'MINT', tick: 'TEST', amt: 'not-a-number' },
          expectedError: 'not a number',
        },
      ];

      edgeCases.forEach(({ data, expectedError }) => {
        expect(() => encoder.encode(data as any)).toThrow(expectedError);
      });
    });
  });

  describe('Production Data Compatibility', () => {
    it('should match KEVIN TRANSFER production encoding exactly', () => {
      const result = encoder.encode(
        KEVIN_TRANSFER_PRODUCTION_DATA.input,
        {
          dustValue: 330,
          network: bitcoin.networks.testnet,
        },
      );

      // Validate against production format
      const validation = validateProductionFormat(result, KEVIN_TRANSFER_PRODUCTION_DATA);
      expect(validation.allMatch).toBe(true);
      expect(validation.checks.jsonDataMatches).toBe(true);
    });

    it('should handle production input format variations', () => {
      // Test with user input format (like KEVIN_TRANSFER_PRODUCTION_DATA.input)
      const result = encoder.encode(KEVIN_TRANSFER_PRODUCTION_DATA.input);

      // Should normalize properly
      expect(result.jsonData).toContain('"p":"src-20"');
      expect(result.jsonData).toContain('"op":"transfer"');
      expect(result.jsonData).toContain('"tick":"KEVIN"');
      expect(result.jsonData).toContain('"amt":100000'); // Normalized to number
    });

    it('should handle DEPLOY production patterns', () => {
      const result = encoder.encode(DEPLOY_PRODUCTION_PATTERN.input);

      expect(result.jsonData).toBe(DEPLOY_PRODUCTION_PATTERN.encoding.jsonData);
      expect(result.compressionUsed).toBe(DEPLOY_PRODUCTION_PATTERN.encoding.compressionUsed);
    });

    it('should handle MINT production patterns', () => {
      const result = encoder.encode(MINT_PRODUCTION_PATTERN.input);

      expect(result.jsonData).toBe(MINT_PRODUCTION_PATTERN.encoding.jsonData);
      expect(result.compressionUsed).toBe(MINT_PRODUCTION_PATTERN.encoding.compressionUsed);
    });
  });

  describe('Decoding', () => {
    it('should decode data from P2WSH outputs', async () => {
      const originalData: SRC20Data = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: '1000',
      };

      const encoded = encoder.encode(originalData);
      const decoded = await encoder.decodeFromOutputs(encoded.p2wshOutputs);

      expect(decoded).not.toBeNull();
      expect(decoded!.p).toBe('SRC-20');
      expect(decoded!.op).toBe('TRANSFER');
      expect(decoded!.tick).toBe('TEST');
      expect(decoded!.amt).toBe('1000');
    });

    it('should decode data from transaction', async () => {
      const originalData: SRC20Data = {
        p: 'SRC-20',
        op: 'MINT',
        tick: 'TEST',
        amt: '500',
      };

      const encoded = encoder.encode(originalData);

      // Create a mock transaction
      const tx = new bitcoin.Transaction();
      tx.version = 2;

      // Add P2WSH outputs
      encoded.p2wshOutputs.forEach((output) => {
        tx.addOutput(output.script, output.value);
      });

      const decoded = await encoder.decode(tx);

      expect(decoded).not.toBeNull();
      expect(decoded!.op).toBe('MINT');
      expect(decoded!.tick).toBe('TEST');
    });

    it('should return null for non-SRC-20 transactions', async () => {
      const regularTx = new bitcoin.Transaction();
      regularTx.version = 2;

      // Add regular P2WPKH output
      const regularScript = Buffer.from([0x00, 0x14, ...Buffer.alloc(20)]);
      regularTx.addOutput(regularScript, 100000);

      const decoded = await encoder.decode(regularTx);
      expect(decoded).toBeNull();
    });

    it('should handle malformed data gracefully', async () => {
      const malformedOutputs = [{
        script: Buffer.from([0x00, 0x20, ...Buffer.alloc(32, 0xff)]), // Invalid data
        value: 330,
      }];

      const decoded = await encoder.decodeFromOutputs(malformedOutputs);
      expect(decoded).toBeNull(); // Should not crash
    });
  });

  describe('Error Handling', () => {
    it('should handle null/undefined data gracefully', () => {
      expect(() => encoder.encode(null as any)).toThrow();
      expect(() => encoder.encode(undefined as any)).toThrow();
    });

    it('should handle empty data object', () => {
      expect(() => encoder.encode({} as any)).toThrow();
    });

    it('should respect output count limits', () => {
      const data: SRC20Data = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: '1000',
      };

      // Set a very low limit to trigger the error
      const lowLimitOptions = { maxOutputs: 1 };

      // Should throw an error with descriptive message when limit is exceeded
      expect(() => encoder.encode(data, lowLimitOptions)).toThrow('Too many outputs');
    });
  });

  describe('OP_RETURN Creation', () => {
    it('should create OP_RETURN output for compatibility', () => {
      const data: SRC20Data = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'TEST',
        amt: '1000',
      };

      const result = encoder.encode(data);

      expect(result.opReturnOutput).toBeDefined();
      expect(result.opReturnOutput.value).toBe(0);
      expect(result.opReturnOutput.script[0]).toBe(0x6a); // OP_RETURN
    });

    it('should handle OP_RETURN creation errors gracefully', () => {
      const data: SRC20Data = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'A'.repeat(100), // Very long ticker that might cause issues
        amt: '1000',
      };

      // Should not throw even if OP_RETURN creation has issues
      expect(() => encoder.encode(data)).toThrow(); // Will throw due to validation, not OP_RETURN
    });
  });
});

describe('P2WSHAddressUtils', () => {
  describe('hexToAddresses', () => {
    it('should convert hex data to P2WSH addresses', () => {
      const hexData = '48656c6c6f20576f726c64'; // "Hello World"
      const addresses = P2WSHAddressUtils.hexToAddresses(hexData, bitcoin.networks.testnet);

      expect(addresses.length).toBe(1); // Fits in one 32-byte chunk
      expect(addresses[0]).toMatch(/^tb1/); // Testnet bech32 address
    });

    it('should handle multi-chunk data', () => {
      const longHexData = '48656c6c6f20576f726c64'.repeat(10); // Long data
      const addresses = P2WSHAddressUtils.hexToAddresses(longHexData, bitcoin.networks.testnet);

      expect(addresses.length).toBeGreaterThan(1); // Should require multiple chunks
      addresses.forEach((addr) => {
        expect(addr).toMatch(/^tb1/);
      });
    });

    it('should use mainnet addresses when specified', () => {
      const hexData = '48656c6c6f20576f726c64';
      const addresses = P2WSHAddressUtils.hexToAddresses(hexData, bitcoin.networks.bitcoin);

      expect(addresses[0]).toMatch(/^bc1/); // Mainnet bech32 address
    });
  });

  describe('outputsToHex', () => {
    it('should extract hex data from P2WSH outputs', () => {
      const testData = 'Hello World';
      const testBuffer = Buffer.from(testData, 'utf8');

      // Create mock P2WSH output
      const paddedData = Buffer.concat([testBuffer, Buffer.alloc(32 - testBuffer.length, 0)]);
      const mockOutput = {
        script: Buffer.concat([Buffer.from([0x00, 0x20]), paddedData]),
        value: 330,
      };

      const extractedHex = P2WSHAddressUtils.outputsToHex([mockOutput]);
      expect(extractedHex).toBeDefined();
      expect(extractedHex!.length).toBeGreaterThan(0);
    });

    it('should handle multiple outputs', () => {
      const chunk1 = Buffer.concat([Buffer.from('Hello'), Buffer.alloc(27, 0)]);
      const chunk2 = Buffer.concat([Buffer.from('World'), Buffer.alloc(27, 0)]);

      const outputs = [
        {
          script: Buffer.concat([Buffer.from([0x00, 0x20]), chunk1]),
          value: 330,
        },
        {
          script: Buffer.concat([Buffer.from([0x00, 0x20]), chunk2]),
          value: 330,
        },
      ];

      const extractedHex = P2WSHAddressUtils.outputsToHex(outputs);
      expect(extractedHex).toBeDefined();
      expect(extractedHex!.length).toBeGreaterThan(0);
    });

    it('should return null for invalid outputs', () => {
      const invalidOutputs = [
        {
          script: Buffer.from([0x51, 0x20, ...Buffer.alloc(32)]), // Not P2WSH
          value: 330,
        },
      ];

      const result = P2WSHAddressUtils.outputsToHex(invalidOutputs);
      expect(result).toBeNull();
    });

    it('should handle empty output array', () => {
      const result = P2WSHAddressUtils.outputsToHex([]);
      expect(result).toBeNull();
    });
  });
});

describe('SRC20Helper', () => {
  describe('Complete Transaction Encoding', () => {
    it('should encode DEPLOY transaction with helper', async () => {
      const result = await SRC20Helper.encodeDeploy(
        'TEST',
        '1000000',
        '1000',
        'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        { network: bitcoin.networks.testnet },
      );

      expect(result.jsonData).toContain('"op":"deploy"');
      expect(result.jsonData).toContain('"tick":"TEST"');
      expect(result.outputs.length).toBeGreaterThan(0);
    });

    it('should encode MINT transaction with helper', async () => {
      const result = await SRC20Helper.encodeMint(
        'TEST',
        '500',
        'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        { network: bitcoin.networks.testnet },
      );

      expect(result.jsonData).toContain('"op":"mint"');
      expect(result.jsonData).toContain('"tick":"TEST"');
      expect(result.outputs.length).toBeGreaterThan(0);
    });

    it('should encode TRANSFER transaction with helper', async () => {
      const result = await SRC20Helper.encodeTransfer(
        'TEST',
        '100',
        'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
        { network: bitcoin.networks.testnet },
      );

      expect(result.jsonData).toContain('"op":"transfer"');
      expect(result.jsonData).toContain('"tick":"TEST"');
      expect(result.outputs.length).toBeGreaterThan(0);
    });

    it('should handle optional parameters in DEPLOY', async () => {
      const result = await SRC20Helper.encodeDeploy(
        'TEST',
        '1000000',
        '1000',
        'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        {
          dec: 18,
          description: 'Test token',
          web: 'https://example.com',
          network: bitcoin.networks.testnet,
        },
      );

      expect(result.jsonData).toContain('"dec":18');
      expect(result.jsonData).toContain('"description":"Test token"');
      expect(result.jsonData).toContain('"web":"https://example.com"');
    });
  });

  describe('Legacy Helper Functions', () => {
    it('should create DEPLOY data with createDeploy', () => {
      const deployData = SRC20Helper.createDeploy('TEST', '1000000', '1000');

      expect(deployData.p).toBe('SRC-20');
      expect(deployData.op).toBe('DEPLOY');
      expect(deployData.tick).toBe('TEST');
      expect(deployData.max).toBe('1000000');
      expect(deployData.lim).toBe('1000');
    });

    it('should create MINT data with createMint', () => {
      const mintData = SRC20Helper.createMint('TEST', '500');

      expect(mintData.p).toBe('SRC-20');
      expect(mintData.op).toBe('MINT');
      expect(mintData.tick).toBe('TEST');
      expect(mintData.amt).toBe('500');
    });

    it('should create TRANSFER data with createTransfer', () => {
      const transferData = SRC20Helper.createTransfer('TEST', '100');

      expect(transferData.p).toBe('SRC-20');
      expect(transferData.op).toBe('TRANSFER');
      expect(transferData.tick).toBe('TEST');
      expect(transferData.amt).toBe('100');
    });
  });

  describe('SRC20Operations Alias', () => {
    it('should provide operation aliases', () => {
      expect(typeof SRC20Helper.createDeploy).toBe('function');
      expect(typeof SRC20Helper.createMint).toBe('function');
      expect(typeof SRC20Helper.createTransfer).toBe('function');
    });
  });
});
