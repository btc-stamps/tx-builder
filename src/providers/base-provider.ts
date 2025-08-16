/**
 * Base UTXO Provider
 * Common functionality for all provider implementations
 * Includes fee normalization for consistency with BTCStampsExplorer
 */

import * as bitcoin from 'bitcoinjs-lib';
import type { Network } from 'bitcoinjs-lib';

import type {
  AddressHistory,
  AddressHistoryOptions,
  Balance,
  IUTXOProvider,
  ProviderOptions,
  Transaction,
  UTXO,
} from '../interfaces/provider.interface.ts';
import {
  createNormalizedFeeRate,
  FeeNormalizer,
  type FeeSource,
  type NormalizedFeeRate,
  validateAndNormalizeFee,
} from '../utils/fee-normalizer.ts';

export abstract class BaseProvider implements IUTXOProvider {
  protected network: Network;
  protected timeout: number;
  protected retries: number;
  protected retryDelay: number;
  protected maxRetryDelay: number;

  constructor(options: ProviderOptions) {
    this.network = options.network;
    this.timeout = options.timeout ?? 30000;
    this.retries = options.retries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.maxRetryDelay = options.maxRetryDelay ?? 10000;
  }

  abstract getUTXOs(address: string): Promise<UTXO[]>;
  abstract getBalance(address: string): Promise<Balance>;
  abstract getTransaction(txid: string): Promise<Transaction>;
  abstract broadcastTransaction(hexTx: string): Promise<string>;
  abstract getFeeRate(priority?: 'low' | 'medium' | 'high'): Promise<number>;
  abstract getBlockHeight(): Promise<number>;
  abstract isConnected(): Promise<boolean>;
  abstract getAddressHistory(
    address: string,
    options?: AddressHistoryOptions,
  ): Promise<AddressHistory[]>;

  getNetwork(): Network {
    return this.network;
  }

  /**
   * Execute request with retry logic
   */
  protected async executeWithRetry<T>(
    fn: () => Promise<T>,
    retries = this.retries,
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = this.retryDelay;

    for (let i = 0; i <= retries; i++) {
      try {
        return await this.executeWithTimeout(fn);
      } catch (error) {
        lastError = error as Error;

        if (i < retries) {
          await this.sleep(delay);
          delay = Math.min(delay * 2, this.maxRetryDelay); // Exponential backoff
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Execute request with timeout
   */
  protected executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout = this.timeout,
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      ),
    ]);
  }

  /**
   * Sleep for specified milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validate Bitcoin address format
   */
  protected isValidAddress(address: string): boolean {
    try {
      // Use bitcoinjs-lib for proper address validation
      bitcoin.address.toOutputScript(address, this.network);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate transaction ID format
   */
  protected isValidTxid(txid: string): boolean {
    return /^[a-fA-F0-9]{64}$/.test(txid);
  }

  /**
   * Convert satoshis to BTC
   */
  protected satoshisToBTC(satoshis: number): number {
    return satoshis / 100000000;
  }

  /**
   * Convert BTC to satoshis
   */
  protected btcToSatoshis(btc: number): number {
    return Math.round(btc * 100000000);
  }

  /**
   * Normalize fee rate from provider response to consistent satsPerVB
   */
  protected normalizeFeeRate(
    rate: any,
    source: FeeSource,
  ): NormalizedFeeRate | null {
    return validateAndNormalizeFee(rate, source);
  }

  /**
   * Get normalized fee rate ensuring it's within acceptable bounds
   */
  protected async getNormalizedFeeRate(
    priority: 'low' | 'medium' | 'high' = 'medium',
  ): Promise<NormalizedFeeRate> {
    try {
      const rawFeeRate = await this.getFeeRate(priority);
      const normalized = this.normalizeFeeRate(
        rawFeeRate,
        this.getProviderSource(),
      );

      if (normalized && FeeNormalizer.validateFeeRate(normalized.satsPerVB)) {
        return normalized;
      }
    } catch (error) {
      console.warn('Failed to get normalized fee rate from provider:', error);
    }

    // Fallback to standard rate
    return FeeNormalizer.getStandardFeeLevel(priority as any);
  }

  /**
   * Convert legacy fee rate response to normalized format
   */
  protected normalizeLegacyFeeResponse(
    feeResponse: any,
    source: FeeSource,
  ): NormalizedFeeRate | null {
    try {
      // Handle different response formats from various providers
      if (typeof feeResponse === 'number') {
        return createNormalizedFeeRate(feeResponse, 'sat/vB', source);
      }

      if (feeResponse && typeof feeResponse.feeRate === 'number') {
        return createNormalizedFeeRate(feeResponse.feeRate, 'sat/vB', source);
      }

      if (feeResponse && typeof feeResponse.fee_per_kb === 'number') {
        // Convert from sat/kB to sat/vB
        return createNormalizedFeeRate(
          feeResponse.fee_per_kb,
          'btc/kb',
          source,
        );
      }

      return null;
    } catch (error) {
      console.warn('Failed to normalize legacy fee response:', error);
      return null;
    }
  }

  /**
   * Get the fee source identifier for this provider
   * Override in child classes to specify the correct source
   */
  protected getProviderSource(): FeeSource {
    return 'explorer'; // Default, should be overridden
  }

  /**
   * Validate that fee rate is reasonable for the current network conditions
   */
  protected validateFeeRate(satsPerVB: number): boolean {
    return FeeNormalizer.validateFeeRate(satsPerVB);
  }

  /**
   * Get all priority levels with normalized rates
   */
  async getNormalizedFeeRates(): Promise<{
    low: NormalizedFeeRate;
    medium: NormalizedFeeRate;
    high: NormalizedFeeRate;
    urgent?: NormalizedFeeRate;
  }> {
    try {
      const [low, medium, high] = await Promise.all([
        this.getNormalizedFeeRate('low'),
        this.getNormalizedFeeRate('medium'),
        this.getNormalizedFeeRate('high'),
      ]);

      return { low, medium, high };
    } catch (error) {
      console.warn(
        'Failed to get normalized fee rates, using standards:',
        error,
      );
      return FeeNormalizer.getAllStandardFeeLevels();
    }
  }
}
