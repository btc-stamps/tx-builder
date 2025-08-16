/**
 * UTXO Type Definitions
 *
 * Core types for Unspent Transaction Output handling
 */

import { Buffer } from 'node:buffer';

/**
 * Basic UTXO structure
 */
export interface UTXO {
  /** Transaction ID */
  txid: string;
  /** Output index */
  vout: number;
  /** Value in satoshis */
  value: number;
  /** ScriptPubKey */
  scriptPubKey: string;
  /** Address (optional) */
  address?: string;
  /** Number of confirmations */
  confirmations?: number;
  /** Block height */
  height?: number;
  /** Whether this UTXO is from a coinbase transaction */
  coinbase?: boolean;
  /** Whether this UTXO is spendable */
  spendable?: boolean;
  /** Whether this UTXO is safe to spend */
  safe?: boolean;
}

/**
 * UTXO with witness data
 */
export interface WitnessUTXO extends UTXO {
  /** Witness script */
  witnessScript?: Buffer;
  /** Witness version */
  witnessVersion?: number;
  /** Witness program */
  witnessProgram?: Buffer;
}

/**
 * UTXO cache entry
 */
export interface UTXOCacheEntry {
  /** The UTXO data */
  utxo: UTXO;
  /** Timestamp when cached */
  timestamp: number;
  /** Time-to-live in seconds */
  ttl: number;
  /** Whether this entry has been validated */
  validated: boolean;
  /** Last access time */
  lastAccessed?: number;
  /** Access count */
  accessCount?: number;
}

/**
 * Indexed UTXO data for efficient lookups
 */
export interface IndexedUTXOData {
  /** UTXOs indexed by address */
  byAddress: Map<string, UTXO[]>;
  /** UTXOs indexed by txid:vout */
  byOutpoint: Map<string, UTXO>;
  /** UTXOs indexed by value range */
  byValue: Map<string, UTXO[]>;
  /** Total value of all UTXOs */
  totalValue: number;
  /** Total count of UTXOs */
  totalCount: number;
  /** Last update timestamp */
  lastUpdated: number;
}

/**
 * UTXO selection criteria
 */
export interface UTXOSelectionCriteria {
  /** Minimum value required */
  minValue?: number;
  /** Maximum value allowed */
  maxValue?: number;
  /** Minimum confirmations */
  minConfirmations?: number;
  /** Include unconfirmed UTXOs */
  includeUnconfirmed?: boolean;
  /** Exclude coinbase UTXOs */
  excludeCoinbase?: boolean;
  /** Exclude specific UTXOs */
  excludeOutpoints?: string[];
  /** Include only specific addresses */
  includeAddresses?: string[];
  /** Exclude specific addresses */
  excludeAddresses?: string[];
}

/**
 * UTXO chunk for streaming processing
 */
export interface UTXOChunk {
  /** Chunk index */
  index: number;
  /** UTXOs in this chunk */
  utxos: UTXO[];
  /** Whether this is the last chunk */
  isLast: boolean;
  /** Total chunks expected */
  totalChunks?: number;
  /** Timestamp */
  timestamp: number;
}
