/**
 * Core Types Export
 *
 * Central export point for all core domain types
 */

// UTXO types
export type {
  IndexedUTXOData,
  UTXO,
  UTXOCacheEntry,
  UTXOChunk,
  UTXOSelectionCriteria,
  WitnessUTXO,
} from './utxo.interface';

// Transaction types
export type {
  AddressHistory,
  Balance,
  Transaction,
  TransactionInput,
  TransactionOutput,
  TransactionValidation,
} from './transaction.interface';

// Re-export network types from existing interface
export type { ChainParams, NetworkConfig, NetworkType } from '../network.interface';

// Re-export hardware wallet types from existing interface
export type {
  DerivationPath,
  IHardwareWallet,
  SigningError,
  SignPsbtOptions,
  SignPsbtResult,
} from '../hardware.interface';
