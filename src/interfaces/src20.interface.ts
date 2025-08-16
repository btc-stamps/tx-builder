/**
 * SRC-20 Token Interface Definitions
 *
 * Defines types and interfaces for SRC-20 token transactions and configuration.
 * The actual Bitcoin protocol only requires the dust minimum (546 sats for P2PKH).
 */

import type { EncodingOptions, EncodingResult, TransactionOutput } from './encoder.interface.ts';
import type { Network } from 'bitcoinjs-lib';
import type { IProtectionDetector } from './protection.interface.ts';
import type { OrdinalsMultiProviderDetectorOptions } from '../detectors/ordinals-multi-provider-detector.ts';
import type { MultiAssetProtectionDetectorOptions } from '../detectors/multi-asset-protection-detector.ts';

/**
 * SRC-20 configuration options
 */
export interface SRC20Options {
  /**
   * Custom dust threshold for outputs
   *
   * @default 546
   * @description Bitcoin protocol dust threshold for outputs.
   * This is a protocol requirement.
   */
  dustThreshold?: number;

  /**
   * Fee calculation mode
   *
   * @default 'market-aware'
   * @description How to calculate fees for stamp transactions
   * - 'market-aware': Use higher fees for stamp-related transactions
   * - 'standard': Use standard Bitcoin fee rates
   */
  feeMode?: 'market-aware' | 'standard';
}

/**
 * SRC-20 transaction operation types
 */
export type SRC20OperationType = 'DEPLOY' | 'MINT' | 'TRANSFER';

/**
 * SRC-20 operation structure (generic interface for testing)
 */
export interface SRC20Operation {
  p: 'SRC-20';
  op: SRC20OperationType;
  tick: string;
  max?: string;
  lim?: string;
  amt?: string | string[]; // Support both single and multiple amounts
  dec?: string | number;
  description?: string;
  x?: string;
  web?: string;
  email?: string;
  tg?: string;
  img?: string;
  icon?: string;
}

/**
 * Base SRC-20 data structure for protocol JSON
 */
export interface BaseSRC20Data {
  /** Protocol identifier - REQUIRED, always 'SRC-20' */
  p: 'SRC-20';
  op: SRC20OperationType;
  tick: string;
}

/**
 * SRC-20 Deploy operation data - protocol-specific interface using 'dec' field
 */
export interface SRC20DeployData extends BaseSRC20Data {
  op: 'DEPLOY';
  max: string;
  lim: string;
  dec?: number; // SRC-20 protocol uses 'dec', not 'deci'
  // Optional metadata fields specific to deployment
  x?: string;
  web?: string;
  email?: string;
  tg?: string;
  description?: string;
  img?: string; // protocol:hash format (max 32 chars)
  icon?: string; // protocol:hash format (max 32 chars)
}

// SRC-20 specific encoding
export interface SRC20EncodingOptions extends EncodingOptions {
  dustValue?: number;
  network?: Network;
  /**
   * Maximum number of outputs to create for encoding SRC-20 data
   *
   * @default 2940 (based on Bitcoin's 100KB standard transaction size limit)
   * @description This is a sanity check based on Bitcoin's relay policy, not a consensus rule.
   *              Bitcoin Core nodes by default will not relay transactions larger than 100KB.
   *              With ~34 bytes per P2WSH output, this allows approximately 2940 outputs.
   *              The actual limit depends on the full transaction size including inputs.
   *              You can set this higher if needed, but be aware of relay policy limits.
   */
  maxOutputs?: number;
  useCompression?: boolean;

  // Address information for complete transaction construction
  fromAddress?: string;
  toAddress?: string; // Required for TRANSFER operations
}

export interface SRC20EncodingResult extends EncodingResult {
  /** P2WSH outputs containing the SRC-20 data */
  p2wshOutputs: TransactionOutput[];
  /** The OP_RETURN output for Counterparty protocol */
  opReturnOutput: TransactionOutput;
  /** The JSON data that was encoded */
  jsonData: string;
  /** Number of chunks created */
  chunkCount: number;
  /** Whether compression was used */
  compressionUsed: boolean;
  /** Total dust value required */
  totalDustValue: number;
  /** Total size of the encoded data (same as dataSize, for backward compatibility) */
  totalSize: number;
}

/**
 * SRC-20 Mint operation data - protocol-specific interface
 */
export interface SRC20MintData extends BaseSRC20Data {
  op: 'MINT';
  amt: string;
}

/**
 * SRC-20 Transfer operation data - protocol-specific interface
 */
export interface SRC20TransferData extends BaseSRC20Data {
  op: 'TRANSFER';
  amt: string;
}

/**
 * Union type for all SRC-20 operation data
 */
export type SRC20Data = SRC20DeployData | SRC20MintData | SRC20TransferData;

/**
 * SRC-20 transaction builder options
 */
export interface SRC20BuilderOptions extends SRC20Options {
  /**
   * Network to use for transactions
   */
  network?: any; // bitcoin.Network type

  /**
   * Default fee rate in satoshis per virtual byte
   *
   * @default 15
   */
  defaultFeeRate?: number;

  /**
   * Enable Replace-by-Fee (RBF) by default
   *
   * @default true
   */
  enableRbf?: boolean;

  /**
   * Enable Child-Pays-For-Parent (CPFP) support
   *
   * @default false
   */
  enableCPFP?: boolean;

  /**
   * Maximum number of inputs to use in a transaction
   *
   * @default 50
   */
  maxInputs?: number;

  /**
   * Maximum number of data outputs to create
   *
   * @default 10
   */
  maxDataOutputs?: number;

  /**
   * Optional multi-asset protection detector for comprehensive UTXO protection (ordinals, inscriptions, Counterparty assets)
   * By default, uses MultiAssetProtectionDetector with both ordinals and Counterparty protection
   */
  protectionDetector?: IProtectionDetector;

  /**
   * Configuration for the built-in detectors (alternative to providing custom detector). Set to false to disable protection entirely.
   */
  detectorOptions?: OrdinalsMultiProviderDetectorOptions | false;

  /**
   * Configuration for MultiAssetProtectionDetector aggregation behavior
   */
  multiAssetOptions?: MultiAssetProtectionDetectorOptions;

  /**
   * UTXO provider for fetching unspent outputs
   */
  utxoProvider: any; // IUTXOProvider

  /**
   * Selector factory for UTXO selection algorithms
   */
  selectorFactory: any; // SelectorFactory

  /**
   * Optional logger for debugging
   */
  logger?: any; // Logger
}

/**
 * Default SRC-20 options
 */
export const DEFAULT_SRC20_OPTIONS: Required<SRC20Options> = {
  dustThreshold: 300, // Bitcoin protocol requirement
  feeMode: 'market-aware', // Use higher fees for stamp transactions
} as const;

/**
 * Utility function to create SRC-20 options with defaults
 */
export function createSRC20Options(
  options: Partial<SRC20Options> = {},
): Required<SRC20Options> {
  return {
    ...DEFAULT_SRC20_OPTIONS,
    ...options,
  };
}
