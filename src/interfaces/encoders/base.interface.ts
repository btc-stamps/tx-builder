/**
 * Base Encoder Type Definitions
 *
 * Core types for all encoder implementations
 */

import { Buffer } from 'node:buffer';
import type { Network } from 'bitcoinjs-lib';

/**
 * Base encoding result structure
 */
export interface EncodingResult {
  /** Primary script output */
  script: Buffer;
  /** All transaction outputs */
  outputs: TransactionOutput[];
  /** Estimated transaction size in bytes */
  estimatedSize: number;
  /** Size of encoded data in bytes */
  dataSize: number;
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
 * Base data encoder interface
 */
export interface IDataEncoder<TData = any, TOptions = EncodingOptions> {
  /**
   * Encode data into transaction outputs
   */
  encode(data: TData, options?: TOptions): EncodingResult;

  /**
   * Decode data from transaction outputs
   */
  decode(outputs: TransactionOutput[]): TData;

  /**
   * Validate if data can be encoded
   */
  validate(data: TData): boolean;

  /**
   * Get maximum data size supported
   */
  getMaxDataSize(): number;

  /**
   * Get encoder type/protocol name
   */
  getType(): string;
}

/**
 * Base encoding options
 */
export interface EncodingOptions {
  /** Bitcoin network to use */
  network?: Network;
  /** Enable compression */
  compress?: boolean;
  /** Chunk size for data splitting */
  chunkSize?: number;
}

/**
 * Counterparty-specific encoding options
 */
export interface CounterpartyEncodingOptions extends EncodingOptions {
  /** Protocol prefix */
  prefix?: string;
  /** Protocol version */
  version?: number;
}

/**
 * Counterparty data structure
 */
export interface CounterpartyData {
  /** Message to encode */
  message: string;
  /** Optional value */
  value?: number;
}

/**
 * Generic stamp data (simplified)
 */
export interface StampData {
  /** Base64 encoded data */
  base64: string;
  /** Optional filename */
  filename?: string;
}

/**
 * Stamp-specific encoding options
 */
export interface StampEncodingOptions extends EncodingOptions {
  /** Use multisig encoding */
  isMultisig?: boolean;
  /** Key pairs for multisig */
  keyPairs?: Array<{ privateKey?: Buffer; publicKey?: Buffer }>;
  /** M of N multisig */
  m?: number;
  /** N of N multisig */
  n?: number;
}
