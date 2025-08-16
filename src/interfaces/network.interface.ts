/**
 * Network Configuration Interface
 * Defines network-specific parameters and configurations
 */

import type { Network } from 'bitcoinjs-lib';

/**
 * Network Type definition
 */
export type NetworkType = 'mainnet' | 'testnet' | 'regtest';

/**
 * Chain-specific parameters for networks
 */
export interface ChainParams {
  /** Coin type for HD wallet derivation */
  coinType: number;
  /** Network magic bytes */
  networkMagic: number;
  /** Base58 address prefix */
  pubKeyHash: number;
  /** Minimum recommended transaction fee */
  minTxFee: number;
}

export interface NetworkConfig {
  network: Network;
  defaultProviders: ProviderEndpoint[];
  explorerUrl: string;
  dustThreshold: number;
  minRelayFee: number;
  defaultFeeRate: number;
}

export interface ProviderEndpoint {
  type: 'electrum' | 'blockstream' | 'mempool';
  url: string;
  priority: number;
  testnet?: boolean;
}

export interface INetworkManager {
  /**
   * Get network configuration
   */
  getConfig(network: 'mainnet' | 'testnet' | 'regtest'): NetworkConfig;

  /**
   * Get available providers for network
   */
  getProviders(network: Network): ProviderEndpoint[];

  /**
   * Validate address for network
   */
  validateAddress(address: string, network: Network): boolean;

  /**
   * Get explorer URL for transaction
   */
  getExplorerUrl(txid: string, network: Network): string;
}
