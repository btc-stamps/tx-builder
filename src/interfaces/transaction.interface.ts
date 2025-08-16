/**
 * Transaction Builder Interface
 * Core interface for building Bitcoin transactions
 */

import type { Network, Psbt, Transaction as BTCTransaction } from 'bitcoinjs-lib';
import type { ECPairInterface } from 'ecpair';

import type { UTXO } from './provider.interface';
import { Buffer } from 'node:buffer';

export interface TransactionInput {
  utxo: UTXO;
  sequence?: number;
  witnessUtxo?: {
    script: Buffer;
    value: number;
  };
  nonWitnessUtxo?: Buffer;
}

export interface TransactionOutput {
  address?: string;
  script?: Buffer;
  value: number;
}

export interface BuildOptions {
  inputs?: TransactionInput[];
  outputs: TransactionOutput[];
  changeAddress?: string;
  feeRate?: number;
  rbf?: boolean; // Replace-by-fee
  locktime?: number;
  version?: number;
  network?: Network;
}

export interface SignOptions {
  keyPair?: ECPairInterface;
  keyPairs?: ECPairInterface[];
  signAll?: boolean;
  sighashType?: number;
}

export interface ITransactionBuilder {
  /**
   * Create a new transaction
   */
  create(options: BuildOptions): Promise<Psbt>;

  /**
   * Add inputs to transaction (with validation)
   */
  addInputs(psbt: Psbt, inputs: TransactionInput[]): Promise<void>;

  /**
   * Add outputs to transaction (with validation)
   */
  addOutputs(psbt: Psbt, outputs: TransactionOutput[]): Promise<void>;

  /**
   * Add change output if needed
   */
  addChange(psbt: Psbt, changeAddress: string, changeAmount: number): void;

  /**
   * Sign transaction
   */
  sign(psbt: Psbt, options: SignOptions): Promise<void>;

  /**
   * Finalize and extract transaction (with validation)
   */
  finalize(psbt: Psbt): Promise<BTCTransaction>;

  /**
   * Build complete transaction from UTXOs
   */
  buildFromUTXOs(
    utxos: UTXO[],
    outputs: TransactionOutput[],
    changeAddress: string,
    options?: Partial<BuildOptions>,
  ): Psbt;

  /**
   * Estimate transaction size
   */
  estimateSize(
    numInputs: number,
    numOutputs: number,
    isSegwit?: boolean,
  ): number;

  /**
   * Calculate transaction fee
   */
  calculateFee(size: number, feeRate: number): number;
}

export interface TransactionBuilderConfig {
  network: Network;
  dustThreshold?: number;
  defaultFeeRate?: number;
  defaultRbf?: boolean;
}
