/**
 * Mock ElectrumX Fee Rate Provider
 * Provides mock fee rates for testing and development
 * NOTE: This is a mock implementation - use ElectrumXFeeEstimator for production
 */

import type { FeeRate } from '../interfaces/fee.interface.ts';
import process from 'node:process';
import { getElectrumXEndpoints } from '../config/electrumx-config.ts';
import { clearTimeoutCompat, setTimeoutCompat, type TimerId } from '../utils/timer-utils.ts';

export interface ElectrumXConfig {
  servers: Array<{
    host: string;
    port: number;
    ssl?: boolean;
    timeout?: number;
  }>;
  fallbackFeeRate?: number;
  cacheTimeout?: number; // seconds
  maxRetries?: number;
}

export interface ElectrumXFeeResponse {
  1: number; // Next block
  3: number; // 3 blocks
  6: number; // 6 blocks
  12: number; // 12 blocks
  25: number; // 25 blocks
}

/**
 * Mock ElectrumX fee estimation provider for testing and development
 */
export class MockElectrumXFeeProvider {
  private config: Required<ElectrumXConfig>;
  private cache: Map<string, { data: FeeRate; timestamp: number }> = new Map();

  constructor(config: ElectrumXConfig) {
    this.config = {
      servers: config.servers,
      fallbackFeeRate: config.fallbackFeeRate ?? 10,
      cacheTimeout: config.cacheTimeout ?? 60, // 1 minute
      maxRetries: config.maxRetries ?? 3,
    };
  }

  /**
   * Get fee rates from ElectrumX servers
   */
  getFeeRates(): Promise<FeeRate> {
    const cacheKey = 'electrumx_fees';
    const cached = this.cache.get(cacheKey);

    // Return cached data if still valid
    if (cached && this.isCacheValid(cached.timestamp)) {
      return Promise.resolve(cached.data);
    }

    return this.fetchFeeRatesFromServers()
      .then((feeData) => {
        const feeRates = this.processFeeResponse(feeData);

        // Cache the result
        this.cache.set(cacheKey, {
          data: feeRates,
          timestamp: Date.now(),
        });

        return feeRates;
      })
      .catch((error) => {
        console.warn('ElectrumX fee estimation failed, using fallback:', error);
        return this.getFallbackFeeRates();
      });
  }

