/**
 * Ordinals Detection Interface
 *
 * Specific interface for detecting Bitcoin ordinals and inscriptions.
 * This is a specialized subset of the general IProtectionDetector interface.
 */

import type { UTXO } from './provider.interface.ts';
import type { ProtectedAssetData } from './protection.interface.ts';

/**
 * Inscription data structure for ordinals detection
 */
export interface InscriptionData {
  /** Unique inscription identifier */
  id: string;
  /** Inscription number */
  number: number;
  /** Content type (mime type) */
  contentType?: string;
  /** Content size in bytes */
  contentLength?: number;
  /** Genesis block height */
  genesisHeight?: number;
  /** Genesis transaction fee */
  genesisFee?: number;
  /** Genesis timestamp */
  genesisTimestamp?: number;
  /** Ordinal satoshi number */
  satOrdinal?: string;
  /** Satoshi rarity */
  satRarity?: string;
  /** Coinbase height for the satoshi */
  satCoinbaseHeight?: number;
  /** Current owner address */
  owner?: string;
  /** Output value */
  outputValue?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Ordinals-specific detector interface
 *
 * This interface is specifically for detecting Bitcoin ordinals and inscriptions.
 * It provides methods optimized for ordinals detection workflows.
 */
export interface OrdinalsDetector {
  /**
   * Check if a UTXO contains protected ordinals/inscriptions
   * @param utxo The UTXO to check
   * @returns Promise<boolean> True if the UTXO contains ordinals/inscriptions
   */
  isProtectedUtxo(utxo: UTXO): Promise<boolean>;

  /**
   * Get inscription data for a UTXO if it contains an inscription
   * @param utxo The UTXO to analyze
   * @returns Promise<InscriptionData | null> Inscription data if found, null otherwise
   */
  getInscriptionData(utxo: UTXO): Promise<InscriptionData | null>;

  /**
   * Get asset data for a UTXO - only returns ordinal/inscription types
   * @param utxo The UTXO to analyze
   * @returns Promise<ProtectedAssetData | null> Asset data if found, null otherwise
   */
  getAssetData(utxo: UTXO): Promise<ProtectedAssetData | null>;
}

/**
 * Type guard to check if an object implements OrdinalsDetector
 */
export function isOrdinalsDetector(obj: any): obj is OrdinalsDetector {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.isProtectedUtxo === 'function' &&
    typeof obj.getInscriptionData === 'function' &&
    typeof obj.getAssetData === 'function'
  );
}

/**
 * Helper function to validate inscription data
 */
export function isValidInscriptionData(data: any): data is InscriptionData {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.id === 'string' &&
    typeof data.number === 'number'
  );
}
