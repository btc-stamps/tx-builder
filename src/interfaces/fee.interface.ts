/**
 * Enhanced Fee Estimation Interface
 * Handles fee calculation and estimation strategies with accurate witness size calculation
 */

import { Buffer } from 'node:buffer';

export interface FeeRate {
  low: number; // 1+ blocks
  medium: number; // 3-6 blocks
  high: number; // 1-2 blocks
  urgent?: number | undefined; // Next block
}

export interface FeeEstimate {
  feeRate: number; // sat/vB
  totalFee: number; // Total fee in satoshis
  confidence: number; // 0-1 confidence level
  blocks: number; // Expected blocks to confirmation
  confirmationTime?: string; // Human readable time estimate
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export type OutputType =
  | 'P2PKH'
  | 'P2WPKH'
  | 'P2SH'
  | 'P2WSH'
  | 'P2TR'
  | 'OP_RETURN';
export type InputType = 'P2PKH' | 'P2WPKH' | 'P2SH' | 'P2WSH' | 'P2TR';

export interface SizeCalculation {
  inputSize: number; // Bytes for input
  outputSize: number; // Bytes for output
  witnessSize: number; // Witness bytes (0 for non-SegWit, actual size for SegWit)
  virtualSize: number; // vBytes (weight/4)
}

export interface DustThresholds {
  P2PKH: number; // 546 sats
  P2WPKH: number; // 294 sats
  P2SH: number; // 540 sats
  P2WSH: number; // 330 sats
  P2TR: number; // 330 sats
}

export interface IFeeEstimator {
  /**
   * Get current fee rates with historical context
   */
  getFeeRates(): Promise<FeeRate>;

  /**
   * Estimate fee for transaction with enhanced calculation
   */
  estimateFee(
    size: number,
    priority: 'low' | 'medium' | 'high' | 'urgent',
  ): Promise<FeeEstimate>;

  /**
   * Calculate accurate transaction size with witness data
   */
  calculateTransactionSize(
    inputs: Array<{ type: InputType; witnessScript?: Buffer }>,
    outputs: Array<{ type: OutputType; size?: number }>,
  ): SizeCalculation;

  /**
   * Calculate output type specific sizes
   */
  getOutputSize(type: OutputType, scriptSize?: number): number;

  /**
   * Calculate input type specific sizes
   */
  getInputSize(type: InputType, witnessScript?: Buffer): SizeCalculation;

  /**
   * Get dynamic dust thresholds based on fee rates
   */
  getDustThresholds(feeRate?: number): DustThresholds;

  /**
   * Calculate CPFP (Child Pays For Parent) fee
   */
  calculateCPFP(
    _parentTxid: string,
    parentFee: number,
    childSize: number,
    targetFeeRate: number,
  ): Promise<number>;

  /**
   * Calculate RBF (Replace By Fee) fee
   */
  calculateRBF(originalFee: number, minRelayFee?: number): number;
}

export interface FeeEstimatorOptions {
  provider?: 'mempool' | 'blockstream' | 'electrum' | 'custom';
  fallbackFeeRate?: number;
  minFeeRate?: number;
  maxFeeRate?: number;
  enableSrc20Rules?: boolean;
  networkType?: 'mainnet' | 'testnet' | 'regtest';
  useMockProvider?: boolean; // NEW: Explicit mock control for testing
  electrumXProvider?: any; // NEW: Allow injection of custom provider
}
