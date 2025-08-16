/**
 * Internal Optimization Type Definitions
 *
 * Types for script optimization and pattern analysis
 * These are internal implementation details
 */

import { Buffer } from 'node:buffer';

/**
 * Optimized script result
 */
export interface OptimizedScript {
  /** Original script */
  originalScript: Buffer;
  /** Optimized script */
  optimizedScript: Buffer;
  /** Size reduction in bytes */
  sizeReduction: number;
  /** Optimization techniques applied */
  techniquesApplied: string[];
  /** Whether optimization was successful */
  success: boolean;
  /** Optimization duration in ms */
  duration?: number;
}

/**
 * Pattern analysis result
 */
export interface PatternAnalysis {
  /** Patterns found in the data */
  patterns: DataPattern[];
  /** Compression ratio achievable */
  compressionRatio: number;
  /** Recommended optimization strategy */
  recommendedStrategy: OptimizationStrategy;
  /** Entropy score */
  entropy: number;
  /** Repetition score */
  repetitionScore: number;
}

/**
 * Data pattern found during analysis
 */
export interface DataPattern {
  /** Pattern type */
  type: 'repetition' | 'sequence' | 'constant' | 'custom';
  /** Start offset in data */
  offset: number;
  /** Pattern length */
  length: number;
  /** Number of occurrences */
  occurrences: number;
  /** Pattern data */
  data?: Buffer;
  /** Pattern description */
  description?: string;
}

/**
 * Optimization strategy
 */
export interface OptimizationStrategy {
  /** Strategy name */
  name: string;
  /** Strategy description */
  description: string;
  /** Expected size reduction percentage */
  expectedReduction: number;
  /** Complexity level (1-10) */
  complexity: number;
  /** Whether this strategy is recommended */
  recommended: boolean;
  /** Alternative strategies */
  alternatives?: string[];
}

/**
 * Algorithm result (used internally by selectors)
 */
export interface AlgorithmResult {
  /** Algorithm name */
  algorithm: string;
  /** Selected UTXOs */
  selectedUtxos: any[]; // UTXO[] when available
  /** Total input value */
  totalValue: number;
  /** Change amount */
  change: number;
  /** Fee amount */
  fee: number;
  /** Waste metric */
  waste?: number;
  /** Execution time in ms */
  executionTime?: number;
  /** Whether selection was successful */
  success: boolean;
  /** Reason for failure if not successful */
  failureReason?: string;
}
