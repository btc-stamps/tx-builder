/**
 * Bitcoin Transaction Builder
 * Main entry point for the package
 */

// Core exports - specific exports to avoid conflicts
export { TransactionBuilder } from './core/transaction-builder.ts';
export { PSBTBuilder } from './core/psbt-builder.ts';
export { EnhancedPSBTBuilder } from './core/enhanced-psbt-builder.ts';
export { ScriptBuilder } from './core/script-builder.ts';
export { FeeEstimator } from './core/fee-estimator.ts';

// Provider exports - specific exports to avoid conflicts
export { BaseProvider } from './providers/base-provider.ts';
export { ElectrumXProvider } from './providers/electrumx-provider.ts';
export { ElectrumXFeeEstimator, type FeeEstimate } from './providers/electrumx-fee-estimator.ts';
export type { Balance, IUTXOProvider, Transaction, UTXO } from './interfaces/provider.interface.ts';
export type { ElectrumXConfig } from './config/electrumx-config.ts';

// Selector exports - specific exports to avoid conflicts
export { KnapsackSelector } from './selectors/knapsack-selector.ts';
export { BranchAndBoundSelector } from './selectors/branch-and-bound.ts';
export { AccumulativeSelector } from './selectors/accumulative.ts';
export { BlackjackSelector } from './selectors/blackjack.ts';
export { WasteOptimizedSelector } from './selectors/waste-optimized.ts';
export {
  MockProtectionDetector,
  ProtectionAwareSelector,
} from './selectors/protection-aware-selector.ts';
export {
  OrdinalsAwareSelector,
  type OrdinalsAwareSelectorOptions,
} from './selectors/ordinals-aware-selector.ts';
export { SelectorFactory } from './selectors/index.ts';
export type {
  IUTXOSelector,
  SelectionOptions,
  SelectionResult,
} from './interfaces/selector.interface.ts';

// Detector exports - ordinals/inscriptions detection
export {
  CounterpartyDetector,
  HiroOrdinalsDetector,
  MockOrdinalsDetector,
  MultiAssetProtectionDetector,
  OrdinalsMultiProviderDetector,
  OrdServerDetector,
} from './detectors/index.ts';
export type {
  AggregationStrategy,
  CounterpartyDetectorOptions,
  DetectionStrategy,
  HiroOrdinalsDetectorOptions,
  MultiAssetProtectionDetectorOptions,
  OrdinalsMultiProviderDetectorOptions,
  OrdServerDetectorOptions,
} from './detectors/index.ts';
export type {
  IProtectionDetector,
  ProtectedAssetData,
  ProtectionDetectorConfig,
} from './interfaces/protection.interface.ts';

// Ordinals interface exports
export type { InscriptionData, OrdinalsDetector } from './interfaces/ordinals.interface.ts';

// Encoder exports - specific exports to avoid conflicts
export { CounterpartyIssuanceBuilder } from './encoders/counterparty-encoder.ts';
export { SRC20Encoder, SRC20Helper } from './encoders/src20-encoder.ts';
export { BitcoinStampsEncoder } from './encoders/bitcoin-stamps-encoder.ts';
export { P2WSHEncoder } from './encoders/p2wsh-encoder.ts';
export type { EncodingResult, IDataEncoder } from './interfaces/encoder.interface.ts';
export type { SRC20Data, SRC20Operation } from './interfaces/src20.interface.ts';
export type { BitcoinStampData } from './encoders/bitcoin-stamps-encoder.ts';
export type { BitcoinStampEncodingOptions } from './encoders/bitcoin-stamps-encoder.ts';

// Builder exports - High-level transaction builders
export { BitcoinStampBuilder, SRC20TokenBuilder } from './builders/index.ts';
export type {
  BitcoinStampBuildData,
  BitcoinStampBuilderConfig,
  BitcoinStampIssuanceData,
} from './builders/index.ts';

// Utility exports
export { createDustCalculator } from './utils/dust-calculator.ts';
export { createSrc20FeeCalculator } from './utils/src20-fee-calculator.ts';
// ElectrumX fee estimation is provided through ElectrumXFeeEstimator class
export { DataProcessor } from './utils/data-processor.ts';
// Legacy export for backward compatibility
export { DataProcessor as ImageProcessor } from './utils/data-processor.ts';
export { SRC20CompressionService } from './utils/src20-compression.ts';

// Service exports - Asset validation and management
export { AssetValidationService } from './services/asset-validation-service.ts';
export type {
  AssetValidationConfig,
  AssetValidationResult,
} from './services/asset-validation-service.ts';

// Advanced Fee Calculator exports - NEW OPTIMIZATION FEATURES
export {
  AdvancedFeeCalculator,
  createAdvancedFeeCalculator,
} from './calculators/advanced-fee-calculator.ts';
export type {
  CompressionAnalysis,
  FeeBreakdown,
  FeePrediction,
  Operation,
  Optimization,
  StampData,
} from './calculators/advanced-fee-calculator.ts';

// Template system removed - use encoders directly for production
// - BitcoinStampsEncoder for stamp transactions
// - SRC20Encoder for SRC-20 transactions
// - TransactionBuilder for PSBT construction

// Script Optimizer Engine exports - NEW OPTIMIZATION FEATURES
export { ScriptOptimizerEngine } from './optimizers/index.ts';
export type {
  ChunkingStrategy,
  CompressedScript,
  DataPattern,
  DeduplicatedChunk,
  DeduplicationResult,
  ExecutionStep,
  MinimizedScript,
  OptimizedChunk,
  OptimizedPath,
  OptimizedScript,
  PathOptimization,
  PatternAnalysis,
  ScriptMinimization,
  ScriptVerification,
} from './optimizers/index.ts';
export type { StampData as OptimizerStampData } from './optimizers/index.ts';

// Validator exports - SIMPLIFIED VALIDATION
export { createStampValidationEngine, StampValidationEngine } from './validators/index.ts';
export type {
  StampValidationConfig,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from './validators/index.ts';

// Error exports
export * from './errors/index.ts';

// Main builder class for convenience
import { networks } from 'bitcoinjs-lib';
import type { Network } from 'bitcoinjs-lib';

import { TransactionBuilder } from './core/transaction-builder.ts';

/**
 * Create a new transaction builder instance
 */
export function createTransactionBuilder(network: Network = networks.bitcoin): TransactionBuilder {
  return new TransactionBuilder({
    network,
    dustThreshold: 546,
    defaultFeeRate: 10,
    defaultRbf: true,
  });
}

// Re-export bitcoinjs-lib types for convenience
export type { Network, Psbt, Transaction as BTCTransaction } from 'bitcoinjs-lib';
export { crypto, networks, opcodes, script } from 'bitcoinjs-lib';
