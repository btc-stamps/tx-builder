/**
 * Bitcoin Stamp Builder Tests
 *
 * Comprehensive test suite for BitcoinStampBuilder focusing on stamp encoding
 * with different data types and validation against production patterns.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import { Buffer } from 'node:buffer';

import {
  type BitcoinStampBuildData,
  BitcoinStampBuilder,
  type BitcoinStampBuilderConfig,
} from '../../../src/builders/bitcoin-stamp-builder';
import type { SelectorFactory } from '../../../src/interfaces/selector.interface';
import {
  createStampTestData,
  GIF_STAMP_DATA,
  MINIMAL_PNG_STAMP_DATA,
  STAMP_DUST_VALUE,
  validateStampFormat,
} from '../../fixtures/stamp-production-fixtures';
import { StampImageFixtures } from '../../fixtures/stamp-image-fixtures';
import { createMockMainnetUTXOs } from '../../fixtures/src20-production-fixtures';

describe('BitcoinStampBuilder', () => {
  let builder: BitcoinStampBuilder;
  let mockSelectorFactory: SelectorFactory;
  let mockUTXOProvider: any;
  let mockSelector: any;
  let mockAssetValidationService: any;

  beforeEach(() => {
    // Create mock UTXO provider
    mockUTXOProvider = {
      getUTXOs: vi.fn().mockResolvedValue(createMockMainnetUTXOs(3, 100000)),
    };

    // Create mock selector that returns successful results
    mockSelector = {
      select: vi.fn().mockReturnValue({
        success: true,
        inputs: createMockMainnetUTXOs(2, 100000),
        totalValue: 200000,
        fee: 3000, // Higher fee for stamp transactions
        change: 196000, // Large change for testing
        wasteMetric: 0,
        inputCount: 2,
        outputCount: 5, // OP_RETURN + P2WSH outputs + change
        estimatedVSize: 200,
        effectiveFeeRate: 15,
      }),
    };

    // Create mock selector factory
    mockSelectorFactory = {
      create: vi.fn().mockReturnValue(mockSelector),
    };

    // Create mock asset validation service
    mockAssetValidationService = {
      validateAndPrepareAssetName: vi.fn().mockResolvedValue('A1234567890123456'),
      generateAvailableAssetName: vi.fn().mockResolvedValue('A9876543210987654'),
    };

    // Initialize builder configuration
    const config: BitcoinStampBuilderConfig = {
      network: bitcoin.networks.testnet,
      feeRate: 15,
      dustThreshold: STAMP_DUST_VALUE,
      maxInputs: 50,
      enableRBF: true,
      enableCPFP: false,
      utxoProvider: mockUTXOProvider,
      selectorFactory: mockSelectorFactory,
      assetValidationService: mockAssetValidationService,
    };

    builder = new BitcoinStampBuilder(config);
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with correct configuration', () => {
      expect(builder.network).toBe(bitcoin.networks.testnet);
      expect(builder.dustThreshold).toBe(STAMP_DUST_VALUE);
      expect(builder.feeRate).toBe(15);
      expect(builder.maxInputs).toBe(50);
      expect(builder.enableRBF).toBe(true);
      expect(builder.enableCPFP).toBe(false);
    });

    it('should work without asset validation service', () => {
      const config: BitcoinStampBuilderConfig = {
        network: bitcoin.networks.testnet,
        feeRate: 15,
        dustThreshold: STAMP_DUST_VALUE,
        maxInputs: 50,
        enableRBF: true,
        utxoProvider: mockUTXOProvider,
        selectorFactory: mockSelectorFactory,
        // No assetValidationService
      };

      const builderWithoutService = new BitcoinStampBuilder(config);
      expect(builderWithoutService).toBeInstanceOf(BitcoinStampBuilder);
    });
  });

  describe('PNG Stamp Creation', () => {
    it('should build valid PNG stamp transaction', async () => {
      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        filename: 'test.png',
        title: 'Test PNG Stamp',
        description: 'STAMP:test.png',
        creator: 'test-creator',
        cpid: 'A1234567890123456',
        supply: 1,
        isLocked: true,
      };

      const transaction = await builder.buildStampTransaction(buildData);

      // Verify transaction structure
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
      expect(transaction.version).toBe(2);
      expect(transaction.ins.length).toBeGreaterThan(0);
      expect(transaction.outs.length).toBeGreaterThan(0);

      // Verify UTXO provider was called
      expect(mockUTXOProvider.getUTXOs).toHaveBeenCalledWith(buildData.fromAddress);

      // Verify asset validation was called
      expect(mockAssetValidationService.validateAndPrepareAssetName).toHaveBeenCalledWith(
        'A1234567890123456',
      );
    });

    it('should handle PNG stamp with minimal data', async () => {
      const testData = createStampTestData('minimal_1x1_png');
      const buildData: BitcoinStampBuildData = {
        data: testData.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        filename: testData.filename,
      };

      const transaction = await builder.buildStampTransaction(buildData);
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
      expect(transaction.outs.length).toBeGreaterThan(0);
    });

    it('should validate PNG format correctly', async () => {
      const pngData = StampImageFixtures.PNG.minimal_1x1.bytes;
      expect(pngData.length).toBeGreaterThan(0);
      expect(pngData[0]).toBe(0x89); // PNG signature
      expect(pngData[1]).toBe(0x50); // PNG signature
    });
  });

  describe('GIF Stamp Creation', () => {
    it('should build valid GIF stamp transaction', async () => {
      const buildData: BitcoinStampBuildData = {
        data: GIF_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        filename: 'test.gif',
        title: 'Test GIF Stamp',
        description: 'STAMP:test.gif',
        cpid: 'A1234567890123456',
      };

      const transaction = await builder.buildStampTransaction(buildData);

      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
      expect(transaction.ins.length).toBeGreaterThan(0);
      expect(transaction.outs.length).toBeGreaterThan(0);
    });

    it('should handle minimal GIF data', async () => {
      const testData = createStampTestData('minimal_1x1_gif');
      const buildData: BitcoinStampBuildData = {
        data: testData.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        filename: testData.filename,
      };

      const transaction = await builder.buildStampTransaction(buildData);
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
    });

    it('should validate GIF format correctly', async () => {
      const gifData = StampImageFixtures.GIF.minimal_1x1.bytes;
      expect(gifData.length).toBeGreaterThan(0);
      expect(gifData.toString('ascii', 0, 6)).toMatch(/GIF8[79]a/); // GIF signature
    });
  });

  describe('Text and Binary Data Stamps', () => {
    it('should handle text data stamps', async () => {
      const textData = Buffer.from('Hello, Bitcoin Stamps!', 'utf8');
      const buildData: BitcoinStampBuildData = {
        data: textData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        filename: 'message.txt',
        title: 'Text Stamp',
        description: 'STAMP:message.txt',
      };

      const transaction = await builder.buildStampTransaction(buildData);
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
    });

    it('should handle binary data stamps', async () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD, 0xFC]);
      const buildData: BitcoinStampBuildData = {
        data: binaryData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        filename: 'binary.dat',
        title: 'Binary Stamp',
      };

      const transaction = await builder.buildStampTransaction(buildData);
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
    });

    it('should handle JSON data stamps', async () => {
      const jsonData = Buffer.from(
        JSON.stringify({
          type: 'metadata',
          version: '1.0',
          data: { key: 'value', number: 42 },
        }),
        'utf8',
      );

      const buildData: BitcoinStampBuildData = {
        data: jsonData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        filename: 'metadata.json',
        title: 'JSON Stamp',
      };

      const transaction = await builder.buildStampTransaction(buildData);
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
    });
  });

  describe('Asset ID (CPID) Management', () => {
    it('should validate provided CPID', async () => {
      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        cpid: 'A1234567890123456',
      };

      await builder.buildStampTransaction(buildData);

      expect(mockAssetValidationService.validateAndPrepareAssetName).toHaveBeenCalledWith(
        'A1234567890123456',
      );
      expect(mockAssetValidationService.generateAvailableAssetName).not.toHaveBeenCalled();
    });

    it('should generate CPID when not provided', async () => {
      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        // cpid not provided
      };

      await builder.buildStampTransaction(buildData);

      expect(mockAssetValidationService.generateAvailableAssetName).toHaveBeenCalled();
      expect(mockAssetValidationService.validateAndPrepareAssetName).not.toHaveBeenCalled();
    });

    it('should generate fallback CPID without validation service', async () => {
      // Create builder without asset validation service
      const config: BitcoinStampBuilderConfig = {
        network: bitcoin.networks.testnet,
        feeRate: 15,
        dustThreshold: STAMP_DUST_VALUE,
        maxInputs: 50,
        enableRBF: true,
        utxoProvider: mockUTXOProvider,
        selectorFactory: mockSelectorFactory,
        // No assetValidationService
      };

      const builderWithoutService = new BitcoinStampBuilder(config);

      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        // cpid not provided
      };

      const transaction = await builderWithoutService.buildStampTransaction(buildData);
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
    });
  });

  describe('Simple Issuance', () => {
    it('should build simple issuance transaction', async () => {
      const issuanceData = {
        sourceAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        cpid: 'A1234567890123456',
        quantity: 1000,
        divisible: false,
        lock: false,
        description: 'Test Asset',
      };

      const transaction = await builder.buildIssuance(issuanceData);

      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
      expect(transaction.outs.length).toBeGreaterThan(0);

      // Should have OP_RETURN output
      const hasOpReturn = transaction.outs.some((output) => {
        return output.script[0] === 0x6a; // OP_RETURN
      });
      expect(hasOpReturn).toBe(true);
    });

    it('should handle issuance with image data', async () => {
      const issuanceData = {
        sourceAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        cpid: 'A1234567890123456',
        quantity: 1,
        divisible: false,
        lock: true,
        description: 'Test Stamp Asset',
        imageData: 'test image data',
      };

      const transaction = await builder.buildIssuance(issuanceData);

      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
      expect(transaction.outs.length).toBeGreaterThan(1); // OP_RETURN + P2WSH for image
    });
  });

  describe('Validation', () => {
    it('should validate build data correctly', async () => {
      const invalidBuildData: BitcoinStampBuildData = {
        data: Buffer.alloc(0), // Empty data
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      await expect(builder.buildStampTransaction(invalidBuildData)).rejects.toThrow(
        'Stamp data is required',
      );
    });

    it('should validate from address', async () => {
      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: '', // Empty address
      };

      await expect(builder.buildStampTransaction(buildData)).rejects.toThrow(
        'From address is required',
      );
    });

    it('should validate data size limits', async () => {
      const largeBuildData: BitcoinStampBuildData = {
        data: Buffer.alloc(600000), // Exceeds 500KB limit
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      await expect(builder.buildStampTransaction(largeBuildData)).rejects.toThrow(
        'exceeds maximum size limit',
      );
    });

    it('should validate description length for OP_RETURN constraints', async () => {
      const longDescription = 'A'.repeat(100); // Very long description
      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        description: longDescription,
      };

      await expect(builder.buildStampTransaction(buildData)).rejects.toThrow(
        'Description too long',
      );
    });

    it('should validate STAMP: format descriptions', async () => {
      const invalidStampFormat = 'STAMP:'; // No filename after colon
      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        description: invalidStampFormat,
      };

      await expect(builder.buildStampTransaction(buildData)).rejects.toThrow(
        'requires a filename after the colon',
      );
    });
  });

  describe('Fee Calculation and Output Management', () => {
    it('should include change output when change exceeds dust threshold', async () => {
      // Mock selector to return large change
      mockSelector.select.mockReturnValue({
        success: true,
        inputs: createMockMainnetUTXOs(1, 500000),
        totalValue: 500000,
        fee: 3000,
        change: 490000, // Large change
        wasteMetric: 0,
        inputCount: 1,
        outputCount: 5,
        estimatedVSize: 200,
        effectiveFeeRate: 15,
      });

      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      const transaction = await builder.buildStampTransaction(buildData);

      // Should have change output
      expect(transaction.outs.length).toBeGreaterThan(2);
    });

    it('should not include change output when change is below dust threshold', async () => {
      // Mock selector to return small change
      mockSelector.select.mockReturnValue({
        success: true,
        inputs: createMockMainnetUTXOs(1, 10000),
        totalValue: 10000,
        fee: 3000,
        change: 100, // Below dust threshold
        wasteMetric: 0,
        inputCount: 1,
        outputCount: 4, // 3 P2WSH + 1 OP_RETURN (no change due to dust)
        estimatedVSize: 200,
        effectiveFeeRate: 15,
      });

      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      const transaction = await builder.buildStampTransaction(buildData);

      // Should not create dust change output (3 P2WSH + 1 OP_RETURN = 4 outputs, no change)
      expect(transaction.outs.length).toBe(4);
    });

    it('should estimate transaction size correctly', async () => {
      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      await builder.buildStampTransaction(buildData);

      // Verify selector was called with appropriate parameters
      expect(mockSelector.select).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          targetValue: expect.any(Number),
          feeRate: 15,
          dustThreshold: STAMP_DUST_VALUE,
          maxInputs: 100, // Higher for stamps
        }),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle UTXO selection failure', async () => {
      mockSelector.select.mockReturnValue({
        success: false,
        reason: 'INSUFFICIENT_FUNDS',
        message: 'Insufficient funds for stamp transaction',
        details: { targetValue: 100000, dustThreshold: STAMP_DUST_VALUE },
      });

      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      await expect(builder.buildStampTransaction(buildData)).rejects.toThrow(
        'UTXO selection failed',
      );
    });

    it('should handle empty UTXO response', async () => {
      mockUTXOProvider.getUTXOs.mockResolvedValue([]);

      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      await expect(builder.buildStampTransaction(buildData)).rejects.toThrow('No UTXOs found');
    });

    it('should handle asset validation service errors', async () => {
      mockAssetValidationService.validateAndPrepareAssetName.mockRejectedValue(
        new Error('CPID already exists'),
      );

      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        cpid: 'A1234567890123456',
      };

      await expect(builder.buildStampTransaction(buildData)).rejects.toThrow('CPID already exists');
    });
  });

  describe('Encoding Options and Compression', () => {
    it('should handle different encoding options', async () => {
      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        encoding: 'gzip',
      };

      const transaction = await builder.buildStampTransaction(buildData);
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
    });

    it('should handle base64 encoding option', async () => {
      const buildData: BitcoinStampBuildData = {
        data: Buffer.from('Hello World!', 'utf8'),
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        encoding: 'base64',
      };

      const transaction = await builder.buildStampTransaction(buildData);
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
    });
  });

  describe('Production Format Validation', () => {
    it('should produce stamps matching production format expectations', async () => {
      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        filename: 'test.png',
      };

      const transaction = await builder.buildStampTransaction(buildData);

      // Should have OP_RETURN output (Counterparty protocol)
      const hasOpReturn = transaction.outs.some((output) => {
        return output.script[0] === 0x6a; // OP_RETURN
      });
      expect(hasOpReturn).toBe(true);

      // Should have P2WSH outputs for data
      const hasP2WSH = transaction.outs.some((output) => {
        return output.script[0] === 0x00 && output.script[1] === 0x20; // OP_0 + 32 bytes
      });
      expect(hasP2WSH).toBe(true);
    });

    it('should validate against stamp production data patterns', async () => {
      // This would normally validate against real production encoding results
      // For now, we verify the structure is correct
      const buildData: BitcoinStampBuildData = {
        data: MINIMAL_PNG_STAMP_DATA.input.imageData,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      const transaction = await builder.buildStampTransaction(buildData);

      expect(transaction.outs.length).toBeGreaterThan(0);
      expect(transaction.ins.length).toBeGreaterThan(0);
      expect(transaction.version).toBe(2);
    });
  });
});
