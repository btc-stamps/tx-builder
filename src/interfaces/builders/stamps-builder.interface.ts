/**
 * Bitcoin Stamps Builder Type Definitions
 *
 * Types for Bitcoin Stamps transaction building, following the same pattern
 * as SRC-20 builder interfaces
 */

import type { Psbt } from 'bitcoinjs-lib';
import type { TransactionOutput } from '../transaction.interface';
import type { BitcoinStampData } from '../encoders/stamps.interface';
import type { IProtectionDetector } from '../protection.interface';
import type { OrdinalsMultiProviderDetectorOptions } from '../../detectors/ordinals-multi-provider-detector';
import type { MultiAssetProtectionDetectorOptions } from '../../detectors/multi-asset-protection-detector';
import type { AssetValidationConfig } from '../../services/asset-validation-service';

/**
 * Stamp transaction building options
 */
export interface StampTransactionOptions {
  /** Stamp data to encode */
  stampData: BitcoinStampData & Record<PropertyKey, never>;
  /** Address that creates the stamp */
  fromAddress: string;
  /** Optional recipient address (stamps usually go to creator) */
  recipientAddress?: string;
  /** CPID (Counterparty ID) (e.g., 'A95428956662000000') */
  cpid: string;
  /** Supply (default: 1 for stamps) */
  supply?: number;
  /** Whether asset is locked (default: true for stamps) */
  isLocked?: boolean;
  /** Fee rate in sat/vB (default: 20) */
  feeRate?: number;
  /** Dust value per output (default: 330 for stamps) */
  dustValue?: number;
  /** Enable RBF (default: true) */
  enableRbf?: boolean;
  /** UTXO selection algorithm (default: 'accumulative') */
  algorithm?: 'accumulative' | 'branch-and-bound' | 'blackjack' | 'knapsack';
}

/**
 * Build result for stamp transactions
 * Consistent with SRC20BuildResult structure
 */
export interface StampBuildResult {
  /** The partially signed Bitcoin transaction */
  psbt: Psbt;
  /** Total value of inputs in satoshis */
  totalInputValue: number;
  /** Total value of outputs in satoshis */
  totalOutputValue: number;
  /** Transaction fee in satoshis */
  fee: number;
  /** Change amount in satoshis (if any) */
  changeAmount: number;
  /** The stamp data outputs (OP_RETURN + P2WSH) */
  dataOutputs: TransactionOutput[];
  /** Estimated transaction size in bytes */
  estimatedTxSize: number;
  /** Dust value used */
  dustValue: number;
  /** CPID (Counterparty ID) used (optional for stamps) */
  cpid?: string;
}

/**
 * Builder options for Bitcoin Stamp transactions
 * Configuration for the builder itself
 */
export interface BitcoinStampBuilderOptions {
  /** Dust threshold for outputs (default: 330 for stamps) */
  dustThreshold?: number;
  /** Default fee rate in sat/vB (default: 20 for data transactions) */
  defaultFeeRate?: number;
  /** Enable Replace-By-Fee (default: true) */
  enableRbf?: boolean;
  /** Optional multi-asset protection detector for comprehensive UTXO protection (ordinals, inscriptions, Counterparty assets) */
  protectionDetector?: IProtectionDetector;
  /** Configuration for the built-in detectors (alternative to providing custom detector). Set to false to disable protection entirely. */
  detectorOptions?: OrdinalsMultiProviderDetectorOptions | false;
  /** Configuration for MultiAssetProtectionDetector aggregation behavior */
  multiAssetOptions?: MultiAssetProtectionDetectorOptions;
  /** Enable compression (default: false for stamps - they use raw data) */
  enableCompression?: boolean;
  /** Enable optimization (default: false for stamps) */
  enableOptimization?: boolean;
  /** Configuration for asset validation service */
  assetValidationConfig?: AssetValidationConfig;
}

/**
 * Options for building from pre-encoded data
 */
export interface BuildFromEncodedOptions {
  /** Fee rate in sat/vB */
  feeRate?: number;
  /** Enable RBF */
  enableRbf?: boolean;
  /** UTXO selection algorithm */
  algorithm?: 'accumulative' | 'branch-and-bound' | 'blackjack' | 'knapsack';
  /** CPID (Counterparty ID) (optional, for result consistency) */
  cpid?: string;
}