  /**
   * Fetch fee rates from multiple ElectrumX servers
   */
  private fetchFeeRatesFromServers(): Promise<ElectrumXFeeResponse> {
    const errors: string[] = [];

    return new Promise((resolve, reject) => {
      for (const server of this.config.servers) {
        try {
          const response = this.queryElectrumXServer(server);
          response.then((feeResponse) => {
            if (this.isValidFeeResponse(feeResponse)) {
              resolve(feeResponse);
            }
          }).catch((error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(`${server.host}:${server.port} - ${errorMessage}`);
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`${server.host}:${server.port} - ${errorMessage}`);
        }
      }

      // If no valid response is found after trying all servers
      setTimeout(() => {
        reject(new Error(`All ElectrumX servers failed: ${errors.join(', ')}`));
      }, 5000);
    });
  }

  /**
   * Query a single ElectrumX server for fee estimation
   */
  private queryElectrumXServer(server: {
    host: string;
    port: number;
    ssl?: boolean;
    timeout?: number;
  }): Promise<ElectrumXFeeResponse> {
    const _protocol = server.ssl ? 'wss' : 'ws';
    console.debug(`Attempting connection using protocol: ${_protocol}`); // Use the unused variable
    const timeout = server.timeout ?? 5000;

    return new Promise((resolve, reject) => {
      let ws: WebSocket | undefined;
      let timeoutId: TimerId | undefined;

      const cleanup = () => {
        if (timeoutId) clearTimeoutCompat(timeoutId);
        if (ws) {
          // WebSocket doesn't have removeAllListeners, use proper cleanup
          if (
            ws.readyState === WebSocket.OPEN ||
            ws.readyState === WebSocket.CONNECTING
          ) {
            ws.close();
          }
        }
      };

      try {
        // In a real implementation, you'd use a proper WebSocket or TCP connection
        // For now, simulate the ElectrumX response structure

        timeoutId = setTimeoutCompat(() => {
          cleanup();
          reject(
            new Error(`Timeout connecting to ${server.host}:${server.port}`),
          );
        }, timeout);

        // Mock ElectrumX blockchain.estimatefee response
        // In real implementation: ws = new WebSocket(`${protocol}://${server.host}:${server.port}`);

        // Simulate network delay
        setTimeout(
          () => {
            cleanup();

            // Mock response based on typical ElectrumX fee estimates
            const mockResponse: ElectrumXFeeResponse = {
              1: this.generateRealisticFeeRate('urgent'),
              3: this.generateRealisticFeeRate('high'),
              6: this.generateRealisticFeeRate('medium'),
              12: this.generateRealisticFeeRate('low'),
              25: this.generateRealisticFeeRate('economy'),
            };

            resolve(mockResponse);
          },
          100 + Math.random() * 200,
        ); // 100-300ms delay
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  /**
   * Generate realistic fee rates (mock implementation)
   * In production, this would be actual ElectrumX responses
   */
  private generateRealisticFeeRate(priority: string): number {
    // Base on current network conditions (mock)
    const baseRates = {
      economy: 2,
      low: 5,
      medium: 15,
      high: 30,
      urgent: 50,
    };

    const baseRate = baseRates[priority as keyof typeof baseRates] || 10;

    // Add some randomness to simulate real network conditions
    const variance = baseRate * 0.2; // ±20% variance
    const adjustment = (Math.random() - 0.5) * 2 * variance;

    return Math.max(1, Math.round(baseRate + adjustment));
  }

  /**
   * Process ElectrumX fee response into standard format
   */
  private processFeeResponse(response: ElectrumXFeeResponse): FeeRate {
    return {
      urgent: response[1] || 50, // Next block
      high: response[3] || 30, // 3 blocks
      medium: response[6] || 15, // 6 blocks
      low: response[25] || 5, // 25 blocks
    };
  }

  /**
   * Validate ElectrumX fee response
   */
  private isValidFeeResponse(response: any): response is ElectrumXFeeResponse {
    return (
      response &&
      typeof response === 'object' &&
      typeof response[1] === 'number' &&
      typeof response[3] === 'number' &&
      typeof response[6] === 'number' &&
      response[1] > 0 &&
      response[3] > 0 &&
      response[6] > 0
    );
  }

  /**
   * Get fallback fee rates when ElectrumX is unavailable
   */
  private getFallbackFeeRates(): FeeRate {
    const base = this.config.fallbackFeeRate;

    return {
      low: Math.max(1, Math.round(base * 0.5)),
      medium: base,
      high: Math.round(base * 2),
      urgent: Math.round(base * 3),
    };
  }

  /**
   * Check if cached data is still valid
   */
  private isCacheValid(timestamp: number): boolean {
    const age = (Date.now() - timestamp) / 1000; // Age in seconds
    return age < this.config.cacheTimeout;
  }

  /**
   * Mock transaction getter for testing
   */
  getTransaction(txid: string): Promise<
    {
      txid: string;
      size: number;
      vsize: number;
      fee?: number;
    } | null
  > {
    // Return a mock transaction for testing
    if (txid === 'not-found') {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      txid,
      size: 250,
      vsize: 180,
      fee: 2000, // 2000 sats
    });
  }

  /**
   * Clear cached fee data
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get current cache stats
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ key: string; age: number }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, value]) => ({
      key,
      age: (Date.now() - value.timestamp) / 1000,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Update server configuration
   */
  updateConfig(newConfig: Partial<ElectrumXConfig>): void {
    this.config = { ...this.config, ...newConfig };
    // Clear cache when config changes
    this.clearCache();
  }

  /**
   * Test connection to all configured servers
   */
  async testConnections(): Promise<
    Array<
      { server: string; success: boolean; latency?: number; error?: string }
    >
  > {
    const results = [];

    for (const server of this.config.servers) {
      const startTime = Date.now();
      try {
        await this.queryElectrumXServer(server);
        const latency = Date.now() - startTime;
        results.push({
          server: `${server.host}:${server.port}`,
          success: true,
          latency,
        });
      } catch (error) {
        results.push({
          server: `${server.host}:${server.port}`,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }
}

/**
 * Create mock ElectrumX fee provider with configuration from environment variables
 */
export function createMockElectrumXFeeProvider(
  customServers?: ElectrumXConfig['servers'],
  network: string = 'mainnet',
): MockElectrumXFeeProvider {
  let servers: ElectrumXConfig['servers'];

  if (customServers) {
    servers = customServers;
  } else {
    // Get servers from centralized configuration
    const endpoints = getElectrumXEndpoints(network);
    servers = endpoints.map((endpoint) => ({
      host: endpoint.host,
      port: endpoint.port,
      ssl: endpoint.protocol === 'ssl' || endpoint.protocol === 'wss',
      timeout: endpoint.timeout,
    }));
  }

  return new MockElectrumXFeeProvider({
    servers,
    fallbackFeeRate: parseInt(process.env.ELECTRUMX_FALLBACK_FEE_RATE || '10'),
    cacheTimeout: parseInt(process.env.ELECTRUMX_FEE_CACHE_TIMEOUT || '60'),
    maxRetries: parseInt(process.env.ELECTRUMX_MAX_RETRIES || '3'),
  });
}
