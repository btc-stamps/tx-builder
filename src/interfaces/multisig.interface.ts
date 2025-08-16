/**
 * Multi-signature Interface
 * Comprehensive multi-signature transaction support
 */

import { Buffer } from 'node:buffer';

import type { Network, Psbt } from 'bitcoinjs-lib';

export interface DerivationPath {
  /** BIP32 derivation path (e.g., "m/84'/0'/0'/0/0") */
  path: string;
  /** Master fingerprint (4 bytes) */
  masterFingerprint: Buffer;
  /** Account extended public key */
  accountXpub?: string | undefined;
}

export type SigHashType =
  | 'SIGHASH_ALL'
  | 'SIGHASH_NONE'
  | 'SIGHASH_SINGLE'
  | 'SIGHASH_ALL_ANYONECANPAY'
  | 'SIGHASH_NONE_ANYONECANPAY'
  | 'SIGHASH_SINGLE_ANYONECANPAY';

export type MultisigScriptType = 'P2SH' | 'P2WSH' | 'P2SH_P2WSH';

export interface MultisigConfig {
  /** Required signatures (m) */
  threshold: number;
  /** Total participants (n) */
  totalParticipants: number;
  /** Participant public keys in order */
  publicKeys: Buffer[];
  /** Script type for the multisig */
  scriptType: MultisigScriptType;
  /** Network */
  network: Network;
  /** Whether to sort keys (BIP 67) */
  sortKeys?: boolean;
}

export interface MultisigParticipant {
  /** Participant identifier */
  id: string;
  /** Public key */
  publicKey: Buffer;
  /** BIP32 derivation path */
  derivationPath?: DerivationPath | undefined;
  /** Extended public key */
  xpub?: string | undefined;
  /** Participant's signature (if available) */
  signature?: Buffer | undefined;
  /** Signature hash type used */
  sigHashType?: SigHashType | undefined;
  /** Whether this participant has signed */
  hasSigned: boolean;
}

export interface MultisigAddress {
  /** The multisig address */
  address: string;
  /** Redeem script (for P2SH) */
  redeemScript?: Buffer;
  /** Witness script (for P2WSH) */
  witnessScript?: Buffer;
  /** Script public key */
  scriptPubKey: Buffer;
  /** Participants */
  participants: MultisigParticipant[];
  /** Multisig configuration */
  config: MultisigConfig;
}

export interface MultisigInputOptions {
  /** Previous transaction ID */
  txid: string;
  /** Previous output index */
  vout: number;
  /** Input value */
  value: number;
  /** Multisig address info */
  multisigAddress: MultisigAddress;
  /** Sequence number */
  sequence?: number;
  /** Witness UTXO for SegWit inputs */
  witnessUtxo?: { script: Buffer; value: number };
  /** Non-witness UTXO for legacy inputs */
  nonWitnessUtxo?: Buffer;
}

export interface PartialSignature {
  /** Input index */
  inputIndex: number;
  /** Participant ID who created this signature */
  participantId: string;
  /** Signature data */
  signature: Buffer;
  /** Public key used for signing */
  publicKey: Buffer;
  /** Signature hash type */
  sigHashType: SigHashType;
  /** Derivation path (if applicable) */
  derivationPath?: DerivationPath;
}

export interface MultisigSigningRequest {
  /** PSBT to sign */
  psbt: Psbt;
  /** Input indices to sign */
  inputIndices: number[];
  /** Participant who is signing */
  participant: MultisigParticipant;
  /** Signature hash type to use */
  sigHashType?: SigHashType;
  /** Custom message for signing */
  message?: string;
}

export interface MultisigSigningResult {
  /** Updated PSBT with partial signatures */
  psbt: Psbt;
  /** Partial signatures created */
  partialSignatures: PartialSignature[];
  /** Input indices that were signed */
  signedIndices: number[];
  /** Any errors encountered */
  errors?: Array<{ index: number; error: string }>;
}

export interface MultisigValidationResult {
  /** Whether the multisig setup is valid */
  valid: boolean;
  /** Whether transaction has sufficient signatures */
  sufficientSignatures: boolean;
  /** Current signature count per input */
  signatureCounts: number[];
  /** Required signature count */
  requiredSignatures: number;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}

/**
 * Multi-signature Transaction Builder Interface
 */
export interface IMultisigBuilder {
  /**
   * Create multisig address
   */
  createMultisigAddress(config: MultisigConfig): MultisigAddress;

  /**
   * Add multisig input to PSBT
   */
  addMultisigInput(psbt: Psbt, input: MultisigInputOptions): void;

  /**
   * Collect partial signature
   */
  addPartialSignature(psbt: Psbt, signature: PartialSignature): void;

  /**
   * Validate multisig transaction
   */
  validateMultisigTransaction(psbt: Psbt): MultisigValidationResult;

  /**
   * Check if transaction is ready for finalization
   */
  canFinalize(psbt: Psbt): boolean;

  /**
   * Finalize multisig inputs
   */
  finalizeMultisigInputs(psbt: Psbt): void;

  /**
   * Get signature count for input
   */
  getSignatureCount(psbt: Psbt, inputIndex: number): number;

  /**
   * Get missing signatures for input
   */
  getMissingSignatures(psbt: Psbt, inputIndex: number): MultisigParticipant[];

  /**
   * Combine multiple PSBTs (for distributed signing)
   */
  combinePSBTs(...psbts: Psbt[]): Psbt;

  /**
   * Extract multisig information from PSBT input
   */
  extractMultisigInfo(psbt: Psbt, inputIndex: number): MultisigAddress | null;
}

/**
 * Multi-signature Key Manager Interface
 */
export interface IMultisigKeyManager {
  /**
   * Generate participant keys
   */
  generateParticipantKeys(
    count: number,
    derivationPath?: string,
  ): MultisigParticipant[];

  /**
   * Import participant from extended public key
   */
  importParticipant(
    id: string,
    xpub: string,
    derivationPath?: string,
  ): MultisigParticipant;

  /**
   * Derive keys for multisig at specific path
   */
  deriveMultisigKeys(
    participants: MultisigParticipant[],
    changePath: number,
    addressIndex: number,
  ): MultisigParticipant[];

  /**
   * Validate key order (BIP 67 lexicographical ordering)
   */
  validateKeyOrder(publicKeys: Buffer[]): boolean;

  /**
   * Sort keys according to BIP 67
   */
  sortKeys(publicKeys: Buffer[]): Buffer[];
}

/**
 * Multi-signature errors
 */
export class MultisigError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly inputIndex?: number,
  ) {
    super(message);
    this.name = 'MultisigError';
  }
}

export class InsufficientSignaturesError extends MultisigError {
  constructor(inputIndex: number, current: number, required: number) {
    super(
      `Insufficient signatures for input ${inputIndex}: ${current}/${required}`,
      'INSUFFICIENT_SIGNATURES',
      inputIndex,
    );
  }
}

export class DuplicateSignatureError extends MultisigError {
  constructor(inputIndex: number, participantId: string) {
    super(
      `Duplicate signature from participant ${participantId} for input ${inputIndex}`,
      'DUPLICATE_SIGNATURE',
      inputIndex,
    );
  }
}

export class InvalidSignatureError extends MultisigError {
  constructor(inputIndex: number, reason: string) {
    super(
      `Invalid signature for input ${inputIndex}: ${reason}`,
      'INVALID_SIGNATURE',
      inputIndex,
    );
  }
}

export class InvalidMultisigConfigError extends MultisigError {
  constructor(reason: string) {
    super(`Invalid multisig configuration: ${reason}`, 'INVALID_CONFIG');
  }
}
