/**
 * UTXO Provider Interface
 * Defines the contract for fetching UTXOs from various sources
 */

import type { Network } from 'bitcoinjs-lib';
import { Buffer } from 'node:buffer';

export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
  confirmations?: number;
  height?: number;
  timestamp?: number;
  address?: string;
  witnessUtxo?: {
    script: Buffer;
    value: number;
  };
  nonWitnessUtxo?: Buffer;
}

export interface Balance {
  confirmed: number;
  unconfirmed: number;
  total: number;
}

export interface Transaction {
  txid: string;
  hex: string;
  confirmations: number;
  height?: number;
  timestamp?: number;
  fee?: number;
  size?: number;
  vsize?: number;
}

export interface AddressHistory {
  txid: string;
  height: number;
  fee?: number;
}

export interface AddressHistoryOptions {
  fromHeight?: number;
  toHeight?: number;
  limit?: number;
}

export interface IUTXOProvider {
  /**
   * Get UTXOs for a given address
   */
  getUTXOs(address: string): Promise<UTXO[]>;

  /**
   * Get balance for a given address
   */
  getBalance(address: string): Promise<Balance>;

  /**
   * Get transaction by ID
   */
  getTransaction(txid: string): Promise<Transaction>;

  /**
   * Broadcast a signed transaction
   */
  broadcastTransaction(hexTx: string): Promise<string>;

  /**
   * Get current fee rate (sat/vB)
   */
  getFeeRate(priority?: 'low' | 'medium' | 'high'): Promise<number>;

  /**
   * Get current block height
   */
  getBlockHeight(): Promise<number>;

  /**
   * Get address transaction history
   */
  getAddressHistory(
    address: string,
    options?: AddressHistoryOptions,
  ): Promise<AddressHistory[]>;

  /**
   * Check if provider is connected
   */
  isConnected(): Promise<boolean>;

  /**
   * Get network this provider is connected to
   */
  getNetwork(): Network;
}

export interface ProviderOptions {
  network: Network;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
}

export interface ElectrumXOptions extends ProviderOptions {
  host?: string;
  port?: number;
  protocol?: 'tcp' | 'ssl' | 'ws' | 'wss';
  endpoints?: Array<{
    host: string;
    port: number;
    protocol: 'tcp' | 'ssl' | 'ws' | 'wss';
    priority?: number;
    maxRetries?: number;
    timeout?: number;
  }>;
  fallbackToPublic?: boolean;
  connectionTimeout?: number;
  requestTimeout?: number;
}

export interface BlockstreamOptions extends ProviderOptions {
  baseUrl?: string;
  apiKey?: string;
}

export interface MempoolOptions extends ProviderOptions {
  baseUrl?: string;
}

// Alias for compatibility with existing test code
export type ProviderInterface = IUTXOProvider;
