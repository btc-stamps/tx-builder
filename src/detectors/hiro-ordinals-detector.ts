/**
 * Hiro Ordinals API Detector
 *
 * Detects ordinals/inscriptions and runes using the Hiro Ordinals API.
 * Provides fail-safe detection that returns false on any error.
 */

import type { UTXO } from '../interfaces/index.ts';
import type {
  IProtectionDetector,
  ProtectedAssetData,
} from '../interfaces/protection.interface.ts';
import type { InscriptionData, OrdinalsDetector } from '../interfaces/ordinals.interface.ts';

/**
 * Hiro API response structure for ordinals endpoint
 */
interface HiroOrdinalsResponse {
  inscriptions?: Array<{
    id: string;
    number: number;
    content_type?: string;
    content_length?: number;
    genesis_height?: number;
    genesis_fee?: number;
    genesis_timestamp?: number;
    sat_ordinal?: string;
    sat_rarity?: string;
    sat_coinbase_height?: number;
    value?: string;
    address?: string;
    output_value?: string;
  }>;
  runes?: {
    [runeName: string]: {
      amount: string;
      divisibility: number;
      symbol?: string;
    };
  };
}

/**
 * Configuration options for HiroOrdinalsDetector
 */
export interface HiroOrdinalsDetectorOptions {
  /** Base URL for Hiro API (default: https://api.hiro.so) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
}

/**
 * Hiro Ordinals API detector implementation
 *
 * Integrates with the Hiro Ordinals API to detect:
 * - Bitcoin inscriptions (ordinals)
 * - Runes tokens
 *
 * Features:
 * - Fail-safe operation (never throws, returns false on errors)
 * - Configurable timeout and retry logic
 * - Exponential backoff for rate limiting
 */
export class HiroOrdinalsDetector implements IProtectionDetector, OrdinalsDetector {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(options: HiroOrdinalsDetectorOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://api.hiro.so';
    this.timeout = options.timeout || 5000;
    this.maxRetries = options.maxRetries || 3;
  }

  /**
   * Check if a UTXO contains protected inscriptions/ordinals
   */
  async isProtectedUtxo(utxo: UTXO): Promise<boolean> {
    try {
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/ordinals/v1/outputs/${utxo.txid}:${utxo.vout}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          // 404 means no ordinals found - this is expected and not an error
          return false;
        }
        // Other errors should be logged but not throw
        console.warn(`Hiro API error ${response.status} for ${utxo.txid}:${utxo.vout}`);
        return false;
      }

      const data: HiroOrdinalsResponse = await response.json();

      // Check for inscriptions
      if (data.inscriptions && data.inscriptions.length > 0) {
        return true;
      }

      // Check for runes
      if (data.runes && Object.keys(data.runes).length > 0) {
        return true;
      }

      return false;
    } catch (error) {
      console.warn(
        `Failed to check ordinals for ${utxo.txid}:${utxo.vout}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false; // Fail-safe: return false on any error
    }
  }

  /**
   * Get inscription data for a UTXO if it contains an inscription
   */
  async getInscriptionData(utxo: UTXO): Promise<InscriptionData | null> {
    try {
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/ordinals/v1/outputs/${utxo.txid}:${utxo.vout}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          // 404 means no ordinals found
          return null;
        }
        console.warn(`Hiro API error ${response.status} for ${utxo.txid}:${utxo.vout}`);
        return null;
      }

      const data: HiroOrdinalsResponse = await response.json();

      // Return first inscription if available
      if (data.inscriptions && data.inscriptions.length > 0) {
        const inscription = data.inscriptions[0];

        if (!inscription) {
          return null;
        }

        return {
          id: inscription.id,
          number: inscription.number,
          contentType: inscription.content_type,
          contentLength: inscription.content_length,
          genesisHeight: inscription.genesis_height,
          genesisFee: inscription.genesis_fee,
          genesisTimestamp: inscription.genesis_timestamp,
          satOrdinal: inscription.sat_ordinal,
          satRarity: inscription.sat_rarity,
          satCoinbaseHeight: inscription.sat_coinbase_height,
          owner: inscription.address,
          outputValue: inscription.output_value,
          metadata: {
            value: inscription.value,
          },
        };
      }

      return null;
    } catch (error) {
      console.warn(
        `Failed to get inscription data for ${utxo.txid}:${utxo.vout}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null; // Fail-safe: return null on any error
    }
  }

  /**
   * Get asset data for a UTXO - only returns ordinal/inscription types
   */
  async getAssetData(utxo: UTXO): Promise<ProtectedAssetData | null> {
    try {
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/ordinals/v1/outputs/${utxo.txid}:${utxo.vout}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          // 404 means no ordinals found
          return null;
        }
        console.warn(`Hiro API error ${response.status} for ${utxo.txid}:${utxo.vout}`);
        return null;
      }

      const data: HiroOrdinalsResponse = await response.json();

      // Return first inscription if available
      if (data.inscriptions && data.inscriptions.length > 0) {
        const inscription = data.inscriptions[0];

        if (!inscription) {
          return null;
        }

        return {
          type: 'inscription',
          metadata: {
            sat_ordinal: inscription.sat_ordinal,
            sat_rarity: inscription.sat_rarity,
            genesis_height: inscription.genesis_height,
            genesis_fee: inscription.genesis_fee,
            genesis_timestamp: inscription.genesis_timestamp,
            sat_coinbase_height: inscription.sat_coinbase_height,
            content_length: inscription.content_length,
            address: inscription.address,
            output_value: inscription.output_value,
          },
          value: inscription.value ? parseInt(inscription.value) : undefined,
          identifier: inscription.id,
          properties: {
            inscriptionNumber: inscription.number,
            contentType: inscription.content_type,
          },
        };
      }

      // Skip runes - this detector only handles ordinals/inscriptions
      // Runes are not ordinals or inscriptions

      return null;
    } catch (error) {
      console.warn(
        `Failed to get asset data for ${utxo.txid}:${utxo.vout}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null; // Fail-safe: return null on any error
    }
  }

  /**
   * Fetch with retry logic and exponential backoff
   */
  private async fetchWithRetry(
    url: string,
    attempt: number = 1,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'tx-builder/0.1.0',
        },
      });

      clearTimeout(timeoutId);

      // Retry on rate limiting (429) with exponential backoff
      if (response.status === 429 && attempt < this.maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.warn(
          `Hiro API rate limited, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.fetchWithRetry(url, attempt + 1);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // Retry on network errors (but not timeout/abort)
      if (attempt < this.maxRetries && error instanceof Error) {
        if (error.name === 'AbortError') {
          // Don't retry on timeout
          throw new Error(`Request timeout after ${this.timeout}ms`);
        }

        if (error.message.includes('fetch') || error.message.includes('network')) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.warn(
            `Hiro API network error, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries}): ${error.message}`,
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.fetchWithRetry(url, attempt + 1);
        }
      }

      throw error;
    }
  }
}
