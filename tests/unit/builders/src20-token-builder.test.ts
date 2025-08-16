/**
 * SRC-20 Token Builder Tests
 *
 * Comprehensive test suite for SRC20TokenBuilder focusing on DEPLOY, MINT, and TRANSFER operations
 * using production fixtures to validate against real transaction patterns.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';

import { SRC20TokenBuilder } from '../../../src/builders/src20-token-builder';
import { SRC20Encoder } from '../../../src/encoders/src20-encoder';
import type { SelectorFactory } from '../../../src/interfaces/selector.interface';
import type {
  SRC20DeployData,
  SRC20MintData,
  SRC20TransferData,
} from '../../../src/interfaces/src20.interface';
import {
  createMockMainnetUTXOs,
  DEPLOY_PRODUCTION_PATTERN,
  KEVIN_TRANSFER_PRODUCTION_DATA,
  MINT_PRODUCTION_PATTERN,
  validateProductionFormat,
} from '../../fixtures/src20-production-fixtures';

// Test setup
describe('SRC20TokenBuilder', () => {
  let builder: SRC20TokenBuilder;
  let mockSelectorFactory: SelectorFactory;
  let mockUTXOProvider: any;
  let mockSelector: any;

  beforeEach(() => {
    // Create mock UTXO provider
    mockUTXOProvider = {
      getUTXOs: vi.fn().mockResolvedValue(createMockMainnetUTXOs(3, 75000)),
    };

    // Create mock selector that returns successful results
    mockSelector = {
      select: vi.fn().mockReturnValue({
        success: true,
        inputs: createMockMainnetUTXOs(2, 75000),
        totalValue: 150000,
        fee: 2250, // 15 sat/vB * 150 vBytes
        change: 147750 - 990, // Total - dust outputs - fee
        wasteMetric: 0,
        inputCount: 2,
        outputCount: 4,
        estimatedVSize: 150,
        effectiveFeeRate: 15,
      }),
    };

    // Create mock selector factory
    mockSelectorFactory = {
      create: vi.fn().mockReturnValue(mockSelector),
    };

    // Initialize builder with testnet for testing
    builder = new SRC20TokenBuilder(
      bitcoin.networks.testnet,
      mockSelectorFactory,
      {
        utxoProvider: mockUTXOProvider,
        feeRate: 15,
        dustThreshold: 330,
        maxInputs: 50,
        enableRBF: true,
      },
    );
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with correct default values', () => {
      expect(builder.network).toBe(bitcoin.networks.testnet);
      expect(builder.dustThreshold).toBe(330);
      expect(builder.feeRate).toBe(15);
      expect(builder.maxInputs).toBe(50);
      expect(builder.enableRBF).toBe(true);
    });

    it('should accept custom options', () => {
      const customBuilder = new SRC20TokenBuilder(
        bitcoin.networks.bitcoin,
        mockSelectorFactory,
        {
          dustThreshold: 500,
          feeRate: 25,
          maxInputs: 100,
          enableRBF: false,
        },
      );

      expect(customBuilder.network).toBe(bitcoin.networks.bitcoin);
      expect(customBuilder.dustThreshold).toBe(500);
      expect(customBuilder.feeRate).toBe(25);
      expect(customBuilder.maxInputs).toBe(100);
      expect(customBuilder.enableRBF).toBe(false);
    });
  });

  describe('DEPLOY Operation', () => {
    it('should build valid DEPLOY transaction using production pattern', async () => {
      const deployData: SRC20DeployData & { fromAddress: string } = {
        ...DEPLOY_PRODUCTION_PATTERN.input,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      const transaction = await builder.buildDeploy(deployData);

      // Verify transaction structure
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
      expect(transaction.version).toBe(2);
      expect(transaction.ins.length).toBeGreaterThan(0);
      expect(transaction.outs.length).toBeGreaterThan(0);

      // Verify UTXO provider was called
      expect(mockUTXOProvider.getUTXOs).toHaveBeenCalledWith(deployData.fromAddress);

      // Verify selector was used
      expect(mockSelectorFactory.create).toHaveBeenCalledWith('accumulative');
      expect(mockSelector.select).toHaveBeenCalled();
    });

    it('should encode data correctly for DEPLOY', async () => {
      // Test the encoder directly to validate encoding against production data
      const encoder = new SRC20Encoder();
      const encodingResult = encoder.encode(
        DEPLOY_PRODUCTION_PATTERN.input,
        {
          dustValue: 330,
          network: bitcoin.networks.testnet,
          fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        },
      );

      expect(encodingResult.jsonData).toBe(DEPLOY_PRODUCTION_PATTERN.encoding.jsonData);
      expect(encodingResult.compressionUsed).toBe(
        DEPLOY_PRODUCTION_PATTERN.encoding.compressionUsed,
      );
      expect(encodingResult.p2wshOutputs.length).toBeGreaterThan(0);
    });

    it('should validate DEPLOY data correctly', async () => {
      const invalidDeployData = {
        p: 'SRC-20' as const,
        op: 'DEPLOY' as const,
        tick: 'TOOLONGTICKERTEST', // Invalid: too long
        max: '1000000',
        lim: '1000',
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      await expect(builder.buildDeploy(invalidDeployData)).rejects.toThrow();
    });

    it('should handle missing fromAddress', async () => {
      const deployData = {
        ...DEPLOY_PRODUCTION_PATTERN.input,
        // fromAddress missing
      } as any;

      await expect(builder.buildDeploy(deployData)).rejects.toThrow('From address is required');
    });
  });

  describe('MINT Operation', () => {
    it('should build valid MINT transaction using production pattern', async () => {
      const mintData: SRC20MintData & { fromAddress: string } = {
        ...MINT_PRODUCTION_PATTERN.input,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      const transaction = await builder.buildMint(mintData);

      // Verify transaction structure
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
      expect(transaction.version).toBe(2);
      expect(transaction.ins.length).toBeGreaterThan(0);
      expect(transaction.outs.length).toBeGreaterThan(0);

      // Verify UTXO provider was called
      expect(mockUTXOProvider.getUTXOs).toHaveBeenCalledWith(mintData.fromAddress);
    });

    it('should encode data correctly for MINT', async () => {
      const encoder = new SRC20Encoder();
      const encodingResult = encoder.encode(
        MINT_PRODUCTION_PATTERN.input,
        {
          dustValue: 330,
          network: bitcoin.networks.testnet,
          fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        },
      );

      expect(encodingResult.jsonData).toBe(MINT_PRODUCTION_PATTERN.encoding.jsonData);
      expect(encodingResult.compressionUsed).toBe(MINT_PRODUCTION_PATTERN.encoding.compressionUsed);
    });

    it('should validate MINT data correctly', async () => {
      const invalidMintData = {
        p: 'SRC-20' as const,
        op: 'MINT' as const,
        tick: 'DEMO',
        amt: '', // Invalid: empty amount
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      await expect(builder.buildMint(invalidMintData)).rejects.toThrow();
    });
  });

  describe('TRANSFER Operation', () => {
    it('should build valid TRANSFER transaction using production data', async () => {
      const transferData: SRC20TransferData & { fromAddress: string; toAddress: string } = {
        ...KEVIN_TRANSFER_PRODUCTION_DATA.input,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        toAddress: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
      };

      const transaction = await builder.buildTransfer(transferData);

      // Verify transaction structure
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
      expect(transaction.version).toBe(2);
      expect(transaction.ins.length).toBeGreaterThan(0);
      expect(transaction.outs.length).toBeGreaterThan(0);
    });

    it('should encode TRANSFER data matching production format', async () => {
      const encoder = new SRC20Encoder();
      const encodingResult = encoder.encode(
        KEVIN_TRANSFER_PRODUCTION_DATA.normalized,
        {
          dustValue: 330,
          network: bitcoin.networks.testnet,
          fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          toAddress: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
        },
      );

      // Validate against production format
      const validation = validateProductionFormat(encodingResult, KEVIN_TRANSFER_PRODUCTION_DATA);
      expect(validation.allMatch).toBe(true);
      expect(validation.checks.jsonDataMatches).toBe(true);
      expect(validation.checks.compressionMatches).toBe(true);
    });

    it('should validate TRANSFER data correctly', async () => {
      const invalidTransferData = {
        p: 'SRC-20' as const,
        op: 'TRANSFER' as const,
        tick: '', // Invalid: empty ticker
        amt: '1000',
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        toAddress: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
      };

      await expect(builder.buildTransfer(invalidTransferData)).rejects.toThrow();
    });

    it('should handle missing toAddress for TRANSFER', async () => {
      const transferData = {
        ...KEVIN_TRANSFER_PRODUCTION_DATA.input,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        // toAddress missing
      } as any;

      await expect(builder.buildTransfer(transferData)).rejects.toThrow('To address is required');
    });

    it('should allow self-transfers (same from and to address)', async () => {
      const sameAddress = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
      const transferData: SRC20TransferData & { fromAddress: string; toAddress: string } = {
        ...KEVIN_TRANSFER_PRODUCTION_DATA.input,
        fromAddress: sameAddress,
        toAddress: sameAddress,
      };

      // Should not throw error
      const transaction = await builder.buildTransfer(transferData);
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
    });
  });

  describe('Builder Pattern Interface', () => {
    it('should support buildTokenTransfer method', async () => {
      const utxos = createMockMainnetUTXOs(2, 75000);
      const options = {
        tick: 'KEVIN',
        amount: '100000',
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        toAddress: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
        feeRate: 15,
        dustValue: 330,
      };

      const result = await builder.buildTokenTransfer(utxos, options);

      expect(result.psbt).toBeDefined();
      expect(result.totalInputValue).toBeGreaterThan(0);
      expect(result.fee).toBeGreaterThan(0);
      expect(result.dataOutputs).toBeDefined();
      expect(result.dustValue).toBe(330);
    });

    it('should support buildTokenMint method', async () => {
      const utxos = createMockMainnetUTXOs(2, 75000);
      const options = {
        tick: 'DEMO',
        amount: '1000',
        mintingAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        feeRate: 15,
        dustValue: 330,
      };

      const result = await builder.buildTokenMint(utxos, options);

      expect(result.psbt).toBeDefined();
      expect(result.totalInputValue).toBeGreaterThan(0);
      expect(result.fee).toBeGreaterThan(0);
      expect(result.dataOutputs).toBeDefined();
    });

    it('should support buildTokenDeploy method', async () => {
      const utxos = createMockMainnetUTXOs(2, 75000);
      const options = {
        tick: 'DEMO',
        max: '21000000',
        lim: '1000',
        dec: 18,
        deployingAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        feeRate: 15,
        dustValue: 330,
      };

      const result = await builder.buildTokenDeploy(utxos, options);

      expect(result.psbt).toBeDefined();
      expect(result.totalInputValue).toBeGreaterThan(0);
      expect(result.fee).toBeGreaterThan(0);
      expect(result.dataOutputs).toBeDefined();
    });
  });

  describe('Utility Methods', () => {
    it('should return correct SRC-20 dust value', () => {
      expect(builder.getSRC20DustValue()).toBe(330);
      expect(SRC20TokenBuilder.getDustValue()).toBe(330);
    });

    it('should validate tick symbols correctly', () => {
      expect(builder.validateTick('KEVIN')).toBe(true);
      expect(builder.validateTick('DEMO')).toBe(true);
      expect(builder.validateTick('A')).toBe(true);
      expect(builder.validateTick('12345')).toBe(true);

      // Invalid cases
      expect(builder.validateTick('')).toBe(false);
      expect(builder.validateTick('TOOLONG')).toBe(false); // > 5 chars
      expect(builder.validateTick('test')).toBe(false); // lowercase
      expect(builder.validateTick('ABC-')).toBe(false); // special chars
      expect(builder.validateTick(123 as any)).toBe(false); // not string
    });

    it('should validate amounts correctly', () => {
      expect(builder.validateAmount('1000')).toBe(true);
      expect(builder.validateAmount('1000.5')).toBe(true);
      expect(builder.validateAmount('0.000001')).toBe(true);

      // Invalid cases
      expect(builder.validateAmount('')).toBe(false);
      expect(builder.validateAmount('0')).toBe(false);
      expect(builder.validateAmount('-100')).toBe(false);
      expect(builder.validateAmount('abc')).toBe(false);
      expect(builder.validateAmount(1000 as any)).toBe(false); // not string
    });

    it('should estimate transaction costs correctly', async () => {
      const cost = await builder.estimateTransactionCost(2, 3, true, 15);
      expect(cost).toBeGreaterThan(0);
      expect(typeof cost).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle UTXO selection failure', async () => {
      // Mock selector to return failure
      mockSelector.select.mockReturnValue({
        success: false,
        reason: 'INSUFFICIENT_FUNDS',
        message: 'Insufficient funds for transaction',
        details: { targetValue: 100000, dustThreshold: 330 },
      });

      const deployData = {
        ...DEPLOY_PRODUCTION_PATTERN.input,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      await expect(builder.buildDeploy(deployData)).rejects.toThrow('UTXO selection failed');
    });

    it('should handle empty UTXO response', async () => {
      mockUTXOProvider.getUTXOs.mockResolvedValue([]);

      const deployData = {
        ...DEPLOY_PRODUCTION_PATTERN.input,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      await expect(builder.buildDeploy(deployData)).rejects.toThrow('No UTXOs found');
    });

    it('should handle encoding failures', async () => {
      // Create a spy on SRC20Encoder to simulate encoding failure
      const encodeSpy = vi.spyOn(SRC20Encoder.prototype, 'encode');
      encodeSpy.mockReturnValue(null as any);

      const deployData = {
        ...DEPLOY_PRODUCTION_PATTERN.input,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      await expect(builder.buildDeploy(deployData)).rejects.toThrow('Failed to encode');

      encodeSpy.mockRestore();
    });
  });

  describe('Fee Calculation and Change Handling', () => {
    it('should include change output when change exceeds dust threshold', async () => {
      // Mock selector to return large change
      mockSelector.select.mockReturnValue({
        success: true,
        inputs: createMockMainnetUTXOs(1, 100000),
        totalValue: 100000,
        fee: 2250,
        change: 97000, // Large change amount
        wasteMetric: 0,
        inputCount: 1,
        outputCount: 4,
        estimatedVSize: 150,
        effectiveFeeRate: 15,
      });

      const deployData = {
        ...DEPLOY_PRODUCTION_PATTERN.input,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      const transaction = await builder.buildDeploy(deployData);

      // Should have extra output for change
      expect(transaction.outs.length).toBeGreaterThan(3); // Data outputs + change
    });

    it('should not include change output when change is below dust threshold', async () => {
      // Mock selector to return small change
      mockSelector.select.mockReturnValue({
        success: true,
        inputs: createMockMainnetUTXOs(1, 5000),
        totalValue: 5000,
        fee: 2250,
        change: 100, // Below dust threshold
        wasteMetric: 0,
        inputCount: 1,
        outputCount: 4, // 3 P2WSH + 1 OP_RETURN
        estimatedVSize: 150,
        effectiveFeeRate: 15,
      });

      const deployData = {
        ...DEPLOY_PRODUCTION_PATTERN.input,
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      };

      const transaction = await builder.buildDeploy(deployData);

      // Change should be added to fee instead of creating output (3 P2WSH + 1 OP_RETURN = 4 outputs, no change)
      expect(transaction.outs.length).toBe(4);
    });
  });

  describe('Production Data Compatibility', () => {
    it('should handle decimal amounts like production data', async () => {
      const transferData = {
        p: 'SRC-20' as const,
        op: 'TRANSFER' as const,
        tick: 'KEVIN',
        amt: '100000.000000000000000000', // Decimal format like production
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        toAddress: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
      };

      // Should not throw and should normalize amount
      const transaction = await builder.buildTransfer(transferData);
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
    });

    it('should handle case variations in protocol and operations', async () => {
      const transferData = {
        p: 'src-20' as any, // lowercase
        op: 'transfer' as any, // lowercase
        tick: 'kevin', // lowercase
        amt: '100000',
        fromAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        toAddress: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
      };

      // Should normalize to correct format
      const transaction = await builder.buildTransfer(transferData);
      expect(transaction).toBeInstanceOf(bitcoin.Transaction);
    });
  });
});
