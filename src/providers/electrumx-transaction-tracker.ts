/**
 * ElectrumX Transaction Tracker
 * Advanced transaction broadcasting and status monitoring
 */

import type { ElectrumXConnectionPool } from './electrumx-connection-pool.ts';
import type { ElectrumXProvider } from './electrumx-provider.ts';
import { Buffer } from 'node:buffer';
import { setIntervalCompat, clearIntervalCompat, setTimeoutCompat, clearTimeoutCompat } from '../utils/timer-utils.ts';


export interface TransactionStatus {
  txid: string;
  status: 'pending' | 'broadcasted' | 'confirmed' | 'failed';
  confirmations: number;
  blockHeight?: number;
  timestamp: number;
  lastUpdated: number;
  error?: string;
  broadcastAttempts: number;
  maxBroadcastAttempts: number;
}

export interface BroadcastOptions {
  maxRetries?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
  trackStatus?: boolean;
  confirmationTarget?: number;
  timeoutMs?: number;
}

export interface BroadcastResult {
  txid: string;
  success: boolean;
  error?: string;
  attempts: number;
  duration: number;
}

/**
 * Advanced transaction broadcasting with status tracking and retry logic
 */
export class ElectrumXTransactionTracker {
  private trackedTransactions = new Map<string, TransactionStatus>();
  private trackingInterval: number | null = null;
  private isTracking = false;

  constructor(
    private provider: ElectrumXProvider | ElectrumXConnectionPool,
    private defaultOptions: Required<BroadcastOptions> = {
      maxRetries: 3,
      retryDelay: 2000,
      maxRetryDelay: 10000,
      trackStatus: true,
      confirmationTarget: 1,
      timeoutMs: 60000,
    },
  ) {}

  /**
   * Broadcast transaction with advanced retry logic and status tracking
   */
  async broadcastTransaction(
    hexTx: string,
    options?: Partial<BroadcastOptions>,
  ): Promise<BroadcastResult> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | null = null;

    // Validate transaction hex
    if (!this.validateTransactionHex(hexTx)) {
      return {
        txid: '',
        success: false,
        error: 'Invalid transaction hex format',
        attempts: 0,
        duration: Date.now() - startTime,
      };
    }

    // Calculate transaction ID for tracking
    const txid = this.calculateTxid(hexTx);

    // Start tracking if enabled
    if (opts.trackStatus) {
      this.startTracking(txid, opts.maxRetries);
    }

    let delay = opts.retryDelay;

