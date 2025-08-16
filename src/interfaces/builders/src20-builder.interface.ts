/**
 * SRC-20 Token Builder Type Definitions
 *
 * Types for SRC-20 token transaction building
 */

import type { Psbt } from 'bitcoinjs-lib';

/**
 * Token transfer transaction options
 */
export interface TokenTransferOptions {
  /** Token ticker symbol */
  tick: string;
  /** Amount to transfer */
  amount: string;
  /** Sender address */
  fromAddress: string;
  /** Recipient address */
  toAddress: string;
  /** Fee rate in satoshis per byte */
  feeRate?: number;
  /** Dust value for outputs */
  dustValue?: number;
  /** Enable RBF */
  enableRbf?: boolean;
}

/**
 * Token mint transaction options
 */
export interface TokenMintOptions {
  /** Token ticker symbol */
  tick: string;
  /** Amount to mint */
  amount: string;
  /** Destination address for minted tokens */
  mintingAddress: string;
  /** Fee rate in satoshis per byte */
  feeRate?: number;
  /** Dust value for outputs */
  dustValue?: number;
  /** Enable RBF */
  enableRbf?: boolean;
}

/**
 * Token deployment options
 */
export interface TokenDeployOptions {
  /** Token ticker symbol */
  tick: string;
  /** Maximum supply */
  max: string;
  /** Mint limit per transaction */
  lim: string;
  /** Number of decimals */
  dec?: number;
  /** Deploying address */
  deployingAddress: string;
  /** Fee rate in satoshis per byte */
  feeRate?: number;
  /** Dust value for outputs */
  dustValue?: number;
  /** Enable RBF */
  enableRbf?: boolean;
  // Optional metadata
  /** Twitter/X handle */
  x?: string;
  /** Token website */
  web?: string;
  /** Email contact */
  email?: string;
  /** Telegram link */
  tg?: string;
  /** Token description */
  description?: string;
  /** Token image URL */
  img?: string;
  /** Token icon URL */
  icon?: string;
}

/**
 * Batch transfer options for multiple recipients
 */
export interface BatchTransferOptions {
  /** Token ticker symbol */
  tick: string;
  /** Array of transfers */
  transfers: Array<{
    amount: string;
    toAddress: string;
  }>;
  /** Sender address */
  fromAddress: string;
  /** Fee rate in satoshis per byte */
  feeRate?: number;
  /** Dust value for outputs */
  dustValue?: number;
  /** Enable RBF */
  enableRbf?: boolean;
}

/**
 * SRC-20 build result
 */
export interface SRC20BuildResult {
  /** Built PSBT ready for signing */
  psbt: Psbt;
  /** Total input value in satoshis */
  totalInputValue: number;
  /** Total output value in satoshis */
  totalOutputValue: number;
  /** Transaction fee in satoshis */
  fee: number;
  /** Change amount in satoshis */
  changeAmount: number;
  /** Data outputs */
  dataOutputs: any[]; // TransactionOutput[]
  /** Estimated transaction size in bytes */
  estimatedTxSize: number;
  /** Dust value used */
  dustValue: number;
}
