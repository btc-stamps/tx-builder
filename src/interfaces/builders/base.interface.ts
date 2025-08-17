/**
 * Base Builder Type Definitions
 *
 * Core types for transaction builder pattern implementations
 */

import { Buffer } from 'node:buffer';
import type { Network, Psbt } from 'bitcoinjs-lib';
import type { UTXO } from '../core/utxo.interface.ts';

/**
 * Base transaction builder interface
 */
export interface ITransactionBuilder {
  /**
   * Add input to transaction
   */
  addInput(utxo: UTXO, options?: InputOptions): this;

  /**
   * Add output to transaction
   */
  addOutput(address: string, value: number): this;

  /**
   * Add data output (OP_RETURN or similar)
   */
  addDataOutput(data: Buffer): this;

  /**
   * Set transaction fee
   */
  setFee(fee: number): this;

  /**
   * Build the transaction
   */
  build(options?: BuildOptions): Psbt;

  /**
   * Get current fee estimate
   */
  getFeeEstimate(): number;

  /**
   * Get transaction size estimate
   */
  getSizeEstimate(): number;

  /**
   * Sign the transaction
   */
  sign(privateKey: Buffer, options?: SignOptions): this;

  /**
   * Finalize the transaction
   */
  finalize(): this;

  /**
   * Extract the final transaction
   */
  extractTransaction(): string;

  /**
   * Get the PSBT
   */
  getPsbt(): Psbt;

  /**
   * Validate the transaction
   */
  validate(): boolean;
}

/**
 * Transaction builder configuration
 */
export interface TransactionBuilderConfig {
  /** Bitcoin network */
  network?: Network;
  /** Default fee rate */
  defaultFeeRate?: number;
  /** Enable RBF by default */
  enableRBF?: boolean;
  /** Dust threshold */
  dustThreshold?: number;
  /** Maximum transaction size */
  maxTransactionSize?: number;
  /** UTXO provider for automatic input selection */
  utxoProvider?: any; // IUTXOProvider when available
}

/**
 * Input options for adding UTXOs
 */
export interface InputOptions {
  /** Sequence number for RBF */
  sequence?: number;
  /** Witness script for P2WSH */
  witnessScript?: Buffer;
  /** Redeem script for P2SH */
  redeemScript?: Buffer;
  /** Non-witness UTXO for legacy inputs */
  nonWitnessUtxo?: Buffer;
}

/**
 * Build options for transaction creation
 */
export interface BuildOptions {
  /** Version number */
  version?: number;
  /** Locktime */
  locktime?: number;
  /** Enable automatic change output */
  autoChange?: boolean;
  /** Change address */
  changeAddress?: string;
  /** Subtract fee from outputs */
  subtractFeeFromOutputs?: boolean;
  /** Skip validation */
  skipValidation?: boolean;
}

/**
 * Sign options for transaction signing
 */
export interface SignOptions {
  /** Sighash type */
  sighashType?: number;
  /** Sign all inputs */
  signAll?: boolean;
  /** Input indices to sign */
  inputIndices?: number[];
}
