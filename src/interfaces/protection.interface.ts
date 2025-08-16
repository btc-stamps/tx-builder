/**
 * Generic Protection Detection Interface
 * Provides a unified contract for detecting protected UTXOs across different asset types
 */

import type { UTXO } from './provider.interface.ts';

/**
 * Generic protection detection interface
 * Implementations should check for specific asset types (ordinals, stamps, etc.)
 */
export interface IProtectionDetector {
  /**
   * Check if a UTXO contains protected assets
   * @param utxo The UTXO to check
   * @returns Promise<boolean> True if the UTXO should be protected
   */
  isProtectedUtxo(utxo: UTXO): Promise<boolean>;

  /**
   * Get detailed asset data for a protected UTXO
   * @param utxo The UTXO to analyze
   * @returns Promise<ProtectedAssetData | null> Asset data if protected, null otherwise
   */
  getAssetData(utxo: UTXO): Promise<ProtectedAssetData | null>;
}

/**
 * Data structure for protected asset information
 */
export interface ProtectedAssetData {
  /** Type of protected asset */
  type: 'ordinal' | 'inscription' | 'stamp' | 'src20' | 'counterparty' | 'unknown';

  /** Asset-specific metadata */
  metadata?: any;

  /** Estimated value of the asset (in satoshis) */
  value?: number;

  /** Human-readable identifier for the asset */
  identifier?: string;

  /** Additional properties specific to the asset type */
  properties?: Record<string, any>;
}

/**
 * Configuration options for protection detectors
 */
export interface ProtectionDetectorConfig {
  /** Enable/disable protection detection */
  enabled: boolean;

  /** Timeout for detection operations (ms) */
  timeout?: number;

  /** Whether to cache detection results */
  enableCache?: boolean;

  /** Cache TTL in seconds */
  cacheTtl?: number;

  /** Asset-specific configuration */
  assetConfig?: {
    ordinals?: boolean;
    stamps?: boolean;
    src20?: boolean;
    counterparty?: boolean;
  };
}

/**
 * Type guard to check if data is ProtectedAssetData
 */
export function isProtectedAssetData(data: any): data is ProtectedAssetData {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.type === 'string' &&
    ['ordinal', 'inscription', 'stamp', 'src20', 'counterparty', 'unknown'].includes(data.type)
  );
}

/**
 * Type guard to check if an object implements IProtectionDetector
 */
export function isProtectionDetector(obj: any): obj is IProtectionDetector {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.isProtectedUtxo === 'function' &&
    typeof obj.getAssetData === 'function'
  );
}

/**
 * Helper function to create default protection detector config
 */
export function createDefaultProtectionConfig(): ProtectionDetectorConfig {
  return {
    enabled: true,
    timeout: 5000,
    enableCache: true,
    cacheTtl: 300, // 5 minutes
    assetConfig: {
      ordinals: true,
      stamps: true,
      src20: true,
      counterparty: true,
    },
  };
}

/**
 * Asset type utility functions
 */
export const ProtectionAssetTypes = {
  ORDINAL: 'ordinal' as const,
  INSCRIPTION: 'inscription' as const,
  STAMP: 'stamp' as const,
  SRC20: 'src20' as const,
  COUNTERPARTY: 'counterparty' as const,
  UNKNOWN: 'unknown' as const,
} as const;

export type ProtectionAssetType = typeof ProtectionAssetTypes[keyof typeof ProtectionAssetTypes];

/**
 * Helper function to validate asset type
 */
export function isValidAssetType(type: string): type is ProtectionAssetType {
  return Object.values(ProtectionAssetTypes).includes(type as ProtectionAssetType);
}
