/**
 * Bitcoin Stamps Type Definitions
 *
 * Complete type system for Bitcoin Stamps protocol implementation
 */

import { Buffer } from 'node:buffer';
import type { EncodingOptions, EncodingResult, TransactionOutput } from './base.interface';
import type { OptimizedScript, PatternAnalysis } from '../internal/optimization.interface';

/**
 * Bitcoin Stamps specific data structure
 */
export interface BitcoinStampData {
  /** Raw image binary data */
  imageData: Buffer;
  /** Optional stamp title */
  title?: string;
  /** Optional description */
  description?: string;
  /** Optional creator identifier */
  creator?: string;
  /** Optional filename */
  filename?: string;
}

/**
 * Bitcoin Stamps encoding options
 */
export interface BitcoinStampEncodingOptions extends EncodingOptions {
  /** Enable data compression (default: true) */
  enableCompression?: boolean;
  /** Custom dust value for P2WSH outputs (default: 330 for stamps) */
  dustValue?: number;
  /** Maximum number of P2WSH outputs allowed (default: 50) */
  maxOutputs?: number;
  /** Skip image validation (default: false) */
  skipValidation?: boolean;
  /** UTXOs to use for creating the OP_RETURN (required for proper Counterparty encoding) */
  utxos?: Array<{ txid: string; vout: number; value: number }>;
  /**
   * CPID (Counterparty ID) for the stamp
   * Supports regular assets (A12345...) and sub-assets (A12345.SUBASSET)
   */
  cpid?: string;
  /** Supply amount (default: 1) */
  supply?: number;
  /** Whether the asset is locked (default: true) */
  isLocked?: boolean;
  /** Enable script optimization (default: true) */
  enableOptimization?: boolean;
  /** Enable pattern analysis for better optimization (default: true) */
  enablePatternAnalysis?: boolean;
}

/**
 * Bitcoin Stamps encoding result
 */
export type BitcoinStampEncodingResult = EncodingResult & {
  /** P2WSH outputs containing raw binary data */
  p2wshOutputs: TransactionOutput[];
  /** OP_RETURN output with Counterparty protocol data */
  opReturnOutput: TransactionOutput;
  /** Stamp metadata */
  metadata: StampMetadata;
  /** Whether compression was used */
  compressionUsed: boolean;
  /** Pattern analysis results (if enabled) */
  patternAnalysis?: PatternAnalysis;
  /** Script optimization results (if enabled) */
  scriptOptimization?: OptimizedScript;
};

/**
 * Stamp metadata information
 */
export interface StampMetadata {
  /** Image format (PNG, GIF, JPEG, WEBP) */
  imageFormat: string;
  /** Image dimensions */
  imageDimensions: { width: number; height: number };
  /** Original size in bytes */
  originalSize: number;
  /** Compressed size in bytes (if compression used) */
  compressedSize?: number;
  /** Base64 data URI for the image */
  base64URI: string;
}

/**
 * Stamp validation configuration
 */
export interface StampValidationConfig {
  /** Maximum allowed image size in bytes */
  maxSize?: number;
  /** Minimum allowed image size in bytes */
  minSize?: number;
  /** Allowed image formats */
  allowedFormats?: string[];
  /** Validate image dimensions */
  validateDimensions?: boolean;
  /** Strict mode - fail on any warning */
  strictMode?: boolean;
}