    while (attempts <= opts.maxRetries) {
      attempts++;

      try {
        // Update tracking status
        if (opts.trackStatus) {
          this.updateTransactionStatus(txid, {
            status: 'pending',
            broadcastAttempts: attempts,
            lastUpdated: Date.now(),
          });
        }

        // Attempt broadcast with timeout
        const broadcastTxid = await this.executeWithTimeout(
          () => this.provider.broadcastTransaction(hexTx),
          opts.timeoutMs,
        );

        // Success - update tracking
        if (opts.trackStatus) {
          this.updateTransactionStatus(txid, {
            status: 'broadcasted',
            txid: broadcastTxid,
            lastUpdated: Date.now(),
          });
        }

        return {
          txid: broadcastTxid,
          success: true,
          attempts,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error as Error;

        // Check if this is a recoverable error
        const isRecoverable = this.isRecoverableError(error as Error);

        if (!isRecoverable || attempts > opts.maxRetries) {
          // Mark as failed
          if (opts.trackStatus) {
            this.updateTransactionStatus(txid, {
              status: 'failed',
              error: lastError.message,
              lastUpdated: Date.now(),
            });
          }
          break;
        }

        // Wait before retry
        if (attempts <= opts.maxRetries) {
          await this.sleep(delay);
          delay = Math.min(delay * 2, opts.maxRetryDelay);
        }
      }
    }

    return {
      txid,
      success: false,
      error: lastError?.message || 'Broadcast failed after all retries',
      attempts,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Get enhanced UTXO list with additional metadata
   */
  async getEnhancedUTXOs(address: string): Promise<
    Array<{
      txid: string;
      vout: number;
      value: number;
      scriptPubKey: string;
      confirmations: number;
      height?: number;
      timestamp?: number;
      spendable: boolean;
      dust: boolean;
      mature: boolean; // For coinbase outputs
    }>
  > {
    const utxos = await this.provider.getUTXOs(address);
    const currentHeight = await this.provider.getBlockHeight();

    return utxos.map((utxo) => {
      const confirmations = utxo.confirmations || 0;
      const isCoinbase = utxo.height !== undefined &&
        currentHeight - utxo.height < 100; // Coinbase maturity

      return {
        ...utxo,
        confirmations, // Ensure confirmations is always a number
        spendable: confirmations > 0 && (!isCoinbase || confirmations >= 100),
        dust: utxo.value < 546, // Standard dust threshold
        mature: !isCoinbase || confirmations >= 100,
      };
    });
  }

  /**
   * Start tracking a transaction
   */
  private startTracking(txid: string, maxAttempts: number): void {
    this.trackedTransactions.set(txid, {
      txid,
      status: 'pending',
      confirmations: 0,
      timestamp: Date.now(),
      lastUpdated: Date.now(),
      broadcastAttempts: 0,
      maxBroadcastAttempts: maxAttempts,
    });

    if (!this.isTracking) {
      this.startPeriodicTracking();
    }
  }

  /**
   * Update transaction status
   */
  private updateTransactionStatus(
    txid: string,
    updates: Partial<TransactionStatus>,
  ): void {
    const existing = this.trackedTransactions.get(txid);
    if (existing) {
      this.trackedTransactions.set(txid, { ...existing, ...updates });
    }
  }

  /**
   * Start periodic status checking for tracked transactions
   */
  private startPeriodicTracking(): void {
    if (this.trackingInterval) {
      return;
    }

    this.isTracking = true;
    this.trackingInterval = setIntervalCompat(async () => {
      await this.updateTrackedTransactions();
    }, 10000) as number; // Check every 10 seconds
  }

  /**
   * Update status of all tracked transactions
   */
  private async updateTrackedTransactions(): Promise<void> {
    const activeTransactions = Array.from(this.trackedTransactions.entries())
      .filter(
        ([_, status]) =>
          status.status === 'broadcasted' ||
          (status.status === 'confirmed' && status.confirmations < 6),
      );

    for (const [txid, status] of activeTransactions) {
      try {
        const transaction = await this.provider.getTransaction(txid);

        this.updateTransactionStatus(txid, {
          status: transaction.confirmations > 0 ? 'confirmed' : 'broadcasted',
          confirmations: transaction.confirmations,
          blockHeight: transaction.height,
          timestamp: transaction.timestamp || status.timestamp,
          lastUpdated: Date.now(),
        });
      } catch (error) {
        // Transaction might not be found yet, keep status as is
        console.warn(`Failed to update status for ${txid}:`, error);
      }
    }

    // Clean up old transactions (older than 24 hours)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [txid, status] of this.trackedTransactions) {
      if (status.lastUpdated < cutoff) {
        this.trackedTransactions.delete(txid);
      }
    }

    // Stop tracking if no active transactions
    if (this.trackedTransactions.size === 0) {
      this.stopPeriodicTracking();
    }
  }

  /**
   * Stop periodic tracking
   */
  private stopPeriodicTracking(): void {
    if (this.trackingInterval) {
      clearIntervalCompat(this.trackingInterval);
      this.trackingInterval = null;
    }
    this.isTracking = false;
  }

  /**
   * Get status of a tracked transaction
   */
  getTransactionStatus(txid: string): TransactionStatus | null {
    return this.trackedTransactions.get(txid) || null;
  }

  /**
   * Get all tracked transactions
   */
  getAllTrackedTransactions(): TransactionStatus[] {
    return Array.from(this.trackedTransactions.values());
  }

  /**
   * Check if error is recoverable for retry
   */
  private isRecoverableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Network-related errors that can be retried
    const recoverableErrors = [
      'timeout',
      'connection',
      'network',
      'econnreset',
      'enotfound',
      'etimedout',
      'socket hang up',
      'server error',
      'bad gateway',
      'service unavailable',
      'rate limit',
    ];

    // Transaction-specific errors that should NOT be retried
    const nonRecoverableErrors = [
      'insufficient funds',
      'bad-txns-inputs-spent',
      'txn-already-in-mempool',
      'txn-already-known',
      'bad-txns-inputs-missingorspent',
      'mandatory-script-verify-flag-failed',
      'non-mandatory-script-verify-flag',
    ];

    // Check for non-recoverable errors first
    if (nonRecoverableErrors.some((err) => message.includes(err))) {
      return false;
    }

    // Check for recoverable errors
    return recoverableErrors.some((err) => message.includes(err));
  }

