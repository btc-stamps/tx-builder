/**
 * PSBT Validation Interface
 * Comprehensive PSBT validation and finalization support
 */

import type { Network, Psbt, Transaction } from 'bitcoinjs-lib';

export interface PSBTValidationRule {
  /** Rule identifier */
  name: string;
  /** Rule description */
  description: string;
  /** Rule category */
  category: 'structure' | 'signature' | 'script' | 'fee' | 'compatibility';
  /** Whether this is a critical rule (failure prevents finalization) */
  critical: boolean;
}

export interface PSBTValidationResult {
  /** Overall validation status */
  valid: boolean;
  /** Whether transaction can be finalized */
  canFinalize: boolean;
  /** Critical errors that prevent finalization */
  criticalErrors: ValidationError[];
  /** Non-critical warnings */
  warnings: ValidationWarning[];
  /** Successful rule checks */
  passed: string[];
  /** Input-specific validation results */
  inputValidation: InputValidationResult[];
  /** Output-specific validation results */
  outputValidation: OutputValidationResult[];
  /** Overall transaction analysis */
  transactionAnalysis: TransactionAnalysis;
}

export interface ValidationError {
  /** Error rule name */
  rule: string;
  /** Error message */
  message: string;
  /** Input/output index if applicable */
  index?: number;
  /** Error severity */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Suggested fix */
  suggestion?: string;
}

export interface ValidationWarning {
  /** Warning rule name */
  rule: string;
  /** Warning message */
  message: string;
  /** Input/output index if applicable */
  index?: number;
  /** Recommended action */
  recommendation?: string;
}

export interface InputValidationResult {
  /** Input index */
  index: number;
  /** Input validation status */
  valid: boolean;
  /** Whether input can be finalized */
  canFinalize: boolean;
  /** Input errors */
  errors: ValidationError[];
  /** Input warnings */
  warnings: ValidationWarning[];
  /** Input analysis */
  analysis: InputAnalysis;
}

export interface OutputValidationResult {
  /** Output index */
  index: number;
  /** Output validation status */
  valid: boolean;
  /** Output errors */
  errors: ValidationError[];
  /** Output warnings */
  warnings: ValidationWarning[];
  /** Output analysis */
  analysis: OutputAnalysis;
}

export interface InputAnalysis {
  /** Input type detected */
  inputType: 'P2PKH' | 'P2WPKH' | 'P2SH' | 'P2WSH' | 'P2TR' | 'unknown';
  /** Whether input has witness UTXO */
  hasWitnessUtxo: boolean;
  /** Whether input has non-witness UTXO */
  hasNonWitnessUtxo: boolean;
  /** Whether input has redeem script */
  hasRedeemScript: boolean;
  /** Whether input has witness script */
  hasWitnessScript: boolean;
  /** Number of signatures present */
  signaturesCount: number;
  /** Required signatures */
  signaturesRequired: number;
  /** BIP32 derivation paths count */
  derivationPathsCount: number;
  /** Sighash types used */
  sighashTypes: number[];
  /** Estimated input size */
  estimatedSize: number;
}

export interface OutputAnalysis {
  /** Output type detected */
  outputType:
    | 'P2PKH'
    | 'P2WPKH'
    | 'P2SH'
    | 'P2WSH'
    | 'P2TR'
    | 'OP_RETURN'
    | 'unknown';
  /** Output value */
  value: number;
  /** Whether output is change */
  isChange: boolean;
  /** Whether output is above dust threshold */
  aboveDustThreshold: boolean;
  /** BIP32 derivation paths count */
  derivationPathsCount: number;
  /** Output address (if extractable) */
  address?: string;
}

export interface TransactionAnalysis {
  /** Transaction version */
  version: number;
  /** Transaction locktime */
  locktime: number;
  /** Input count */
  inputCount: number;
  /** Output count */
  outputCount: number;
  /** Total input value */
  totalInputValue: number;
  /** Total output value */
  totalOutputValue: number;
  /** Transaction fee */
  fee: number;
  /** Fee rate (sat/vB) */
  feeRate: number;
  /** Estimated transaction size */
  estimatedSize: number;
  /** Whether RBF is signaled */
  rbfEnabled: boolean;
  /** Whether transaction is segwit */
  isSegwit: boolean;
  /** Complexity score */
  complexityScore: number;
}

export interface FinalizationOptions {
  /** Skip signature validation during finalization */
  skipSignatureValidation?: boolean;
  /** Allow partial finalization of inputs */
  allowPartialFinalization?: boolean;
  /** Finalize specific inputs only */
  inputIndices?: number[];
  /** Custom finalization handlers */
  customFinalizers?: Map<string, InputFinalizer>;
  /** Whether to extract transaction after finalization */
  extractTransaction?: boolean;
}

export interface FinalizationResult {
  /** Whether finalization was successful */
  success: boolean;
  /** Number of inputs finalized */
  finalizedInputs: number;
  /** Total inputs */
  totalInputs: number;
  /** Inputs that failed finalization */
  failedInputs: number[];
  /** Finalization errors */
  errors: ValidationError[];
  /** Finalization warnings */
  warnings: ValidationWarning[];
  /** Final transaction (if successfully finalized and extracted) */
  transaction?: Transaction;
  /** Transaction ID (if finalized) */
  transactionId?: string;
}

