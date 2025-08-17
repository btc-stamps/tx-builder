/**
 * RBF and CPFP Interface
 * Replace-By-Fee and Child-Pays-For-Parent transaction support
 */

import type { Network, Psbt, Transaction } from 'bitcoinjs-lib';

import type { UTXO } from './provider.interface.ts';

export interface RBFConfig {
  /** Original transaction to replace */
  originalTxid: string;
  /** Minimum fee rate increase (sat/vB) */
  minFeeRateIncrease: number;
  /** Maximum fee rate cap (sat/vB) */
  maxFeeRate?: number;
  /** Target fee rate for replacement */
  targetFeeRate?: number;
  /** Whether to replace all inputs (true) or just increase fee (false) */
  replaceAllInputs?: boolean;
  /** Additional UTXOs to use if needed */
  additionalUtxos?: UTXO[];
  /** Change address for fee adjustments */
  changeAddress?: string;
  /** Original transaction fee rate (sat/vB) - used when original UTXOs are not available */
  originalFeeRate?: number;
}

export interface CPFPConfig {
  /** Parent transaction(s) to accelerate */
  parentTxids: string[];
  /** Parent transaction fee rates (sat/vB) */
  parentFeeRates: number[];
  /** Target effective fee rate for the package */
  targetPackageFeeRate: number;
  /** UTXOs from parent transactions to spend */
  parentOutputs: Array<{
    txid: string;
    vout: number;
    value: number;
    scriptPubKey: string;
  }>;
  /** Destination for CPFP transaction */
  destination: string;
  /** Minimum output value */
  minOutputValue?: number;
}

export interface RBFTransaction {
  /** Replacement PSBT */
  psbt: Psbt;
  /** Original transaction that's being replaced */
  originalTxid: string;
  /** Original transaction fee */
  originalFee: number;
  /** New transaction fee */
  newFee: number;
  /** Fee increase amount */
  feeIncrease: number;
  /** Original fee rate */
  originalFeeRate: number;
  /** New fee rate */
  newFeeRate: number;
  /** Whether additional inputs were needed */
  addedInputs: boolean;
  /** UTXOs that were added (if any) */
  addedUtxos: UTXO[];
  /** Validation status */
  valid: boolean;
  /** Validation messages */
  messages: string[];
}

export interface CPFPTransaction {
  /** Child PSBT that pays for parent */
  psbt: Psbt;
  /** Parent transaction IDs being accelerated */
  parentTxids: string[];
  /** Combined package size (parent + child) */
  packageSize: number;
  /** Combined package fee */
  packageFee: number;
  /** Effective package fee rate */
  packageFeeRate: number;
  /** Individual child transaction fee */
  childFee: number;
  /** Child transaction size */
  childSize: number;
  /** Child transaction fee rate */
  childFeeRate: number;
  /** Validation status */
  valid: boolean;
  /** Validation messages */
  messages: string[];
}

export interface TransactionReplacement {
  /** Type of replacement */
  type: 'rbf' | 'cpfp';
  /** Original transaction info */
  original: {
    txid: string;
    fee: number;
    size: number;
    feeRate: number;
  };
  /** Replacement transaction info */
  replacement: {
    psbt: Psbt;
    fee: number;
    estimatedSize: number;
    feeRate: number;
  };
  /** Financial impact */
  cost: {
    additionalFee: number;
    totalFee: number;
    feeIncrease: number;
  };
  /** Validation result */
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

export interface UTXOLock {
  /** Transaction ID and output index */
  outpoint: string; // "txid:vout"
  /** Lock expiry timestamp */
  expiresAt: number;
  /** Lock purpose */
  purpose: 'rbf' | 'cpfp' | 'pending';
  /** Lock identifier */
  lockId: string;
}

export interface PackageInfo {
  /** Transaction IDs in the package */
  txids: string[];
  /** Total package size */
  totalSize: number;
  /** Total package fee */
  totalFee: number;
  /** Effective fee rate */
  effectiveFeeRate: number;
  /** Individual transaction details */
  transactions: Array<{
    txid: string;
    size: number;
    fee: number;
    feeRate: number;
    inputs: string[]; // outpoints
    outputs: Array<{ value: number; address?: string }>;
  }>;
  /** Package dependency graph */
  dependencies: Map<string, string[]>; // txid -> parent txids
}

/**
 * RBF Transaction Builder Interface
 */
export interface IRBFBuilder {
  /**
   * Create RBF replacement transaction
   */
  createReplacement(
    originalTx: Transaction,
    config: RBFConfig,
    availableUtxos: UTXO[],
  ): Promise<RBFTransaction>;

  /**
   * Calculate minimum fee for RBF
   */
  calculateMinimumRBFFee(originalTx: Transaction, newSize?: number): number;

  /**
   * Validate RBF transaction
   */
  validateRBF(
    originalTx: Transaction,
    replacementPsbt: Psbt,
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };

  /**
   * Check if transaction signals RBF
   */
  signalsRBF(tx: Transaction | Psbt): boolean;

