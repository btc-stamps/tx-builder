/**
 * Enhanced UTXO Selection Result Interface
 * Provides structured responses for both success and failure cases
 */

import type { UTXO } from './provider.interface.ts';

/**
 * Reasons why selection might fail
 */
export enum SelectionFailureReason {
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  NO_UTXOS_AVAILABLE = 'NO_UTXOS_AVAILABLE',
  NO_UTXOS = 'NO_UTXOS',
  EXCEEDS_MAX_INPUTS = 'EXCEEDS_MAX_INPUTS',
  DUST_THRESHOLD_NOT_MET = 'DUST_THRESHOLD_NOT_MET',
  DUST_OUTPUT = 'DUST_OUTPUT',
  NO_SOLUTION_FOUND = 'NO_SOLUTION_FOUND',
  INVALID_OPTIONS = 'INVALID_OPTIONS',
  TIMEOUT = 'TIMEOUT',
  PROTECTED_UTXOS = 'PROTECTED_UTXOS',
  SELECTION_FAILED = 'SELECTION_FAILED',
  FEE_TOO_HIGH = 'FEE_TOO_HIGH',
  MAX_INPUTS_EXCEEDED = 'MAX_INPUTS_EXCEEDED',
  MIN_CONFIRMATIONS_NOT_MET = 'MIN_CONFIRMATIONS_NOT_MET',
  OPTIMIZATION_FAILED = 'OPTIMIZATION_FAILED',
}

/**
 * Successful selection result
 */
export interface SelectionSuccess {
  success: true;
  inputs: UTXO[];
  totalValue: number;
  change: number;
  fee: number;
  wasteMetric?: number;
  // Additional metrics
  inputCount: number;
  outputCount: number;
  estimatedVSize: number;
  effectiveFeeRate: number;
}

/**
 * Failed selection result with debugging information
 */
export interface SelectionFailure {
  success: false;
  reason: SelectionFailureReason;
  message: string;
  details?: {
    availableBalance?: number;
    requiredAmount?: number;
    utxoCount?: number;
    maxInputsAllowed?: number;
    dustThreshold?: number;
    attemptedStrategies?: string[];
    minConfirmations?: number;
    targetValue?: number;
    feeRate?: number;
    maxInputs?: number;
    spendableCount?: number;
    protectedCount?: number;
    protectedBalance?: number;
  };
}

/**
 * Enhanced selection result that always provides structured feedback
 */
export type EnhancedSelectionResult = SelectionSuccess | SelectionFailure;

/**
 * Helper function to create a success result
 */
export function createSelectionSuccess(
  inputs: UTXO[],
  totalValue: number,
  change: number,
  fee: number,
  options?: {
    wasteMetric?: number;
    outputCount?: number;
    estimatedVSize?: number;
  },
): SelectionSuccess {
  const inputCount = inputs.length;
  const outputCount = options?.outputCount || 2; // typical: recipient + change
  const estimatedVSize = options?.estimatedVSize ||
    (inputCount * 148 + outputCount * 34 + 10);

  return {
    success: true,
    inputs,
    totalValue,
    change,
    fee,
    wasteMetric: options?.wasteMetric,
    inputCount,
    outputCount,
    estimatedVSize,
    effectiveFeeRate: fee / estimatedVSize,
  };
}

/**
 * Helper function to create a failure result
 */
export function createSelectionFailure(
  reason: SelectionFailureReason,
  message: string,
  details?: SelectionFailure['details'],
): SelectionFailure {
  return {
    success: false,
    reason,
    message,
    details,
  };
}

/**
 * Check if a result is successful
 */
export function isSelectionSuccess(
  result: EnhancedSelectionResult,
): result is SelectionSuccess {
  return result.success === true;
}

/**
 * Check if a result is a failure
 */
export function isSelectionFailure(
  result: EnhancedSelectionResult,
): result is SelectionFailure {
  return result.success === false;
}
