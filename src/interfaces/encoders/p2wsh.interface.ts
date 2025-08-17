/**
 * P2WSH Encoder Type Definitions
 *
 * Types for Pay-to-Witness-Script-Hash encoding
 */

import { Buffer } from 'node:buffer';
import type {
  EncodingOptions,
  EncodingResult,
  TransactionOutput as _TransactionOutput,
} from './base.interface.ts';

/**
 * P2WSH-specific encoding options
 */
export interface P2WSHEncodingOptions extends EncodingOptions {
  /** Dust value for outputs in satoshis */
  dustValue?: number;
  /** Maximum number of outputs allowed */
  maxOutputs?: number;
}

/**
 * P2WSH data structure
 */
export interface P2WSHData {
  /** Raw binary data to embed */
  data: Buffer;
  /** Optional content type identifier */
  contentType?: string;
  /** Protocol identifier (e.g., 'SRC20', 'STAMP') */
  protocol?: string;
}

/**
 * P2WSH encoding result
 */
export type P2WSHEncodingResult = EncodingResult & {
  /** Witness script for redemption */
  witnessScript: Buffer;
  /** Script hash */
  scriptHash: Buffer;
  /** Redeem script (alias for witnessScript) */
  redeemScript: Buffer;
  /** Whether signature is required */
  requiresSignature?: boolean;
  /** Timelock value if applicable */
  timelock?: number;
  /** Whether this is a multisig script */
  isMultisig?: boolean;
  /** Number of required signatures for multisig */
  requiredSignatures?: number;
};

/**
 * P2WSH chunk result for data splitting
 */
export interface P2WSHChunkResult {
  /** Chunk index */
  index: number;
  /** Chunk data */
  data: Buffer;
  /** Witness script for this chunk */
  witnessScript: Buffer;
  /** Script hash */
  scriptHash: Buffer;
  /** P2WSH script */
  script: Buffer;
}
