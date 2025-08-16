/**
 * Mock Ordinals Detector
 *
 * Mock implementation of OrdinalsDetector for testing and development.
 * Allows manual configuration of protected UTXOs and inscription data.
 */

import type { UTXO } from '../interfaces/provider.interface.ts';
import type { InscriptionData, OrdinalsDetector } from '../interfaces/ordinals.interface.ts';
import type { ProtectedAssetData } from '../interfaces/protection.interface.ts';

/**
 * Mock implementation of OrdinalsDetector for testing
 *
 * Allows pre-configuration of which UTXOs should be considered protected
 * and what inscription data they should return.
 */
export class MockOrdinalsDetector implements OrdinalsDetector {
  private protectedUtxos: Set<string>;
  private inscriptionData: Map<string, InscriptionData>;

  constructor(
    protectedUtxos: string[] = [],
    inscriptionData: Map<string, InscriptionData> = new Map(),
  ) {
    this.protectedUtxos = new Set(protectedUtxos);
    this.inscriptionData = inscriptionData;
  }

  /**
   * Check if a UTXO contains protected ordinals/inscriptions
   */
  isProtectedUtxo(utxo: UTXO): Promise<boolean> {
    const utxoId = `${utxo.txid}:${utxo.vout}`;
    return Promise.resolve(this.protectedUtxos.has(utxoId));
  }

  /**
   * Get inscription data for a UTXO if it contains an inscription
   */
  getInscriptionData(utxo: UTXO): Promise<InscriptionData | null> {
    const utxoId = `${utxo.txid}:${utxo.vout}`;
    return Promise.resolve(this.inscriptionData.get(utxoId) || null);
  }

  /**
   * Get asset data for a UTXO (combines protected status and inscription data)
   */
  getAssetData(utxo: UTXO): Promise<ProtectedAssetData | null> {
    const utxoId = `${utxo.txid}:${utxo.vout}`;
    const isProtected = this.protectedUtxos.has(utxoId);

    if (!isProtected) {
      return Promise.resolve(null);
    }

    const inscriptionData = this.inscriptionData.get(utxoId);

    return Promise.resolve({
      type: 'ordinal',
      metadata: inscriptionData || {
        id: utxoId,
        number: 0,
        contentType: 'unknown',
        contentLength: 0,
        genesisHeight: 0,
        genesisFee: 0,
        genesisTimestamp: 0,
        satOrdinal: '0',
        satRarity: 'common',
        satCoinbaseHeight: 0,
        owner: '',
        outputValue: utxo.value.toString(),
        metadata: {},
      },
      value: utxo.value,
      identifier: inscriptionData?.id || utxoId,
    });
  }

  /**
   * Add a protected UTXO with optional inscription data
   */
  addProtectedUtxo(utxoId: string, inscriptionData?: InscriptionData): void {
    this.protectedUtxos.add(utxoId);
    if (inscriptionData) {
      this.inscriptionData.set(utxoId, inscriptionData);
    }
  }

  /**
   * Remove a protected UTXO
   */
  removeProtectedUtxo(utxoId: string): void {
    this.protectedUtxos.delete(utxoId);
    this.inscriptionData.delete(utxoId);
  }

  /**
   * Clear all protected UTXOs and inscription data
   */
  clearProtectedUtxos(): void {
    this.protectedUtxos.clear();
    this.inscriptionData.clear();
  }

  /**
   * Get all protected UTXO IDs
   */
  getProtectedUtxoIds(): string[] {
    return Array.from(this.protectedUtxos);
  }

  /**
   * Get all inscription data
   */
  getAllInscriptionData(): Map<string, InscriptionData> {
    return new Map(this.inscriptionData);
  }

  /**
   * Set inscription data for a specific UTXO
   */
  setInscriptionData(utxoId: string, data: InscriptionData): void {
    this.inscriptionData.set(utxoId, data);
    // Also mark as protected if not already
    this.protectedUtxos.add(utxoId);
  }

  /**
   * Create a default inscription data object for testing
   */
  static createDefaultInscriptionData(overrides: Partial<InscriptionData> = {}): InscriptionData {
    return {
      id: 'mock_inscription_id',
      number: 1,
      contentType: 'text/plain',
      contentLength: 100,
      genesisHeight: 800000,
      genesisFee: 1000,
      genesisTimestamp: Date.now(),
      satOrdinal: '1234567890',
      satRarity: 'common',
      satCoinbaseHeight: 700000,
      owner: 'bc1qtest...',
      outputValue: '546',
      metadata: {},
      ...overrides,
    };
  }
}
