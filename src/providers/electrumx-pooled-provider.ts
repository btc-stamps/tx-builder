/**
 * ElectrumX Pooled Provider
 * High-level provider that uses connection pooling for better performance and reliability
 */

import type { Network } from 'bitcoinjs-lib';

import type {
  AddressHistory,
  AddressHistoryOptions,
  Balance,
  ProviderOptions,
  Transaction,
  UTXO,
} from '../interfaces/provider.interface.ts';
import { getElectrumXEndpoints } from '../config/electrumx-config.ts';

import { BaseProvider } from './base-provider.ts';
import {
  type ConnectionPoolOptions,
  ElectrumXConnectionPool,
  type ElectrumXServer,
} from './electrumx-connection-pool.ts';

export interface ElectrumXPooledOptions extends ProviderOptions {
  servers?: ElectrumXServer[];
  poolOptions?: Partial<ConnectionPoolOptions>;
}

/**
 * ElectrumX Provider with built-in connection pooling and advanced features
 */
export class ElectrumXPooledProvider extends BaseProvider {
  private pool: ElectrumXConnectionPool;

  constructor(options: ElectrumXPooledOptions) {
    super(options);

    // Create connection pool
    this.pool = new ElectrumXConnectionPool({
      network: this.network,
      servers: options.servers || this.getServersFromConfig(),
      connectionTimeout: this.timeout,
      retries: this.retries,
      retryDelay: this.retryDelay,
      maxRetryDelay: this.maxRetryDelay,
      ...options.poolOptions,
    });
  }

  /**
   * Get UTXOs for a given address
   */
  getUTXOs(address: string): Promise<UTXO[]> {
    if (!this.isValidAddress(address)) {
      throw new Error(`Invalid address: ${address}`);
    }

    return this.pool.getUTXOs(address);
  }

  /**
   * Get balance for a given address
   */
  getBalance(address: string): Promise<Balance> {
    if (!this.isValidAddress(address)) {
      throw new Error(`Invalid address: ${address}`);
    }

    return this.pool.getBalance(address);
  }

  /**
   * Get transaction by ID
   */
  getTransaction(txid: string): Promise<Transaction> {
    if (!this.isValidTxid(txid)) {
      throw new Error(`Invalid transaction ID: ${txid}`);
    }

    return this.pool.getTransaction(txid);
  }

  /**
   * Broadcast a signed transaction
   */
  broadcastTransaction(hexTx: string): Promise<string> {
    if (!hexTx || typeof hexTx !== 'string' || hexTx.length < 20) {
      throw new Error('Invalid transaction hex');
    }

    return this.pool.broadcastTransaction(hexTx);
  }

  /**
   * Get current fee rate (sat/vB)
   */
  getFeeRate(priority: 'low' | 'medium' | 'high' = 'medium'): Promise<number> {
    return Promise.resolve(this.pool.getFeeRate(priority));
  }

  /**
   * Get current block height
   */
  getBlockHeight(): Promise<number> {
    return Promise.resolve(this.pool.getBlockHeight());
  }

  /**
   * Get address transaction history
   */
  getAddressHistory(
    address: string,
    options?: AddressHistoryOptions,
  ): Promise<AddressHistory[]> {
    if (!this.isValidAddress(address)) {
      throw new Error(`Invalid address: ${address}`);
    }

    return this.pool.getAddressHistory(address, options);
  }

  /**
   * Check if provider is connected (checks if any server is healthy)
   */
  isConnected(): Promise<boolean> {
    const stats = this.pool.getStats();
    return Promise.resolve(stats.servers.some((server) => server.healthy));
  }

  /**
   * Get ElectrumX servers from centralized configuration
   */
  private getServersFromConfig(): ElectrumXServer[] {
    // Get network name for configuration lookup
    const networkName = this.getNetworkName();

    // Get endpoints from centralized config
    const endpoints = getElectrumXEndpoints(networkName);

    // Convert ElectrumXEndpoint to ElectrumXServer format
    return endpoints.map((endpoint, index) => ({
      host: endpoint.host,
      port: endpoint.port,
      protocol: this.mapProtocol(endpoint.protocol),
      weight: this.calculateWeight(endpoint.priority || (index + 1)),
      region: this.guessRegion(endpoint.host),
    }));
  }

  /**
   * Get network name from Network object
   */
  private getNetworkName(): string {
    if (this.network && typeof this.network === 'object') {
      // Check bech32 prefix to determine network
      if ('bech32' in this.network) {
        switch (this.network.bech32) {
          case 'bc':
            return 'mainnet';
          case 'tb':
            return 'testnet';
          case 'bcrt':
            return 'regtest';
        }
      }
    }

    // Default to mainnet if unable to determine
    return 'mainnet';
  }

