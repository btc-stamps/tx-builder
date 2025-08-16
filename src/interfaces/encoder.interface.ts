/**
 * Data Encoder Interface
 * Defines the contract for encoding various data types into Bitcoin transactions
 */

import { Buffer } from 'node:buffer';

import type { Network } from 'bitcoinjs-lib';
import type { SRC20Data } from './src20.interface.ts';

export interface EncodingResult {
  script: Buffer;
  outputs: TransactionOutput[];
  estimatedSize: number;
  dataSize: number;
}

export interface TransactionOutput {
  script: Buffer;
  value: number;
}

export interface IDataEncoder {
  /**
   * Encode data into transaction outputs
   */
  encode(
    data: P2WSHData | SRC20Data | StampData,
    options?: EncodingOptions,
  ): EncodingResult;

  /**
   * Decode data from transaction outputs
   */
  decode(outputs: TransactionOutput[]): P2WSHData | SRC20Data | StampData;

  /**
   * Validate if data can be encoded
   */
  validate(data: P2WSHData | SRC20Data | StampData): boolean;

  /**
   * Get maximum data size supported
   */
  getMaxDataSize(): number;

  /**
   * Get encoder type/protocol name
   */
  getType(): string;
}

export interface EncodingOptions {
  network?: Network;
  compress?: boolean;
  chunkSize?: number;
}

// Stamp-specific encoding
export interface StampEncodingOptions extends EncodingOptions {
  isMultisig?: boolean;
  keyPairs?: Array<{ privateKey?: Buffer; publicKey?: Buffer }>; // ECPair like instances
  m?: number; // m-of-n multisig
  n?: number;
}

export interface StampData {
  base64: string;
  filename?: string;
}

// Counterparty-specific encoding
export interface CounterpartyEncodingOptions extends EncodingOptions {
  prefix?: string;
  version?: number;
}

export interface CounterpartyData {
  message: string;
  value?: number;
}

// P2WSH-specific encoding
export interface P2WSHEncodingOptions extends EncodingOptions {
  dustValue?: number;
  maxOutputs?: number;
}

export interface P2WSHData {
  /** Raw binary data to embed */
  data: Buffer;
  /** Optional content type identifier */
  contentType?: string;
  /** Protocol identifier (e.g., 'SRC20', 'STAMP') */
  protocol?: string;
}
