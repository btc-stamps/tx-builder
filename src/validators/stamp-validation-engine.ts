/**
 * Minimal Stamp Validation Engine
 *
 * Bitcoin Stamps can store ANY data on-chain.
 * The only real constraint is the transaction size limit.
 */

import { Buffer } from 'node:buffer';
import * as bitcoin from 'bitcoinjs-lib';
import type { Network } from 'bitcoinjs-lib';

import { DataProcessor, STAMP_MAX_SIZE } from '../utils/data-processor.ts';
import type { BitcoinStampData } from '../encoders/bitcoin-stamps-encoder.ts';

export interface StampValidationConfig {
  network?: Network;
  maxSize?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  details?: any;
}

export interface ValidationError {
  severity: 'error';
  code: string;
  message: string;
  field?: string;
  remediationSuggestion?: string;
}

export interface ValidationWarning {
  severity: 'warning';
  code: string;
  message: string;
  field?: string;
  remediationSuggestion?: string;
}

/**
 * Minimal validation for Bitcoin Stamps
 * Only validates what actually matters
 */
export class StampValidationEngine {
  private readonly config: Required<StampValidationConfig>;

  constructor(config: StampValidationConfig = {}) {
    this.config = {
      network: config.network ?? bitcoin.networks.bitcoin,
      maxSize: config.maxSize ?? STAMP_MAX_SIZE,
    };
  }

  /**
   * Validate stamp data
   * Only checks the real constraint: transaction size
   */
  validateStampData(data: BitcoinStampData): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const details: any = {};

    // Check if data exists
    if (!data || !Buffer.isBuffer(data.imageData)) {
      errors.push({
        severity: 'error',
        code: 'INVALID_DATA',
        message: 'Stamp data must include a Buffer of data',
        field: 'imageData',
      });
      return { isValid: false, errors, warnings, details };
    }

    // Check size constraint (the ONLY real constraint)
    if (data.imageData.length > this.config.maxSize) {
      errors.push({
        severity: 'error',
        code: 'DATA_SIZE_EXCEEDED',
        message:
          `Data size ${data.imageData.length} bytes exceeds maximum ${this.config.maxSize} bytes`,
        field: 'imageData',
        remediationSuggestion: `Reduce data size to ${this.config.maxSize} bytes or less`,
      });
    }

    // Empty data warning
    if (data.imageData.length === 0) {
      warnings.push({
        severity: 'warning',
        code: 'EMPTY_DATA',
        message: 'Data is empty',
        field: 'imageData',
      });
    }

    // Detect format for informational purposes only
    const format = DataProcessor.detectFormat(data.imageData);
    details.detectedFormat = format;
    details.dataSize = data.imageData.length;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      details,
    };
  }

  /**
   * Simple helper to check if data is valid
   */
  isValid(data: BitcoinStampData): boolean {
    return this.validateStampData(data).isValid;
  }
}

/**
 * Create a stamp validation engine for validating Bitcoin Stamps data
 *
 * @param config - Optional validation configuration
 * @returns A configured StampValidationEngine instance
 *
 * @example Basic validation
 * ```typescript
 * const validator = createStampValidationEngine();
 * const result = await validator.validate(stampData);
 * if (!result.isValid) {
 *   console.error(result.errors);
 * }
 * ```
 *
 * @example With strict configuration
 * ```typescript
 * const validator = createStampValidationEngine({
 *   maxFileSize: 5000000,
 *   strictMode: true
 * });
 * ```
 */
export function createStampValidationEngine(
  config?: StampValidationConfig,
): StampValidationEngine {
  return new StampValidationEngine(config);
}

// Exports removed - validation engine simplified