export interface InputFinalizer {
  /** Finalizer name */
  name: string;
  /** Whether this finalizer can handle the input */
  canFinalize(psbt: Psbt, inputIndex: number): boolean;
  /** Finalize the input */
  finalize(
    psbt: Psbt,
    inputIndex: number,
  ): {
    success: boolean;
    error?: string;
  };
}

export interface PSBTAnalysisReport {
  /** PSBT summary */
  summary: {
    valid: boolean;
    canFinalize: boolean;
    completionPercentage: number;
    estimatedFee: number;
    estimatedFeeRate: number;
  };
  /** Detailed validation results */
  validation: PSBTValidationResult;
  /** Finalization readiness */
  finalization: {
    ready: boolean;
    readyInputs: number[];
    blockedInputs: Array<{
      index: number;
      reason: string;
      missingComponents: string[];
    }>;
  };
  /** Security analysis */
  security: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    risks: string[];
    recommendations: string[];
  };
  /** Compatibility analysis */
  compatibility: {
    bitcoinjsLib: boolean;
    bip174: boolean;
  };
}

/**
 * PSBT Validator Interface
 */
export interface IPSBTValidator {
  /**
   * Validate PSBT comprehensively
   */
  validate(psbt: Psbt, network?: Network): Promise<PSBTValidationResult>;

  /**
   * Validate specific input
   */
  validateInput(psbt: Psbt, inputIndex: number): Promise<InputValidationResult>;

  /**
   * Validate specific output
   */
  validateOutput(
    psbt: Psbt,
    outputIndex: number,
  ): Promise<OutputValidationResult>;

  /**
   * Check if PSBT can be finalized
   */
  canFinalize(psbt: Psbt): Promise<boolean>;

  /**
   * Get missing components for finalization
   */
  getMissingComponents(psbt: Psbt): Promise<
    Array<{
      inputIndex: number;
      missing: string[];
    }>
  >;

  /**
   * Analyze PSBT structure and completeness
   */
  analyze(psbt: Psbt): Promise<PSBTAnalysisReport>;
}

/**
 * PSBT Finalizer Interface
 */
export interface IPSBTFinalizer {
  /**
   * Finalize PSBT
   */
  finalize(
    psbt: Psbt,
    options?: FinalizationOptions,
  ): Promise<FinalizationResult>;

  /**
   * Finalize specific inputs
   */
  finalizeInputs(
    psbt: Psbt,
    inputIndices: number[],
  ): Promise<FinalizationResult>;

  /**
   * Check finalization readiness
   */
  checkFinalizationReadiness(psbt: Psbt): Promise<{
    ready: boolean;
    readyInputs: number[];
    blockedInputs: Array<{ index: number; reason: string }>;
  }>;

  /**
   * Extract final transaction
   */
  extractTransaction(psbt: Psbt): Transaction;

  /**
   * Register custom input finalizer
   */
  registerFinalizer(finalizer: InputFinalizer): void;

  /**
   * Simulate transaction execution
   */
  simulateExecution(psbt: Psbt): Promise<{
    success: boolean;
    errors: string[];
    gasUsed?: number;
  }>;
}

/**
 * PSBT Compatibility Checker Interface
 */
export interface IPSBTCompatibilityChecker {
  /**
   * Check bitcoinjs-lib compatibility
   */
  checkBitcoinjsLibCompatibility(psbt: Psbt): {
    compatible: boolean;
    version: string;
    issues: string[];
  };

  /**
   * Check BIP-174 compliance
   */
  checkBIP174Compliance(psbt: Psbt): {
    compliant: boolean;
    violations: string[];
  };

  /**
   * Get compatibility report
   */
  getCompatibilityReport(psbt: Psbt): {
    bitcoinjsLib: boolean;
    bip174: boolean;
    overallScore: number;
  };
}

/**
 * PSBT validation errors
 */
export class PSBTValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly inputIndex?: number,
    public readonly outputIndex?: number,
  ) {
    super(message);
    this.name = 'PSBTValidationError';
  }
}

export class PSBTFinalizationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly inputIndex?: number,
  ) {
    super(message);
    this.name = 'PSBTFinalizationError';
  }
}

export class InsufficientSignaturesError extends PSBTFinalizationError {
  constructor(inputIndex: number, required: number, found: number) {
    super(
      `Insufficient signatures for input ${inputIndex}: found ${found}, required ${required}`,
      'INSUFFICIENT_SIGNATURES',
      inputIndex,
    );
  }
}

export class MissingUTXOError extends PSBTValidationError {
  constructor(inputIndex: number) {
    super(
      `Missing UTXO information for input ${inputIndex}`,
      'MISSING_UTXO',
      inputIndex,
    );
  }
}

export class InvalidScriptError extends PSBTValidationError {
  constructor(inputIndex: number, reason: string) {
    super(
      `Invalid script for input ${inputIndex}: ${reason}`,
      'INVALID_SCRIPT',
      inputIndex,
    );
  }
}
