/**
 * Core interfaces for dependency injection and abstraction
 */

// Core domain types - export first to establish base types
export * from './core/index.ts';
// Explicitly export core types to avoid ambiguity
export {
  type AddressHistory,
  type Balance,
  type Transaction,
  type TransactionOutput,
  type UTXO,
} from './core/index.ts';
// UTXO type exported once from core

// Encoder types - organized in subfolder
export * from './encoders/index.ts';

// Builder types - organized in subfolder
export * from './builders/index.ts';

// Validation types - organized to avoid name collisions
export * from './validation/base.interface.ts';
// Explicitly export validation errors to avoid ambiguity
export { type ValidationError, type ValidationWarning } from './validation/base.interface.ts';

// Provider and selector interfaces
export * from './provider.interface.ts';
export * from './selector.interface.ts';

// Add missing types required by type checking
export { type SelectionOptions, type SelectionResult } from './selector.interface.ts';

// Legacy encoder interface - being phased out in favor of encoders/ folder
// Keep for backward compatibility but prefer new organized types
export type { TransactionOutput as ScriptTransactionOutput } from './encoder.interface.ts';
export type {
  CounterpartyData,
  CounterpartyEncodingOptions,
  EncodingOptions,
  EncodingResult,
  IDataEncoder,
  P2WSHData,
  P2WSHEncodingOptions,
  StampData,
} from './encoder.interface.ts';

export type { TransactionOutput as BuilderTransactionOutput } from './transaction.interface.ts';
export type {
  BuildOptions,
  ITransactionBuilder,
  SignOptions,
  TransactionBuilderConfig,
  TransactionInput,
} from './transaction.interface.ts';
export * from './fee.interface.ts';
export * from './network.interface.ts';
export { type ChainParams, type NetworkType } from './network.interface.ts';
// Explicitly re-export error classes to avoid duplicate symbol conflicts
export {
  DuplicateSignatureError,
  InsufficientSignaturesError as MultisigInsufficientSignaturesError,
  InvalidMultisigConfigError,
  InvalidSignatureError,
  MultisigError,
} from './multisig.interface.ts';
export type {
  IMultisigBuilder,
  IMultisigKeyManager,
  MultisigAddress,
  MultisigConfig,
  MultisigInputOptions,
  MultisigParticipant,
  MultisigScriptType,
  MultisigSigningRequest,
  MultisigSigningResult,
  MultisigValidationResult,
  PartialSignature,
  SigHashType,
} from './multisig.interface.ts';
export * from './rbf-cpfp.interface.ts';
export * from './psbt-validation.interface.ts';
// Hardware wallet interfaces
export * from './hardware.interface.ts';
export type {
  DerivationPath,
  IHardwareWallet,
  SigningError,
  SignPsbtOptions,
  SignPsbtResult,
} from './hardware.interface.ts';
// Prevent duplicate type names by explicit re-exports if needed
// Note: Re-export SRC20Data only from src20.interface to avoid conflicts
export type { SRC20Data } from './src20.interface.ts';
export type {
  BaseSRC20Data,
  SRC20BuilderOptions,
  SRC20DeployData,
  SRC20EncodingOptions,
  SRC20EncodingResult,
  SRC20MintData,
  SRC20Operation,
  SRC20Options,
  SRC20TransferData,
} from './src20.interface.ts';
export { createSRC20Options, DEFAULT_SRC20_OPTIONS } from './src20.interface.ts';

// Protection detection interfaces
export * from './protection.interface.ts';
export type {
  IProtectionDetector,
  ProtectedAssetData,
  ProtectionAssetType,
  ProtectionDetectorConfig,
} from './protection.interface.ts';
export {
  createDefaultProtectionConfig,
  isProtectedAssetData,
  isProtectionDetector,
  isValidAssetType,
  ProtectionAssetTypes,
} from './protection.interface.ts';