  /**
   * Map ElectrumX protocol to connection pool protocol
   */
  private mapProtocol(
    protocol: 'tcp' | 'ssl' | 'ws' | 'wss',
  ): 'tcp' | 'ssl' | 'ws' | 'wss' {
    // For now, they map directly, but this allows for future protocol handling
    return protocol;
  }

  /**
   * Calculate weight from priority (lower priority = higher weight)
   */
  private calculateWeight(priority: number): number {
    // Convert priority (1, 2, 3...) to weight (3, 2, 1...)
    return Math.max(1, 4 - priority);
  }

  /**
   * Guess region from hostname (best effort)
   */
  private guessRegion(host: string): string {
    const hostname = host.toLowerCase();

    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      return 'local';
    }

    // European indicators
    if (
      hostname.includes('.de') || hostname.includes('.eu') ||
      hostname.includes('europe') ||
      hostname.includes('aranguren') || hostname.includes('emzy')
    ) {
      return 'eu';
    }

    // US indicators
    if (
      hostname.includes('.us') || hostname.includes('qtornado') ||
      hostname.includes('fortress')
    ) {
      return 'us';
    }

    // Asia indicators
    if (
      hostname.includes('.jp') || hostname.includes('.cn') ||
      hostname.includes('.sg') ||
      hostname.includes('asia')
    ) {
      return 'asia';
    }

    // Default to global for well-known global services
    return 'global';
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats() {
    return this.pool.getStats();
  }

  /**
   * Get detailed health information
   */
  getHealthInfo(): {
    healthy: boolean;
    healthyServers: number;
    totalServers: number;
    totalConnections: number;
    averageSuccessRate: number;
    servers: Array<{
      server: string;
      healthy: boolean;
      successRate: number;
      averageResponseTime: number;
      activeConnections: number;
    }>;
  } {
    const stats = this.pool.getStats();
    const healthyServers = stats.servers.filter((s) => s.healthy);

    const averageSuccessRate = stats.servers.length > 0
      ? stats.servers.reduce((sum, s) => sum + s.successRate, 0) /
        stats.servers.length
      : 0;

    return {
      healthy: healthyServers.length > 0,
      healthyServers: healthyServers.length,
      totalServers: stats.servers.length,
      totalConnections: stats.totalConnections,
      averageSuccessRate,
      servers: stats.servers.map((s) => ({
        server: s.server,
        healthy: s.healthy,
        successRate: s.successRate,
        averageResponseTime: s.averageResponseTime,
        activeConnections: s.activeConnections,
      })),
    };
  }

