/**
 * Counterparty API Detector
 *
 * Detects Counterparty tokens (SRC-20, Bitcoin Stamps, etc.) using the Counterparty API.
 * Provides fail-safe detection that returns false on any error.
 */

import type { UTXO } from '../interfaces/index.ts';
import type {
  IProtectionDetector,
  ProtectedAssetData,
} from '../interfaces/protection.interface.ts';
import { ProtectionAssetTypes } from '../interfaces/protection.interface.ts';

/**
 * Counterparty API response structure for get_balances
 */
interface CounterpartyBalance {
  address: string;
  asset: string;
  quantity: string;
  normalized_quantity?: string;
  escrow?: string;
  utxo?: string;
  utxo_address?: string;
  confirmed?: boolean;
}

/**
 * JSON-RPC 2.0 response wrapper
 */
interface JsonRpcResponse<T = any> {
  jsonrpc: '2.0';
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number | string;
}

/**
 * Configuration options for CounterpartyDetector
 */
export interface CounterpartyDetectorOptions {
  /** Base URL for Counterparty API (default: https://api.counterparty.io:4000) */
  apiUrl?: string;
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
}

/**
 * Counterparty API detector implementation
 *
 * Integrates with the Counterparty API to detect:
 * - SRC-20 tokens
 * - Bitcoin Stamps
 * - Other Counterparty assets
 *
 * Features:
 * - Fail-safe operation (never throws, returns false on errors)
 * - Configurable timeout and retry logic
 * - Exponential backoff for rate limiting
 * - JSON-RPC 2.0 protocol support
 */
export class CounterpartyDetector implements IProtectionDetector {
  private readonly apiUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(options: CounterpartyDetectorOptions = {}) {
    this.apiUrl = options.apiUrl || 'https://api.counterparty.io:4000';
    this.timeout = options.timeout || 5000;
    this.maxRetries = options.maxRetries || 3;
  }

  /**
   * Check if a UTXO contains protected Counterparty tokens
   */
  async isProtectedUtxo(utxo: UTXO): Promise<boolean> {
    try {
      // Skip if no address available
      if (!utxo.address) {
        console.warn(
          `No address available for UTXO ${utxo.txid}:${utxo.vout}, skipping Counterparty check`,
        );
        return false;
      }

      const balances = await this.getBalances(utxo.address);

      // Check if any balances exist
      if (balances && balances.length > 0) {
        // Filter out zero balances and check for meaningful amounts
        const nonZeroBalances = balances.filter((balance) => {
          const quantity = parseFloat(balance.quantity);
          return quantity > 0;
        });

        return nonZeroBalances.length > 0;
      }

      return false;
    } catch (error) {
      console.warn(
        `Failed to check Counterparty tokens for ${utxo.txid}:${utxo.vout}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false; // Fail-safe: return false on any error
    }
  }

  /**
   * Get detailed asset data for a protected UTXO
   */
  async getAssetData(utxo: UTXO): Promise<ProtectedAssetData | null> {
    try {
      // Skip if no address available
      if (!utxo.address) {
        console.warn(
          `No address available for UTXO ${utxo.txid}:${utxo.vout}, skipping Counterparty data retrieval`,
        );
        return null;
      }

      const balances = await this.getBalances(utxo.address);

      // Return data for first non-zero balance if available
      if (balances && balances.length > 0) {
        const nonZeroBalances = balances.filter((balance) => {
          const quantity = parseFloat(balance.quantity);
          return quantity > 0;
        });

        if (nonZeroBalances.length > 0) {
          const firstBalance = nonZeroBalances[0];

          if (!firstBalance) {
            return null;
          }

          const quantity = parseFloat(firstBalance.quantity);

          // Determine asset type based on asset name
          let assetType: ProtectedAssetData['type'] = ProtectionAssetTypes.COUNTERPARTY;
          if (firstBalance.asset.startsWith('STAMP')) {
            assetType = ProtectionAssetTypes.STAMP;
          } else if (firstBalance.asset.match(/^[A-Z]+$/)) {
            // Simple heuristic: all caps assets are likely SRC-20
            assetType = ProtectionAssetTypes.SRC20;
          }

          return {
            type: assetType,
            metadata: {
              asset: firstBalance.asset,
              quantity: firstBalance.quantity,
              normalized_quantity: firstBalance.normalized_quantity,
              address: firstBalance.address,
              escrow: firstBalance.escrow,
              utxo: firstBalance.utxo,
              utxo_address: firstBalance.utxo_address,
              confirmed: firstBalance.confirmed,
              all_balances: nonZeroBalances, // Include all balances for reference
            },
            value: quantity,
            identifier: firstBalance.asset,
            properties: {
              balanceCount: nonZeroBalances.length,
              isEscrow: !!firstBalance.escrow,
              isConfirmed: firstBalance.confirmed,
            },
          };
        }
      }

      return null;
    } catch (error) {
      console.warn(
        `Failed to get Counterparty asset data for ${utxo.txid}:${utxo.vout}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null; // Fail-safe: return null on any error
    }
  }

  /**
   * Get balances for an address using Counterparty API
   */
  private async getBalances(address: string): Promise<CounterpartyBalance[] | null> {
    const rpcRequest = {
      jsonrpc: '2.0',
      method: 'get_balances',
      params: {
        filters: { address: address },
        order_by: 'asset',
        order_dir: 'asc',
      },
      id: 1,
    };

    const response = await this.fetchWithRetry(rpcRequest);

    if (!response.ok) {
      if (response.status === 404) {
        // 404 means no balances found - this is expected and not an error
        return null;
      }
      // Other errors should be logged but not throw
      console.warn(`Counterparty API error ${response.status} for address ${address}`);
      return null;
    }

    const data: JsonRpcResponse<CounterpartyBalance[]> = await response.json();

    // Check for JSON-RPC error
    if (data.error) {
      console.warn(`Counterparty API JSON-RPC error for address ${address}: ${data.error.message}`);
      return null;
    }

    return data.result || null;
  }

  /**
   * Fetch with retry logic and exponential backoff
   */
  private async fetchWithRetry(
    rpcRequest: any,
    attempt: number = 1,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'tx-builder/0.1.0',
        },
        body: JSON.stringify(rpcRequest),
      });

      clearTimeout(timeoutId);

      // Retry on rate limiting (429) with exponential backoff
      if (response.status === 429 && attempt < this.maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.warn(
          `Counterparty API rate limited, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.fetchWithRetry(rpcRequest, attempt + 1);
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
            `Counterparty API network error, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries}): ${error.message}`,
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.fetchWithRetry(rpcRequest, attempt + 1);
        }
      }

      throw error;
    }
  }
}
