/**
 * Transaction Type Definitions
 *
 * Core types for Bitcoin transaction handling
 */

import { Buffer } from 'node:buffer';
import type { Network as _Network } from 'bitcoinjs-lib';

/**
 * Transaction input structure
 */
export interface TransactionInput {
  /** Previous transaction hash */
  hash: Buffer;
  /** Previous output index */
  index: number;
  /** Input script */
  script: Buffer;
  /** Sequence number */
  sequence: number;
  /** Witness data */
  witness?: Buffer[];
}

/**
 * Transaction output structure
 */
export interface TransactionOutput {
  /** Output script */
  script: Buffer;
  /** Output value in satoshis */
  value: number;
}

/**
 * Complete transaction structure
 */
export interface Transaction {
  /** Transaction ID */
  txid?: string;
  /** Transaction hash (for witness transactions) */
  hash?: string;
  /** Version */
  version: number;
  /** Locktime */
  locktime: number;
  /** Transaction inputs */
  ins: TransactionInput[];
  /** Transaction outputs */
  outs: TransactionOutput[];
  /** Size in bytes */
  size?: number;
  /** Virtual size in vbytes */
  vsize?: number;
  /** Weight units */
  weight?: number;
  /** Fee in satoshis */
  fee?: number;
  /** Hex representation */
  hex?: string;
  /** Block height */
  blockHeight?: number;
  /** Block hash */
  blockHash?: string;
  /** Confirmations */
  confirmations?: number;
  /** Timestamp */
  time?: number;
  /** Block time */
  blockTime?: number;
}

/**
 * Address history entry
 */
export interface AddressHistory {
  /** Transaction ID */
  tx_hash: string;
  /** Block height */
  height: number;
  /** Transaction position in block */
  tx_pos?: number;
  /** Value change */
  value?: number;
  /** Fee paid */
  fee?: number;
}

/**
 * Address balance information
 */
export interface Balance {
  /** Confirmed balance in satoshis */
  confirmed: number;
  /** Unconfirmed balance in satoshis */
  unconfirmed: number;
  /** Total balance (confirmed + unconfirmed) */
  total?: number;
}

/**
 * Transaction validation result
 */
export interface TransactionValidation {
  /** Whether the transaction is valid */
  isValid: boolean;
  /** Validation errors */
  errors?: string[];
  /** Validation warnings */
  warnings?: string[];
  /** Fee analysis */
  feeAnalysis?: {
    feeRate: number;
    totalFee: number;
    isOverpaying: boolean;
    recommendedFee?: number;
  };
  /** Script validation results */
  scriptValidation?: {
    inputIndex: number;
    isValid: boolean;
    error?: string;
  }[];
}