  /**
   * Test connection to all configured servers
   */
  async testAllConnections(): Promise<
    Array<{
      server: string;
      success: boolean;
      latency?: number;
      error?: string;
    }>
  > {
    const stats = this.pool.getStats();
    const results = [];

    for (const server of stats.servers) {
      const startTime = Date.now();
      try {
        // Test with a simple block height request
        await this.pool.getBlockHeight();
        const latency = Date.now() - startTime;

        results.push({
          server: server.server,
          success: true,
          latency,
        });
      } catch (error) {
        results.push({
          server: server.server,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Get servers by region
   */
  getServersByRegion(): Record<string, ElectrumXServer[]> {
    const serversList = this.getServersFromConfig();
    const regions: Record<string, ElectrumXServer[]> = {};

    for (const server of serversList) {
      const region = server.region || 'unknown';
      if (!regions[region]) {
        regions[region] = [];
      }
      regions[region].push(server);
    }

    return regions;
  }

  /**
   * Update server configuration
   */
  updateServers(servers: ElectrumXServer[]): void {
    // This would require extending the pool to support dynamic server updates
    console.warn(
      `Dynamic server updates not yet implemented for ${servers.length} servers. Restart provider to use new servers.`,
    );
  }

  /**
   * Gracefully shutdown the provider
   */
  async shutdown(): Promise<void> {
    await this.pool.shutdown();
  }
}

/**
 * Create ElectrumX pooled provider with sensible defaults
 */
export function createElectrumXPooledProvider(
  network: Network,
  options?: Partial<ElectrumXPooledOptions>,
): ElectrumXPooledProvider {
  return new ElectrumXPooledProvider({
    network,
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
    maxRetryDelay: 10000,
    ...options,
  });
}

/**
 * Create ElectrumX pooled provider with custom server configuration
 */
export function createElectrumXPooledProviderWithServers(
  network: Network,
  servers: ElectrumXServer[],
  options?: Partial<ElectrumXPooledOptions>,
): ElectrumXPooledProvider {
  return new ElectrumXPooledProvider({
    network,
    servers,
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
    maxRetryDelay: 10000,
    ...options,
  });
}

/**
 * Create ElectrumX pooled provider optimized for specific use cases
 */
export class ElectrumXPooledProviderBuilder {
  private options: Partial<ElectrumXPooledOptions> = {};

  constructor(private network: Network) {}

  /**
   * Set timeout values
   */
  withTimeouts(
    timeout: number,
    retries: number = 3,
    retryDelay: number = 1000,
  ): this {
    this.options.timeout = timeout;
    this.options.retries = retries;
    this.options.retryDelay = retryDelay;
    return this;
  }

  /**
   * Configure for high-throughput applications
   */
  forHighThroughput(): this {
    this.options.poolOptions = {
      ...this.options.poolOptions,
      maxConnectionsPerServer: 5,
      loadBalanceStrategy: 'least-connections',
      healthCheckInterval: 15000, // 15 seconds
    };
    return this;
  }

  /**
   * Configure for low-latency applications
   */
  forLowLatency(): this {
    this.options.poolOptions = {
      ...this.options.poolOptions,
      maxConnectionsPerServer: 2,
      loadBalanceStrategy: 'health-based',
      healthCheckInterval: 10000, // 10 seconds
      connectionTimeout: 5000,
    };
    return this;
  }

  /**
   * Configure for high reliability
   */
  forHighReliability(): this {
    this.options.poolOptions = {
      ...this.options.poolOptions,
      failoverThreshold: 2, // Lower threshold
      recoveryTimeout: 30000, // Faster recovery
      healthCheckInterval: 10000,
    };
    this.options.retries = 5;
    return this;
  }

  /**
   * Add custom servers
   */
  withServers(servers: ElectrumXServer[]): this {
    this.options.servers = servers;
    return this;
  }

  /**
   * Filter servers by region from configured endpoints
   */
  withRegion(region: 'us' | 'eu' | 'asia' | 'global' | 'local'): this {
    // Get all configured servers
    const networkName = this.getNetworkName();
    const endpoints = getElectrumXEndpoints(networkName);

    // Convert to servers and filter by region
    const allServers = endpoints.map((endpoint, index) => ({
      host: endpoint.host,
      port: endpoint.port,
      protocol: endpoint.protocol as 'tcp' | 'ssl' | 'ws' | 'wss',
      weight: Math.max(1, 4 - (endpoint.priority || (index + 1))),
      region: this.guessRegionForBuilder(endpoint.host),
    }));

    // Filter by requested region
    const regionalServers = allServers.filter((server) => server.region === region);

    if (regionalServers.length === 0) {
      console.warn(
        `No servers found for region '${region}'. Using all available servers.`,
      );
      this.options.servers = allServers;
    } else {
      this.options.servers = regionalServers;
    }

    return this;
  }

  /**
   * Guess region from hostname for builder (helper method)
   */
  private guessRegionForBuilder(host: string): string {
    const hostname = host.toLowerCase();

    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      return 'local';
    }

    // European indicators
    if (
      hostname.includes('.de') || hostname.includes('.eu') ||
      hostname.includes('europe') ||
      hostname.includes('aranguren') || hostname.includes('emzy')
    ) {
      return 'eu';
    }

    // US indicators
    if (
      hostname.includes('.us') || hostname.includes('qtornado') ||
      hostname.includes('fortress')
    ) {
      return 'us';
    }

    // Asia indicators
    if (
      hostname.includes('.jp') || hostname.includes('.cn') ||
      hostname.includes('.sg') ||
      hostname.includes('asia')
    ) {
      return 'asia';
    }

    return 'global';
  }

  /**
   * Get network name for builder
   */
  private getNetworkName(): string {
    if (this.network && typeof this.network === 'object') {
      if ('bech32' in this.network) {
        switch (this.network.bech32) {
          case 'bc':
            return 'mainnet';
          case 'tb':
            return 'testnet';
          case 'bcrt':
            return 'regtest';
        }
      }
    }
    return 'mainnet';
  }

  /**
   * Build the provider
   */
  build(): ElectrumXPooledProvider {
    return new ElectrumXPooledProvider({
      network: this.network,
      timeout: 30000,
      retries: 3,
      retryDelay: 1000,
      maxRetryDelay: 10000,
      ...this.options,
    });
  }
}
