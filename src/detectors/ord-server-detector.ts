/**
 * Ord Server Detector
 *
 * Detects ordinals/inscriptions using the Ord Server API (ordinals.com).
 * Provides fail-safe detection that returns false on any error.
 */

import type { UTXO } from '../interfaces/index.ts';
import type {
  IProtectionDetector,
  ProtectedAssetData,
} from '../interfaces/protection.interface.ts';
import type { InscriptionData, OrdinalsDetector } from '../interfaces/ordinals.interface.ts';

/**
 * Ord Server API response structure for output endpoint
 */
interface OrdServerResponse {
  inscriptions?: Array<{
    id: string;
    number?: number;
    sat?: number;
    timestamp?: number;
    address?: string;
    output_value?: number;
    content_type?: string;
    content_length?: number;
    preview?: string;
    title?: string;
  }>;
  // Ord server may include other fields but inscriptions is primary
}

/**
 * Configuration options for OrdServerDetector
 */
export interface OrdServerDetectorOptions {
  /** Base URL for Ord Server API (default: https://ordinals.com) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
}

/**
 * Ord Server API detector implementation
 *
 * Integrates with the Ord Server API (ordinals.com) to detect:
 * - Bitcoin inscriptions (ordinals)
 *
 * Features:
 * - Fail-safe operation (never throws, returns false on errors)
 * - Configurable timeout and retry logic
 * - Exponential backoff for rate limiting
 */
export class OrdServerDetector implements IProtectionDetector, OrdinalsDetector {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(options: OrdServerDetectorOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://ordinals.com';
    this.timeout = options.timeout || 5000;
    this.maxRetries = options.maxRetries || 3;
  }

  /**
   * Check if a UTXO contains protected inscriptions/ordinals
   */
  async isProtectedUtxo(utxo: UTXO): Promise<boolean> {
    try {
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/output/${utxo.txid}:${utxo.vout}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          // 404 means no ordinals found - this is expected and not an error
          return false;
        }
        // Other errors should be logged but not throw
        console.warn(`Ord Server API error ${response.status} for ${utxo.txid}:${utxo.vout}`);
        return false;
      }

      const data: OrdServerResponse = await response.json();

      // Check for inscriptions
      if (data.inscriptions && data.inscriptions.length > 0) {
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
        `${this.baseUrl}/output/${utxo.txid}:${utxo.vout}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          // 404 means no ordinals found
          return null;
        }
        console.warn(`Ord Server API error ${response.status} for ${utxo.txid}:${utxo.vout}`);
        return null;
      }

      const data: OrdServerResponse = await response.json();

      // Return first inscription if available
      if (data.inscriptions && data.inscriptions.length > 0) {
        const inscription = data.inscriptions[0];

        if (!inscription) {
          return null;
        }

        return {
          id: inscription.id,
          number: inscription.number || 0,
          contentType: inscription.content_type,
          contentLength: inscription.content_length,
          genesisTimestamp: inscription.timestamp,
          owner: inscription.address,
          outputValue: inscription.output_value?.toString(),
          metadata: {
            sat: inscription.sat,
            preview: inscription.preview,
            title: inscription.title,
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
        `${this.baseUrl}/output/${utxo.txid}:${utxo.vout}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          // 404 means no ordinals found
          return null;
        }
        console.warn(`Ord Server API error ${response.status} for ${utxo.txid}:${utxo.vout}`);
        return null;
      }

      const data: OrdServerResponse = await response.json();

      // Return first inscription if available
      if (data.inscriptions && data.inscriptions.length > 0) {
        const inscription = data.inscriptions[0];

        if (!inscription) {
          return null;
        }

        return {
          type: 'inscription',
          metadata: {
            sat: inscription.sat,
            timestamp: inscription.timestamp,
            address: inscription.address,
            content_length: inscription.content_length,
            preview: inscription.preview,
            title: inscription.title,
          },
          value: inscription.output_value,
          identifier: inscription.id,
          properties: {
            inscriptionNumber: inscription.number,
            contentType: inscription.content_type,
          },
        };
      }

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
          `Ord Server API rate limited, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`,
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
            `Ord Server API network error, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries}): ${error.message}`,
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.fetchWithRetry(url, attempt + 1);
        }
      }

      throw error;
    }
  }
}