  /**
   * Enable RBF signaling in PSBT
   */
  enableRBF(psbt: Psbt): void;
}

/**
 * CPFP Transaction Builder Interface
 */
export interface ICPFPBuilder {
  /**
   * Create CPFP child transaction
   */
  createChild(
    parentTxs: Transaction[],
    config: CPFPConfig,
    network: Network,
  ): Promise<CPFPTransaction>;

  /**
   * Calculate required child fee for target package rate
   */
  calculateRequiredChildFee(
    parentTxs: Transaction[],
    targetPackageFeeRate: number,
    childSize: number,
  ): number;

  /**
   * Validate CPFP package
   */
  validatePackage(
    parentTxs: Transaction[],
    childPsbt: Psbt,
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    packageInfo: PackageInfo;
  };

  /**
   * Optimize CPFP fee allocation
   */
  optimizeFeeAllocation(
    parentTxs: Transaction[],
    availableValue: number,
    targetFeeRate: number,
  ): {
    recommendedChildFee: number;
    optimalOutputValue: number;
    effectivePackageRate: number;
  };
}

/**
 * UTXO Lock Manager Interface
 */
export interface IUTXOLockManager {
  /**
   * Lock UTXO for exclusive use
   */
  lockUTXO(
    outpoint: string,
    purpose: 'rbf' | 'cpfp' | 'pending',
    durationMs?: number,
  ): Promise<string>; // Returns lock ID

  /**
   * Unlock UTXO
   */
  unlockUTXO(lockId: string): Promise<boolean>;

  /**
   * Check if UTXO is locked
   */
  isLocked(outpoint: string): Promise<boolean>;

  /**
   * Get locked UTXOs
   */
  getLockedUTXOs(): Promise<UTXOLock[]>;

  /**
   * Clear expired locks
   */
  clearExpiredLocks(): Promise<number>; // Returns count of cleared locks

  /**
   * Lock multiple UTXOs atomically
   */
  lockMultiple(
    outpoints: string[],
    purpose: 'rbf' | 'cpfp' | 'pending',
    durationMs?: number,
  ): Promise<string[]>; // Returns lock IDs
}

/**
 * Transaction Package Manager Interface
 */
export interface IPackageManager {
  /**
   * Analyze transaction package
   */
  analyzePackage(txids: string[]): Promise<PackageInfo>;

  /**
   * Detect circular dependencies
   */
  detectCircularDependencies(txids: string[]): string[];

  /**
   * Calculate package fee rate
   */
  calculatePackageFeeRate(
    transactions: Array<{ size: number; fee: number }>,
  ): number;

  /**
   * Optimize transaction ordering
   */
  optimizeTransactionOrder(
    transactions: Array<{ txid: string; dependencies: string[] }>,
  ): string[];

  /**
   * Validate package topology
   */
  validatePackageTopology(packageInfo: PackageInfo): {
    valid: boolean;
    errors: string[];
    maxDepth: number;
  };
}

/**
 * Fee Bump Strategy Interface
 */
export interface IFeeBumpStrategy {
  /**
   * Recommend fee bump strategy
   */
  recommendStrategy(
    originalTx: Transaction,
    targetFeeRate: number,
    availableUtxos: UTXO[],
  ): {
    strategy: 'rbf' | 'cpfp' | 'both' | 'impossible';
    rbfOption?: {
      feasible: boolean;
      estimatedCost: number;
      additionalInputsNeeded: number;
    };
    cpfpOption?: {
      feasible: boolean;
      estimatedCost: number;
      requiredValue: number;
    };
    recommendation: string;
  };

  /**
   * Calculate cost-effectiveness
   */
  calculateCostEffectiveness(
    strategies: Array<
      { type: 'rbf' | 'cpfp'; cost: number; timeEstimate: number }
    >,
  ): {
    mostCostEffective: 'rbf' | 'cpfp';
    savings: number;
    tradeoffs: string[];
  };
}

/**
 * RBF and CPFP errors
 */
export class RBFError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalTxid?: string,
  ) {
    super(message);
    this.name = 'RBFError';
  }
}

export class InsufficientFeeBumpError extends RBFError {
  constructor(
    originalTxid: string,
    requiredIncrease: number,
    actualIncrease: number,
  ) {
    super(
      `Insufficient fee bump for ${originalTxid}: required ${requiredIncrease} sat/vB, got ${actualIncrease} sat/vB`,
      'INSUFFICIENT_FEE_BUMP',
      originalTxid,
    );
  }
}

export class CPFPError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly parentTxids?: string[],
  ) {
    super(message);
    this.name = 'CPFPError';
  }
}

export class InsufficientValueError extends CPFPError {
  constructor(parentTxids: string[], required: number, available: number) {
    super(
      `Insufficient value for CPFP: required ${required} sat, available ${available} sat`,
      'INSUFFICIENT_VALUE',
      parentTxids,
    );
  }
}

export class UTXOLockError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly outpoint?: string,
  ) {
    super(message);
    this.name = 'UTXOLockError';
  }
}

export class CircularDependencyError extends Error {
  constructor(
    message: string,
    public readonly dependencyChain: string[],
  ) {
    super(message);
    this.name = 'CircularDependencyError';
  }
}
