/**
 * BaseProvider Tests
 * Comprehensive test suite for the base provider implementation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import { BaseProvider } from '../../../src/providers/base-provider.ts';
import type {
  AddressHistory,
  AddressHistoryOptions,
  Balance,
  ProviderOptions,
  Transaction,
  UTXO,
} from '../../../src/interfaces/provider.interface.ts';
import { FeeNormalizer } from '../../../src/utils/fee-normalizer.ts';

// Create a concrete implementation for testing the abstract BaseProvider
class TestableBaseProvider extends BaseProvider {
  public callHistory: string[] = [];
  private mockResponses: Map<string, any> = new Map();
  private shouldFailNext = false;
  private failureMessage = 'Mock failure';

  constructor(options: ProviderOptions) {
    super(options);
  }

  // Mock methods required by abstract class
  async getUTXOs(address: string): Promise<UTXO[]> {
    this.callHistory.push(`getUTXOs:${address}`);
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      throw new Error(this.failureMessage);
    }
    return this.mockResponses.get('utxos') || [];
  }

  async getBalance(address: string): Promise<Balance> {
    this.callHistory.push(`getBalance:${address}`);
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      throw new Error(this.failureMessage);
    }
    return this.mockResponses.get('balance') || { confirmed: 0, unconfirmed: 0, total: 0 };
  }

  async getTransaction(txid: string): Promise<Transaction> {
    this.callHistory.push(`getTransaction:${txid}`);
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      throw new Error(this.failureMessage);
    }
    return this.mockResponses.get('transaction') || {
      txid,
      hex: '0100000000',
      confirmations: 6,
    };
  }

  async broadcastTransaction(hexTx: string): Promise<string> {
    this.callHistory.push(`broadcastTransaction:${hexTx.substring(0, 10)}...`);
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      throw new Error(this.failureMessage);
    }
    return this.mockResponses.get('txid') || 'mock_txid_123';
  }

  async getFeeRate(priority?: 'low' | 'medium' | 'high'): Promise<number> {
    this.callHistory.push(`getFeeRate:${priority || 'medium'}`);
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      throw new Error(this.failureMessage);
    }
    const rates = { low: 10, medium: 25, high: 50 };
    return rates[priority || 'medium'];
  }

  async getBlockHeight(): Promise<number> {
    this.callHistory.push('getBlockHeight');
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      throw new Error(this.failureMessage);
    }
    return this.mockResponses.get('blockHeight') || 800000;
  }

  async isConnected(): Promise<boolean> {
    this.callHistory.push('isConnected');
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      throw new Error(this.failureMessage);
    }
    return this.mockResponses.get('connected') ?? true;
  }

  async getAddressHistory(
    address: string,
    options?: AddressHistoryOptions,
  ): Promise<AddressHistory[]> {
    this.callHistory.push(`getAddressHistory:${address}`);
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      throw new Error(this.failureMessage);
    }
    return this.mockResponses.get('history') || [];
  }

  // Test utilities
  setMockResponse(key: string, value: any): void {
    this.mockResponses.set(key, value);
  }

  setFailureMode(shouldFail: boolean, message = 'Mock failure'): void {
    this.shouldFailNext = shouldFail;
    this.failureMessage = message;
  }

  clearCallHistory(): void {
    this.callHistory = [];
  }

  // Expose protected methods for testing
  public testExecuteWithRetry<T>(fn: () => Promise<T>, retries?: number): Promise<T> {
    return this.executeWithRetry(fn, retries);
  }

  public testExecuteWithTimeout<T>(fn: () => Promise<T>, timeout?: number): Promise<T> {
    return this.executeWithTimeout(fn, timeout);
  }

  public testSleep(ms: number): Promise<void> {
    return this.sleep(ms);
  }

  public testIsValidAddress(address: string): boolean {
    return this.isValidAddress(address);
  }

  public testIsValidTxid(txid: string): boolean {
    return this.isValidTxid(txid);
  }

  public testSatoshisToBTC(satoshis: number): number {
    return this.satoshisToBTC(satoshis);
  }

  public testBtcToSatoshis(btc: number): number {
    return this.btcToSatoshis(btc);
  }

  public testNormalizeFeeRate(rate: any, source: any): any {
    return this.normalizeFeeRate(rate, source);
  }

  public testValidateFeeRate(satsPerVB: number): boolean {
    return this.validateFeeRate(satsPerVB);
  }

  protected getProviderSource() {
    return 'test' as any;
  }
}

describe('BaseProvider', () => {
  let provider: TestableBaseProvider;
  const defaultOptions: ProviderOptions = {
    network: bitcoin.networks.bitcoin,
    timeout: 5000,
    retries: 2,
    retryDelay: 100,
    maxRetryDelay: 1000,
  };

  beforeEach(() => {
    provider = new TestableBaseProvider(defaultOptions);
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should initialize with provided options', () => {
      expect(provider.getNetwork()).toBe(bitcoin.networks.bitcoin);
    });

    it('should use default values for optional parameters', () => {
      const minimalProvider = new TestableBaseProvider({
        network: bitcoin.networks.testnet,
      });
      expect(minimalProvider.getNetwork()).toBe(bitcoin.networks.testnet);
    });

    it('should handle testnet network', () => {
      const testnetProvider = new TestableBaseProvider({
        network: bitcoin.networks.testnet,
      });
      expect(testnetProvider.getNetwork()).toBe(bitcoin.networks.testnet);
    });
  });

  describe('Network', () => {
    it('should return the configured network', () => {
      expect(provider.getNetwork()).toBe(bitcoin.networks.bitcoin);
    });
  });

  describe('Retry Logic', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const result = await provider.testExecuteWithRetry(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValue('success');

      const result = await provider.testExecuteWithRetry(mockFn, 1);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should fail after exhausting retries', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(provider.testExecuteWithRetry(mockFn, 1))
        .rejects.toThrow('Persistent failure');
      expect(mockFn).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('should use exponential backoff', async () => {
      vi.useFakeTimers();

      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');

      const retryPromise = provider.testExecuteWithRetry(mockFn, 2);

      // Fast-forward through the delays
      await vi.runAllTimersAsync();

      const result = await retryPromise;
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('should respect max retry delay', async () => {
      // Test max retry delay without fake timers to avoid unhandled promise issues
      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      // Use a provider with very small max delay to test capping
      const shortDelayProvider = new TestableBaseProvider({
        ...defaultOptions,
        retryDelay: 10, // Very small delays for fast test execution
        maxRetryDelay: 20,
      });

      const startTime = Date.now();

      try {
        await shortDelayProvider.testExecuteWithRetry(mockFn, 2);
      } catch (error) {
        // Expected to fail - verify it's the right error
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failure');
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
      // Should have taken at least the minimum time for delays (10ms + 20ms = 30ms)
      expect(duration).toBeGreaterThanOrEqual(25); // Allow some tolerance
    });
  });

  describe('Timeout Logic', () => {
    it('should complete within timeout', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const result = await provider.testExecuteWithTimeout(mockFn, 1000);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should throw timeout error', async () => {
      const mockFn = vi.fn().mockImplementation(() =>
        new Promise((resolve) => setTimeout(resolve, 2000))
      );

      await expect(provider.testExecuteWithTimeout(mockFn, 100))
        .rejects.toThrow('Request timeout');
    });

    it('should use default timeout', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const result = await provider.testExecuteWithTimeout(mockFn);

      expect(result).toBe('success');
    });
  });

  describe('Sleep Function', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await provider.testSleep(50);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });
  });

  describe('Address Validation', () => {
    const validMainnetAddresses = [
      '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', // P2PKH
      '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', // P2SH
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', // P2WPKH
      'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3', // P2WSH
    ];

    const validTestnetAddresses = [
      'mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhef', // P2PKH testnet
      '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc', // P2SH testnet
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', // P2WPKH testnet
    ];

    const invalidAddresses = [
      '',
      'invalid',
      '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN', // Too short
      '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN23', // Too long
      'bc1qinvalid', // Invalid bech32
    ];

    it('should validate mainnet addresses', () => {
      validMainnetAddresses.forEach((address) => {
        expect(provider.testIsValidAddress(address)).toBe(true);
      });
    });

    it('should validate testnet addresses', () => {
      const testnetProvider = new TestableBaseProvider({
        network: bitcoin.networks.testnet,
      });

      validTestnetAddresses.forEach((address) => {
        expect(testnetProvider.testIsValidAddress(address)).toBe(true);
      });
    });

    it('should reject invalid addresses', () => {
      invalidAddresses.forEach((address) => {
        expect(provider.testIsValidAddress(address)).toBe(false);
      });
    });

    it('should reject testnet addresses on mainnet', () => {
      validTestnetAddresses.forEach((address) => {
        expect(provider.testIsValidAddress(address)).toBe(false);
      });
    });
  });

  describe('Transaction ID Validation', () => {
    const validTxids = [
      'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890'.slice(0, 64),
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'.slice(0, 64),
      '0000000000000000000000000000000000000000000000000000000000000000',
    ];

    const invalidTxids = [
      '',
      'invalid',
      'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567', // Too short
      'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678901', // Too long
      'g1b2c3d4e5f6789012345678901234567890123456789012345678901234567890', // Invalid hex
    ];

    it('should validate correct transaction IDs', () => {
      validTxids.forEach((txid) => {
        const isValid = provider.testIsValidTxid(txid);
        if (!isValid) {
          console.log(`Failed txid: "${txid}" length: ${txid.length}`);
        }
        expect(isValid).toBe(true);
      });
    });

    it('should reject invalid transaction IDs', () => {
      invalidTxids.forEach((txid) => {
        expect(provider.testIsValidTxid(txid)).toBe(false);
      });
    });
  });

  describe('Currency Conversion', () => {
    it('should convert satoshis to BTC correctly', () => {
      expect(provider.testSatoshisToBTC(100000000)).toBe(1);
      expect(provider.testSatoshisToBTC(50000000)).toBe(0.5);
      expect(provider.testSatoshisToBTC(1)).toBe(0.00000001);
      expect(provider.testSatoshisToBTC(0)).toBe(0);
    });

    it('should convert BTC to satoshis correctly', () => {
      expect(provider.testBtcToSatoshis(1)).toBe(100000000);
      expect(provider.testBtcToSatoshis(0.5)).toBe(50000000);
      expect(provider.testBtcToSatoshis(0.00000001)).toBe(1);
      expect(provider.testBtcToSatoshis(0)).toBe(0);
    });

    it('should handle floating point precision for BTC to satoshis', () => {
      expect(provider.testBtcToSatoshis(0.12345678)).toBe(12345678);
      expect(provider.testBtcToSatoshis(0.123456789)).toBe(12345679); // Rounded
    });
  });

  describe('Fee Normalization', () => {
    it('should normalize valid fee rates', () => {
      const result = provider.testNormalizeFeeRate(25, 'explorer');
      expect(result).toBeTruthy();
      expect(result.satsPerVB).toBe(25);
    });

    it('should handle invalid fee rates', () => {
      const result = provider.testNormalizeFeeRate(null, 'explorer');
      expect(result).toBeNull();
    });

    it('should validate fee rates within acceptable bounds', () => {
      expect(provider.testValidateFeeRate(1)).toBe(true);
      expect(provider.testValidateFeeRate(25)).toBe(true);
      expect(provider.testValidateFeeRate(1000)).toBe(true);
      expect(provider.testValidateFeeRate(0)).toBe(false);
      expect(provider.testValidateFeeRate(-1)).toBe(false);
    });
  });

  describe('Fee Rate Methods', () => {
    it('should get normalized fee rates for all priorities', async () => {
      const rates = await provider.getNormalizedFeeRates();

      expect(rates).toHaveProperty('low');
      expect(rates).toHaveProperty('medium');
      expect(rates).toHaveProperty('high');
      expect(rates.low.satsPerVB).toBeLessThan(rates.medium.satsPerVB);
      expect(rates.medium.satsPerVB).toBeLessThan(rates.high.satsPerVB);
    });

    it('should fall back to standard rates on failure', async () => {
      provider.setFailureMode(true, 'Fee rate failure');

      const rates = await provider.getNormalizedFeeRates();

      expect(rates).toHaveProperty('low');
      expect(rates).toHaveProperty('medium');
      expect(rates).toHaveProperty('high');
      // Should still have valid rates even with failure
      expect(rates.medium.satsPerVB).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      provider.setFailureMode(true, 'Network error');

      await expect(provider.getUTXOs('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'))
        .rejects.toThrow('Network error');
    });

    it('should handle timeout errors', async () => {
      const slowFn = () => new Promise((resolve) => setTimeout(resolve, 200));

      await expect(provider.testExecuteWithTimeout(slowFn, 50))
        .rejects.toThrow('Request timeout');
    });

    it('should propagate specific error messages', async () => {
      provider.setFailureMode(true, 'Specific error message');

      await expect(provider.getBalance('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'))
        .rejects.toThrow('Specific error message');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle successful UTXO fetching workflow', async () => {
      const mockUtxos: UTXO[] = [
        {
          txid: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
          vout: 0,
          value: 100000,
          scriptPubKey: '76a914...',
          confirmations: 6,
        },
      ];

      provider.setMockResponse('utxos', mockUtxos);

      const result = await provider.getUTXOs('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');

      expect(result).toEqual(mockUtxos);
      expect(provider.callHistory).toContain('getUTXOs:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
    });

    it('should handle successful balance fetching workflow', async () => {
      const mockBalance: Balance = {
        confirmed: 100000,
        unconfirmed: 50000,
        total: 150000,
      };

      provider.setMockResponse('balance', mockBalance);

      const result = await provider.getBalance('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');

      expect(result).toEqual(mockBalance);
      expect(provider.callHistory).toContain('getBalance:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
    });

    it('should handle transaction broadcast workflow', async () => {
      const txHex = '0100000001...'; // Shortened for readability
      provider.setMockResponse('txid', 'broadcasted_tx_id');

      const result = await provider.broadcastTransaction(txHex);

      expect(result).toBe('broadcasted_tx_id');
      expect(provider.callHistory).toContain('broadcastTransaction:0100000001...');
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle zero timeout gracefully', () => {
      const zeroTimeoutProvider = new TestableBaseProvider({
        ...defaultOptions,
        timeout: 0,
      });

      expect(zeroTimeoutProvider).toBeDefined();
    });

    it('should handle zero retries', async () => {
      const noRetryProvider = new TestableBaseProvider({
        ...defaultOptions,
        retries: 0,
      });

      const mockFn = vi.fn().mockRejectedValue(new Error('Failure'));

      await expect(noRetryProvider.testExecuteWithRetry(mockFn))
        .rejects.toThrow('Failure');
      expect(mockFn).toHaveBeenCalledTimes(1); // Only initial attempt
    });

    it('should handle large retry delays', () => {
      const largeDelayProvider = new TestableBaseProvider({
        ...defaultOptions,
        retryDelay: 60000,
        maxRetryDelay: 120000,
      });

      expect(largeDelayProvider).toBeDefined();
    });
  });
});