  /**
   * Validate transaction hex format
   */
  private validateTransactionHex(hexTx: string): boolean {
    if (!hexTx || typeof hexTx !== 'string') {
      return false;
    }

    // Must be even length and contain only hex characters
    if (hexTx.length % 2 !== 0) {
      return false;
    }

    if (!/^[0-9a-fA-F]+$/.test(hexTx)) {
      return false;
    }

    // Must be at least 20 bytes (very basic check)
    if (hexTx.length < 40) {
      return false;
    }

    return true;
  }

  /**
   * Calculate transaction ID from hex (simplified)
   */
  private calculateTxid(hexTx: string): string {
    // This is a simplified implementation
    // In practice, you'd use a proper Bitcoin library to calculate the txid
    const crypto = require('crypto');
    const buffer = Buffer.from(hexTx, 'hex');
    const hash1 = crypto.createHash('sha256').update(buffer).digest();
    const hash2 = crypto.createHash('sha256').update(hash1).digest();
    return hash2.reverse().toString('hex');
  }

  /**
   * Execute with timeout
   */
  // deno-lint-ignore require-await
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), timeout)
      ),
    ]);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clear all tracked transactions
   */
  clearTracked(): void {
    this.trackedTransactions.clear();
    this.stopPeriodicTracking();
  }

  /**
   * Get transaction statistics
   */
  getStatistics(): {
    totalTracked: number;
    byStatus: Record<string, number>;
    averageBroadcastAttempts: number;
    averageConfirmationTime: number;
  } {
    const transactions = Array.from(this.trackedTransactions.values());
    const byStatus: Record<string, number> = {};

    for (const tx of transactions) {
      byStatus[tx.status] = (byStatus[tx.status] || 0) + 1;
    }

    const confirmedTransactions = transactions.filter((tx) => tx.status === 'confirmed');
    const averageConfirmationTime = confirmedTransactions.length > 0
      ? confirmedTransactions.reduce(
        (sum, tx) => sum + (tx.lastUpdated - tx.timestamp),
        0,
      ) /
        confirmedTransactions.length
      : 0;

    const averageBroadcastAttempts = transactions.length > 0
      ? transactions.reduce((sum, tx) => sum + tx.broadcastAttempts, 0) /
        transactions.length
      : 0;

    return {
      totalTracked: transactions.length,
      byStatus,
      averageBroadcastAttempts,
      averageConfirmationTime,
    };
  }

  /**
   * Shutdown tracker and clean up
   */
  shutdown(): void {
    this.stopPeriodicTracking();
    this.trackedTransactions.clear();
  }
}

/**
 * Create transaction tracker for ElectrumX provider
 */
export function createElectrumXTracker(
  provider: ElectrumXProvider | ElectrumXConnectionPool,
  options?: Partial<BroadcastOptions>,
): ElectrumXTransactionTracker {
  return new ElectrumXTransactionTracker(provider, {
    maxRetries: 3,
    retryDelay: 2000,
    maxRetryDelay: 10000,
    trackStatus: true,
    confirmationTarget: 1,
    timeoutMs: 60000,
    ...options,
  });
}
