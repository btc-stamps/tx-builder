/**
 * ElectrumX Connection Pool Manager
 * Manages multiple ElectrumX connections with load balancing and failover
 */

import type { Network } from 'bitcoinjs-lib';
import {
  clearIntervalCompat as _clearIntervalCompat,
  clearTimeoutCompat,
  setIntervalCompat as _setIntervalCompat,
  setTimeoutCompat as _setTimeoutCompat,
  type TimerId as _TimerId,
} from '../utils/timer-utils.ts';

import type {
  AddressHistory,
  AddressHistoryOptions,
  Balance,
  ElectrumXOptions as _ElectrumXOptions,
  Transaction,
  UTXO,
} from '../interfaces/provider.interface.ts';
import { getElectrumXEndpoints } from '../config/electrumx-config.ts';
import { ServerPerformanceMonitor } from '../monitoring/server-metrics.ts';

import { ElectrumXProvider } from './electrumx-provider.ts';
import process from 'node:process';

export interface ElectrumXServer {
  host: string;
  port: number;
  protocol?: 'tcp' | 'ssl' | 'ws' | 'wss';
  weight?: number; // Load balancing weight (higher = more requests)
  region?: string; // Optional region identifier
  timeout?: number;
}

export interface ConnectionPoolOptions {
  network: Network;
  servers: ElectrumXServer[];
  maxConnectionsPerServer?: number;
  minConnectionsPerServer?: number;
  healthCheckInterval?: number;
  heartbeatInterval?: number;
  connectionTimeout?: number;
  requestTimeout?: number;
  retries?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
  backoffMultiplier?: number;
  loadBalanceStrategy?:
    | 'round-robin'
    | 'weighted'
    | 'least-connections'
    | 'health-based';
  failoverThreshold?: number; // Failed requests before marking unhealthy
  circuitBreakerThreshold?: number; // Failures before circuit opens
  circuitBreakerTimeout?: number; // Time before attempting to close circuit
  recoveryTimeout?: number; // Time before retrying failed servers
  maxPoolSize?: number; // Maximum total connections across all servers
  enableDynamicScaling?: boolean; // Enable automatic pool size adjustment
}

enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

interface ServerHealth {
  healthy: boolean;
  consecutiveFailures: number;
  lastFailTime: number;
  lastSuccessTime: number;
  lastHeartbeatTime: number;
  totalRequests: number;
  successfulRequests: number;
  averageResponseTime: number;
  activeConnections: number;
  healthScore: number; // 0-100 composite health score
  circuitBreakerState: CircuitBreakerState;
  circuitBreakerOpenTime?: number;
  lastCircuitBreakerResetTime?: number;
}

interface ActiveConnection {
  provider: ElectrumXProvider;
  inUse: boolean;
  createdAt: number;
  lastUsed: number;
  requestCount: number;
  lastHeartbeat: number;
  consecutiveFailures: number;
  healthy: boolean;
  responseTimeHistory: number[]; // Track last 10 response times
}

/**
 * ElectrumX Connection Pool with advanced load balancing and health monitoring
 */
export class ElectrumXConnectionPool {
  private options: Required<ConnectionPoolOptions>;
  private connections: Map<string, ActiveConnection[]> = new Map<string, ActiveConnection[]>();
  private serverHealth: Map<string, ServerHealth> = new Map<string, ServerHealth>();
  private performanceMonitor: ServerPerformanceMonitor = new ServerPerformanceMonitor();
  private currentServerIndex: number = 0;
  private healthCheckTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private connectionWaiters = new Map<
    string,
    Array<
      {
        resolve: (conn: ActiveConnection) => void;
        reject: (error: Error) => void;
        timeout: number;
      }
    >
  >();
  private totalConnectionCount: number = 0;

  constructor(options: ConnectionPoolOptions) {
    this.options = {
      maxConnectionsPerServer: parseInt(process.env.ELECTRUMX_POOL_SIZE || '3'),
      minConnectionsPerServer: 1,
      healthCheckInterval: parseInt(
        process.env.ELECTRUMX_HEALTH_CHECK_INTERVAL || '30000',
      ),
      heartbeatInterval: 15000, // 15 seconds
      connectionTimeout: parseInt(
        process.env.ELECTRUMX_CONNECTION_TIMEOUT || '10000',
      ),
      requestTimeout: 30000,
      retries: parseInt(process.env.ELECTRUMX_MAX_RETRIES || '3'),
      retryDelay: 1000,
      maxRetryDelay: 10000,
      backoffMultiplier: 2,
      loadBalanceStrategy: 'health-based',
      failoverThreshold: 3,
      circuitBreakerThreshold: parseInt(
        process.env.ELECTRUMX_CIRCUIT_BREAKER_THRESHOLD || '5',
      ),
      circuitBreakerTimeout: 30000, // 30 seconds
      recoveryTimeout: 60000, // 1 minute
      maxPoolSize: 50,
      enableDynamicScaling: true,
      ...options,
    };

    // Initialize performance monitoring for all servers
    for (const server of this.options.servers) {
      const serverKey = this.getServerKey(server);
      this.performanceMonitor.initializeServer(serverKey);
    }

    this.initializeServerHealth();
    this.startHealthChecking();
    this.startHeartbeat();
  }

  /**
   * Get UTXOs using the best available connection
   */
  async getUTXOs(address: string): Promise<UTXO[]> {
    return await this.executeWithLoadBalancing(
      'getUTXOs',
      async (provider) => await provider.getUTXOs(address),
    );
  }

  /**
   * Get balance using the best available connection
   */
  async getBalance(address: string): Promise<Balance> {
    return await this.executeWithLoadBalancing(
      'getBalance',
      async (provider) => await provider.getBalance(address),
    );
  }

  /**
   * Get transaction using the best available connection
   */
  async getTransaction(txid: string): Promise<Transaction> {
    return await this.executeWithLoadBalancing(
      'getTransaction',
      async (provider) => await provider.getTransaction(txid),
    );
  }

  /**
   * Broadcast transaction using the best available connection
   */
  async broadcastTransaction(hexTx: string): Promise<string> {
    return await this.executeWithLoadBalancing(
      'broadcastTransaction',
      async (provider) => await provider.broadcastTransaction(hexTx),
    );
  }

  /**
   * Get fee rate using the best available connection
   */
  async getFeeRate(priority?: 'low' | 'medium' | 'high'): Promise<number> {
    return await this.executeWithLoadBalancing(
      'getFeeRate',
      async (provider) => await provider.getFeeRate(priority),
    );
  }

  /**
   * Get block height using the best available connection
   */
  async getBlockHeight(): Promise<number> {
    return await this.executeWithLoadBalancing(
      'getBlockHeight',
      async (provider) => await provider.getBlockHeight(),
    );
  }

  /**
   * Get address transaction history using the best available connection
   */
  async getAddressHistory(
    address: string,
    options?: AddressHistoryOptions,
  ): Promise<AddressHistory[]> {
    return await this.executeWithLoadBalancing(
      'getAddressHistory',
      async (provider) => await provider.getAddressHistory(address, options),
    );
  }

  /**
   * Execute operation with load balancing, circuit breaker, and exponential backoff
   */
  private async executeWithLoadBalancing<T>(
    operationName: string,
    operation: (provider: ElectrumXProvider) => Promise<T>,
  ): Promise<T> {
    const availableServers = this.getAvailableServers();

    if (availableServers.length === 0) {
      throw new Error(
        'No available ElectrumX servers (all unhealthy or circuit breaker open)',
      );
    }

    let lastError: Error | null = null;
    let attempts = 0;
    const maxAttempts = Math.min(
      availableServers.length * 2,
      this.options.retries * 2,
    );

    while (attempts < maxAttempts) {
      const server = this.selectServer(availableServers);
      const serverKey = this.getServerKey(server);
      let connection: ActiveConnection | null = null;

      try {
        // Check circuit breaker before attempting operation
        if (!this.isServerAvailable(serverKey)) {
          attempts++;
          continue;
        }

        connection = await this.getOrCreateConnection(server);
        const startTime = Date.now();

        // Execute operation with timeout
        const result = await Promise.race([
          operation(connection.provider),
          this.createTimeoutPromise(
            this.options.requestTimeout,
            `${operationName} timeout`,
          ),
        ]) as T;

        // Update success metrics
        const responseTime = Date.now() - startTime;
        this.updateConnectionSuccess(connection, responseTime);
        this.updateServerHealth(serverKey, true, responseTime);

        // Record performance metrics
        this.performanceMonitor.recordSuccess(serverKey, responseTime);

        this.releaseConnection(serverKey, connection);

        return result;
      } catch (error) {
        attempts++;
        lastError = error as Error;

        // Update failure metrics
        if (connection) {
          this.updateConnectionFailure(connection);
          this.releaseConnection(serverKey, connection);
        }
        this.updateServerHealth(serverKey, false);

        // Record performance metrics
        this.performanceMonitor.recordFailure(serverKey, lastError?.message);

        // Apply exponential backoff before retry
        if (attempts < maxAttempts) {
          const delay = Math.min(
            this.options.retryDelay *
              Math.pow(this.options.backoffMultiplier, attempts - 1),
            this.options.maxRetryDelay,
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError ||
      new Error(`All ElectrumX servers failed for operation: ${operationName}`);
  }

  /**
   * Create a timeout promise
   */
  private createTimeoutPromise<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Get or create a connection to the specified server with improved queueing
   */
  private async getOrCreateConnection(
    server: ElectrumXServer,
  ): Promise<ActiveConnection> {
    const serverKey = this.getServerKey(server);
    const connections = this.connections.get(serverKey) || [];

    // Find available healthy connection
    const availableConnection = connections.find((conn) => !conn.inUse && conn.healthy);
    if (availableConnection) {
      availableConnection.inUse = true;
      availableConnection.lastUsed = Date.now();
      availableConnection.requestCount++;
      return Promise.resolve(availableConnection);
    }

    // Create new connection if under limits
    if (
      connections.length < this.options.maxConnectionsPerServer &&
      this.totalConnectionCount < this.options.maxPoolSize
    ) {
      try {
        const connection = await this.createNewConnection(server, serverKey);
        connections.push(connection);
        this.connections.set(serverKey, connections);
        this.totalConnectionCount++;

        // Update health metrics
        const health = this.serverHealth.get(serverKey)!;
        health.activeConnections = connections.length;

        return connection;
      } catch (error) {
        // If connection creation fails, try to wait for existing connection
        console.warn(`Failed to create new connection to ${serverKey}:`, error);
      }
    }

    // Wait for available connection using proper queue
    return this.waitForAvailableConnection(serverKey);
  }

  /**
   * Create a new connection to the server
   */
  private async createNewConnection(
    server: ElectrumXServer,
    _serverKey: string,
  ): Promise<ActiveConnection> {
    const provider = new ElectrumXProvider({
      host: server.host,
      port: server.port,
      network: this.options.network,
      protocol: server.protocol || 'wss',
      timeout: server.timeout || this.options.connectionTimeout,
      retries: 1, // Pool handles retries
    });

    // Test the connection
    await provider.isConnected();

    const connection: ActiveConnection = {
      provider,
      inUse: true,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      requestCount: 1,
      lastHeartbeat: Date.now(),
      consecutiveFailures: 0,
      healthy: true,
      responseTimeHistory: [],
    };

    return connection;
  }

  /**
   * Wait for an available connection using proper queueing
   */
  private waitForAvailableConnection(
    serverKey: string,
  ): Promise<ActiveConnection> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeWaiter(serverKey, resolve, reject);
        reject(new Error(`Connection pool exhausted for server: ${serverKey}`));
      }, this.options.connectionTimeout);

      // Add to queue
      const waiters = this.connectionWaiters.get(serverKey) || [];
      waiters.push({ resolve, reject, timeout: timeout as unknown as number });
      this.connectionWaiters.set(serverKey, waiters);
    });
  }

  /**
   * Remove waiter from queue
   */
  private removeWaiter(
    serverKey: string,
    resolve: (value: ActiveConnection) => void,
    reject: (reason: Error) => void,
  ): void {
    const waiters = this.connectionWaiters.get(serverKey) || [];
    const index = waiters.findIndex((w) => w.resolve === resolve && w.reject === reject);
    if (index > -1) {
      const waiter = waiters[index];
      if (waiter?.timeout) {
        clearTimeoutCompat(waiter.timeout);
      }
      waiters.splice(index, 1);
      this.connectionWaiters.set(serverKey, waiters);
    }
  }

  /**
   * Release connection back to pool and notify waiters
   */
  private releaseConnection(
    serverKey: string,
    connection: ActiveConnection,
  ): void {
    connection.inUse = false;

    // Check if there are waiters for this server
    const waiters = this.connectionWaiters.get(serverKey) || [];
    if (waiters.length > 0 && connection.healthy) {
      const waiter = waiters.shift()!;
      clearTimeout(waiter.timeout as unknown as number);

      // Mark connection as in use and resolve
      connection.inUse = true;
      connection.lastUsed = Date.now();
      connection.requestCount++;
      waiter.resolve(connection);

      this.connectionWaiters.set(serverKey, waiters);
    }
  }

  /**
   * Update connection success metrics
   */
  private updateConnectionSuccess(
    connection: ActiveConnection,
    responseTime: number,
  ): void {
    connection.consecutiveFailures = 0;
    connection.healthy = true;
    connection.lastHeartbeat = Date.now();

    // Update response time history (keep last 10)
    connection.responseTimeHistory.push(responseTime);
    if (connection.responseTimeHistory.length > 10) {
      connection.responseTimeHistory.shift();
    }
  }

  /**
   * Update connection failure metrics
   */
  private updateConnectionFailure(connection: ActiveConnection): void {
    connection.consecutiveFailures++;

    // Mark connection as unhealthy after 3 consecutive failures
    if (connection.consecutiveFailures >= 3) {
      connection.healthy = false;
    }
  }

  /**
   * Select best server based on load balancing strategy
   */
  private selectServer(servers: ElectrumXServer[]): ElectrumXServer {
    switch (this.options.loadBalanceStrategy) {
      case 'round-robin':
        return this.selectRoundRobin(servers);
      case 'weighted':
        return this.selectWeighted(servers);
      case 'least-connections':
        return this.selectLeastConnections(servers);
      case 'health-based':
      default:
        return this.selectHealthBased(servers);
    }
  }

  /**
   * Round-robin server selection
   */
  private selectRoundRobin(servers: ElectrumXServer[]): ElectrumXServer {
    if (servers.length === 0) {
      throw new Error('No servers available for round-robin selection');
    }
    if (servers.length === 0) {
      throw new Error('No servers available for round-robin selection');
    }
    const server = servers[this.currentServerIndex % servers.length];
    this.currentServerIndex++;
    return server as ElectrumXServer;
  }

  /**
   * Weighted server selection
   */
  private selectWeighted(servers: ElectrumXServer[]): ElectrumXServer {
    if (servers.length === 0) {
      throw new Error('No servers available for weighted selection');
    }
    const totalWeight = servers.reduce(
      (sum, server) => sum + (server.weight || 1),
      0,
    );
    let random = Math.random() * totalWeight;

    for (const server of servers) {
      random -= server.weight || 1;
      if (random <= 0) {
        return server;
      }
    }

    return servers[0] as ElectrumXServer;
  }

  /**
   * Least connections server selection
   */
  private selectLeastConnections(servers: ElectrumXServer[]): ElectrumXServer {
    if (servers.length === 0) {
      throw new Error('No servers available for least connections selection');
    }
    if (servers.length === 0) {
      throw new Error('No servers available for least connections selection');
    }
    return servers.reduce((best, server) => {
      const serverKey = this.getServerKey(server);
      const bestKey = this.getServerKey(best);
      const serverHealth = this.serverHealth.get(serverKey);
      const bestHealth = this.serverHealth.get(bestKey);

      if (!serverHealth || !bestHealth) {
        return best;
      }

      return serverHealth.activeConnections < bestHealth.activeConnections ? server : best;
    }, servers[0] as ElectrumXServer);
  }

  /**
   * Health-based server selection with enhanced performance metrics
   */
  private selectHealthBased(servers: ElectrumXServer[]): ElectrumXServer {
    // Score servers based on comprehensive performance metrics
    const scoredServers = servers.map((server) => {
      const serverKey = this.getServerKey(server);
      const health = this.serverHealth.get(serverKey);
      if (!health) {
        console.warn(`No health metrics for server: ${serverKey}`);
        return { server, score: 0, metrics: null };
      }
      const performanceMetrics = this.performanceMonitor.getMetrics(serverKey);

      // Use performance monitor metrics if available, fallback to health metrics
      let overallScore = health.healthScore;
      if (performanceMetrics) {
        overallScore = performanceMetrics.overallScore;

        // Update connection metrics in performance monitor
        this.performanceMonitor.updateConnectionMetrics(
          serverKey,
          health.activeConnections,
          health.activeConnections,
          0, // Connection failures tracked separately
        );
      }

      // Apply server weight multiplier
      const weightedScore = overallScore * (server.weight || 1);

      return { server, score: weightedScore, metrics: performanceMetrics };
    });

    // Sort by weighted score (higher is better)
    scoredServers.sort((a, b) => b.score - a.score);

    return scoredServers[0]?.server || servers[0]!;
  }

  /**
   * Get healthy servers (circuit breaker aware)
   */
  private getHealthyServers(): ElectrumXServer[] {
    return this.options.servers.filter((server) => {
      const serverKey = this.getServerKey(server);
      const health = this.serverHealth.get(serverKey);
      return health?.healthy === true &&
        health?.circuitBreakerState === CircuitBreakerState.CLOSED;
    });
  }

  /**
   * Get available servers (includes healthy servers and half-open circuit breakers)
   */
  private getAvailableServers(): ElectrumXServer[] {
    return this.options.servers.filter((server) => {
      const serverKey = this.getServerKey(server);
      return this.isServerAvailable(serverKey);
    });
  }

  /**
   * Check if server is available (healthy or circuit breaker allows test)
   */
  private isServerAvailable(serverKey: string): boolean {
    const health = this.serverHealth.get(serverKey);
    if (!health) return false;

    switch (health.circuitBreakerState) {
      case CircuitBreakerState.CLOSED:
        return health.healthy;
      case CircuitBreakerState.HALF_OPEN:
        return true; // Allow one test request
      case CircuitBreakerState.OPEN:
        // Check if circuit breaker should transition to half-open
        if (
          health.circuitBreakerOpenTime &&
          Date.now() - health.circuitBreakerOpenTime >
            this.options.circuitBreakerTimeout
        ) {
          health.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  /**
   * Initialize server health tracking with circuit breaker support
   */
  private initializeServerHealth(): void {
    for (const server of this.options.servers) {
      const serverKey = this.getServerKey(server);
      this.serverHealth.set(serverKey, {
        healthy: true,
        consecutiveFailures: 0,
        lastFailTime: 0,
        lastSuccessTime: Date.now(),
        lastHeartbeatTime: Date.now(),
        totalRequests: 0,
        successfulRequests: 0,
        averageResponseTime: 0,
        activeConnections: 0,
        healthScore: 100, // Start with perfect health score
        circuitBreakerState: CircuitBreakerState.CLOSED,
      });
    }
  }

  /**
   * Update server health metrics with circuit breaker logic
   */
  private updateServerHealth(
    serverKey: string,
    success: boolean,
    responseTime?: number,
  ): void {
    const health = this.serverHealth.get(serverKey);
    if (!health) {
      console.warn(`No server health found for key: ${serverKey}`);
      return;
    }

    health.totalRequests++;

    if (success) {
      health.successfulRequests++;
      health.consecutiveFailures = 0;
      health.lastSuccessTime = Date.now();
      health.lastHeartbeatTime = Date.now();

      if (responseTime !== undefined) {
        // Update moving average response time
        const alpha = 0.1; // Smoothing factor
        health.averageResponseTime = health.averageResponseTime === 0
          ? responseTime
          : alpha * responseTime + (1 - alpha) * health.averageResponseTime;
      }

      // Update health score (composite metric)
      this.updateHealthScore(health);

      // Handle circuit breaker state transitions on success
      if (health.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
        // Successful request in half-open state - close the circuit
        health.circuitBreakerState = CircuitBreakerState.CLOSED;
        health.lastCircuitBreakerResetTime = Date.now();
        this.performanceMonitor.recordCircuitBreakerTrip(serverKey, 'closed');
        console.log(
          `ElectrumX server ${serverKey} circuit breaker closed - server recovered`,
        );
      }

      // Mark as healthy if it was unhealthy
      if (!health.healthy) {
        health.healthy = true;
        console.log(`ElectrumX server ${serverKey} marked as healthy`);
      }
    } else {
      health.consecutiveFailures++;
      health.lastFailTime = Date.now();

      // Update health score
      this.updateHealthScore(health);

      // Handle circuit breaker state transitions on failure
      if (health.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
        // Failed request in half-open state - open the circuit again
        health.circuitBreakerState = CircuitBreakerState.OPEN;
        health.circuitBreakerOpenTime = Date.now();
        this.performanceMonitor.recordCircuitBreakerTrip(serverKey, 'open');
        console.warn(
          `ElectrumX server ${serverKey} circuit breaker reopened after failed test`,
        );
      } else if (
        health.circuitBreakerState === CircuitBreakerState.CLOSED &&
        health.consecutiveFailures >= this.options.circuitBreakerThreshold
      ) {
        // Too many failures - open the circuit
        health.circuitBreakerState = CircuitBreakerState.OPEN;
        health.circuitBreakerOpenTime = Date.now();
        this.performanceMonitor.recordCircuitBreakerTrip(serverKey, 'open');
        console.warn(
          `ElectrumX server ${serverKey} circuit breaker opened after ${health.consecutiveFailures} consecutive failures`,
        );
      }

      // Mark as unhealthy if threshold exceeded
      if (
        health.consecutiveFailures >= this.options.failoverThreshold &&
        health.healthy
      ) {
        health.healthy = false;
        console.warn(
          `ElectrumX server ${serverKey} marked as unhealthy after ${health.consecutiveFailures} consecutive failures`,
        );
      }
    }
  }

  /**
   * Update composite health score (0-100)
   */
  private updateHealthScore(health: ServerHealth): void {
    const successRate = health.totalRequests > 0
      ? (health.successfulRequests / health.totalRequests) * 100
      : 100;

    const responseTimeFactor = health.averageResponseTime > 0
      ? Math.max(0, 100 - (health.averageResponseTime / 1000) * 10) // Penalize high response times
      : 100;

    const recentFailurePenalty = Math.max(
      0,
      100 - (health.consecutiveFailures * 20),
    );

    // Composite score with weights
    health.healthScore = Math.round(
      successRate * 0.5 +
        responseTimeFactor * 0.3 +
        recentFailurePenalty * 0.2,
    );
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
      this.cleanupIdleConnections();
      this.adjustPoolSize();
    }, this.options.healthCheckInterval) as unknown as number;
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      await this.performHeartbeats();
    }, this.options.heartbeatInterval) as unknown as number;
  }

  /**
   * Perform health checks on all servers
   */
  private async performHealthChecks(): Promise<void> {
    const promises = this.options.servers.map(async (server) => {
      const serverKey = this.getServerKey(server);
      const health = this.serverHealth.get(serverKey)!;

      // Try to recover unhealthy servers or test circuit breaker recovery
      const shouldTestRecovery = (!health.healthy &&
        Date.now() - health.lastFailTime > this.options.recoveryTimeout) ||
        (health.circuitBreakerState === CircuitBreakerState.HALF_OPEN);

      if (shouldTestRecovery) {
        try {
          const connection = await this.getOrCreateConnection(server);
          const startTime = Date.now();
          await connection.provider.getBlockHeight(); // Simple health check
          const responseTime = Date.now() - startTime;

          this.updateServerHealth(serverKey, true, responseTime);
          this.updateConnectionSuccess(connection, responseTime);
          this.releaseConnection(serverKey, connection);

          console.log(`ElectrumX server ${serverKey} health check passed`);
        } catch (error) {
          this.updateServerHealth(serverKey, false);
          console.warn(
            `ElectrumX server ${serverKey} health check failed:`,
            error,
          );
        }
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Perform heartbeat checks on active connections
   */
  private async performHeartbeats(): Promise<void> {
    const now = Date.now();
    const heartbeatPromises: Promise<void>[] = [];

    for (const [serverKey, connections] of this.connections) {
      const health = this.serverHealth.get(serverKey);
      if (!health) continue;

      for (const connection of connections) {
        // Skip connections that are in use or recently used
        if (connection.inUse || now - connection.lastUsed < 5000) continue;

        // Check if heartbeat is needed
        if (now - connection.lastHeartbeat > this.options.heartbeatInterval) {
          heartbeatPromises.push(
            this.performConnectionHeartbeat(serverKey, connection),
          );
        }
      }
    }

    await Promise.allSettled(heartbeatPromises);
  }

  /**
   * Perform heartbeat on a specific connection
   */
  private async performConnectionHeartbeat(
    serverKey: string,
    connection: ActiveConnection,
  ): Promise<void> {
    try {
      const startTime = Date.now();
      await connection.provider.isConnected();
      const responseTime = Date.now() - startTime;

      connection.lastHeartbeat = Date.now();
      this.updateConnectionSuccess(connection, responseTime);
      this.updateServerHealth(serverKey, true, responseTime);
    } catch (error) {
      console.warn(`Heartbeat failed for connection to ${serverKey}:`, error);
      this.updateConnectionFailure(connection);
      this.updateServerHealth(serverKey, false);

      // Mark connection for removal if it's consistently failing
      if (connection.consecutiveFailures >= 5) {
        await this.removeConnection(serverKey, connection);
      }
    }
  }

  /**
   * Remove a specific connection from the pool
   */
  private async removeConnection(
    serverKey: string,
    connection: ActiveConnection,
  ): Promise<void> {
    const connections = this.connections.get(serverKey) || [];
    const index = connections.indexOf(connection);

    if (index > -1) {
      // Disconnect the connection
      try {
        await connection.provider.disconnect();
      } catch (error) {
        console.warn(`Error disconnecting connection to ${serverKey}:`, error);
      }

      // Remove from pool
      connections.splice(index, 1);
      this.connections.set(serverKey, connections);
      this.totalConnectionCount--;

      // Update health metrics
      const health = this.serverHealth.get(serverKey);
      if (health) {
        health.activeConnections = connections.length;
      }

      console.log(`Removed unhealthy connection to ${serverKey}`);
    }
  }

  /**
   * Cleanup idle and unhealthy connections
   */
  private cleanupIdleConnections(): void {
    const maxIdleTime = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    for (const [serverKey, connections] of this.connections) {
      const activeConnections: ActiveConnection[] = [];
      const connectionsToRemove: ActiveConnection[] = [];

      for (const conn of connections) {
        const shouldRemove = (
          // Remove idle connections
          (!conn.inUse && now - conn.lastUsed > maxIdleTime) ||
          // Remove unhealthy connections that haven't been used recently
          (!conn.healthy && !conn.inUse && now - conn.lastUsed > 30000) ||
          // Remove connections with too many consecutive failures
          (conn.consecutiveFailures >= 10)
        );

        if (shouldRemove) {
          connectionsToRemove.push(conn);
        } else {
          activeConnections.push(conn);
        }
      }

      // Disconnect and remove connections
      for (const conn of connectionsToRemove) {
        try {
          conn.provider.disconnect();
        } catch (error) {
          console.warn(
            `Error disconnecting connection to ${serverKey}:`,
            error,
          );
        }
        this.totalConnectionCount--;
      }

      this.connections.set(serverKey, activeConnections);

      // Update health metrics
      const health = this.serverHealth.get(serverKey);
      if (health) {
        health.activeConnections = activeConnections.length;
      }

      if (connectionsToRemove.length > 0) {
        console.log(
          `Cleaned up ${connectionsToRemove.length} connections for ${serverKey}`,
        );
      }
    }
  }

  /**
   * Adjust pool size based on load and performance
   */
  private adjustPoolSize(): void {
    if (!this.options.enableDynamicScaling) return;

    for (const [serverKey, connections] of this.connections) {
      const health = this.serverHealth.get(serverKey);
      if (!health || !health.healthy) continue;

      const server = this.options.servers.find((s) => this.getServerKey(s) === serverKey);
      if (!server) continue;

      const activeConnections = connections.filter((c) => c.inUse).length;
      const totalConnections = connections.length;
      const utilizationRate = totalConnections > 0 ? activeConnections / totalConnections : 0;

      // Scale up if utilization is high and we're under limits
      if (
        utilizationRate > 0.8 &&
        totalConnections < this.options.maxConnectionsPerServer &&
        this.totalConnectionCount < this.options.maxPoolSize
      ) {
        // Create additional connection proactively
        this.createNewConnection(server, serverKey)
          .then((connection) => {
            connections.push(connection);
            this.connections.set(serverKey, connections);
            this.totalConnectionCount++;
            health.activeConnections = connections.length;
            console.log(
              `Scaled up connections for ${serverKey} to ${connections.length}`,
            );
          })
          .catch((error) => {
            console.warn(
              `Failed to scale up connections for ${serverKey}:`,
              error,
            );
          });
      }

      // Scale down if utilization is consistently low
      if (
        utilizationRate < 0.2 &&
        totalConnections > this.options.minConnectionsPerServer
      ) {
        const idleConnection = connections.find((c) => !c.inUse && Date.now() - c.lastUsed > 60000);
        if (idleConnection) {
          this.removeConnection(serverKey, idleConnection)
            .then(() => {
              console.log(
                `Scaled down connections for ${serverKey} to ${connections.length - 1}`,
              );
            })
            .catch((error) => {
              console.warn(
                `Failed to scale down connections for ${serverKey}:`,
                error,
              );
            });
        }
      }
    }
  }

  /**
   * Get server key for mapping
   */
  private getServerKey(server: ElectrumXServer): string {
    return `${server.host}:${server.port}:${server.protocol || 'wss'}`;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get comprehensive pool statistics
   */
  getStats(): {
    servers: Array<{
      server: string;
      healthy: boolean;
      activeConnections: number;
      totalRequests: number;
      successRate: number;
      averageResponseTime: number;
      consecutiveFailures: number;
      healthScore: number;
      circuitBreakerState: string;
      lastHeartbeat: Date | null;
      connectionsInUse: number;
    }>;
    totalConnections: number;
    totalActiveConnections: number;
    averageHealthScore: number;
    circuitBreakersOpen: number;
  } {
    const servers = this.options.servers.map((server) => {
      const serverKey = this.getServerKey(server);
      const health = this.serverHealth.get(serverKey)!;
      const connections = this.connections.get(serverKey) || [];
      const connectionsInUse = connections.filter((c) => c.inUse).length;

      return {
        server: serverKey,
        healthy: health.healthy,
        activeConnections: connections.length,
        connectionsInUse,
        totalRequests: health.totalRequests,
        successRate: health.totalRequests > 0
          ? health.successfulRequests / health.totalRequests
          : 0,
        averageResponseTime: health.averageResponseTime,
        consecutiveFailures: health.consecutiveFailures,
        healthScore: health.healthScore,
        circuitBreakerState: health.circuitBreakerState,
        lastHeartbeat: health.lastHeartbeatTime > 0 ? new Date(health.lastHeartbeatTime) : null,
      };
    });

    const totalConnections = this.totalConnectionCount;
    const totalActiveConnections = Array.from(this.connections.values()).reduce(
      (total, conns) => total + conns.filter((c) => c.inUse).length,
      0,
    );

    const averageHealthScore = servers.length > 0
      ? servers.reduce((sum, s) => sum + s.healthScore, 0) / servers.length
      : 0;

    const circuitBreakersOpen =
      servers.filter((s) => s.circuitBreakerState === CircuitBreakerState.OPEN)
        .length;

    // Get performance summary from monitor
    const _performanceSummary = this.performanceMonitor.getPerformanceSummary();

    // Enhance server stats with performance metrics
    const enhancedServers = servers.map((server) => {
      const performanceMetrics = this.performanceMonitor.getMetrics(
        server.server,
      );

      if (performanceMetrics) {
        return {
          ...server,
          performanceScore: performanceMetrics.performanceScore,
          reliabilityScore: performanceMetrics.reliabilityScore,
          overallScore: performanceMetrics.overallScore,
          p95ResponseTime: performanceMetrics.p95ResponseTime,
          p99ResponseTime: performanceMetrics.p99ResponseTime,
          uptime: performanceMetrics.uptime,
          circuitBreakerTrips: performanceMetrics.circuitBreakerTrips,
        };
      }

      return server;
    });

    return {
      servers: enhancedServers,
      totalConnections,
      totalActiveConnections,
      averageHealthScore,
      circuitBreakersOpen,
    };
  }

  /**
   * Get detailed performance metrics for a specific server
   */
  getServerPerformanceMetrics(serverKey: string) {
    return this.performanceMonitor.getMetrics(serverKey);
  }

  /**
   * Get performance history for a specific server
   */
  getServerPerformanceHistory(serverKey: string) {
    return this.performanceMonitor.getPerformanceHistory(serverKey);
  }

  /**
   * Get servers ranked by performance
   */
  getRankedServersByPerformance() {
    return this.performanceMonitor.getRankedServers();
  }

  /**
   * Get only healthy servers based on performance criteria
   */
  getHealthyServersByPerformance(minScore = 70) {
    return this.performanceMonitor.getHealthyServers(minScore);
  }

  /**
   * Shutdown the connection pool
   */
  async shutdown(): Promise<void> {
    // Stop timers
    if (this.healthCheckTimer) {
      _clearIntervalCompat(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.heartbeatTimer) {
      _clearIntervalCompat(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Clear all waiters
    for (const [_serverKey, waiters] of this.connectionWaiters) {
      for (const waiter of waiters) {
        clearTimeoutCompat(waiter.timeout);
        waiter.reject(new Error('Connection pool shutting down'));
      }
    }
    this.connectionWaiters.clear();

    // Close all connections
    const disconnectPromises: Promise<void>[] = [];

    for (const connections of this.connections.values()) {
      for (const connection of connections) {
        disconnectPromises.push(connection.provider.disconnect());
      }
    }

    await Promise.allSettled(disconnectPromises);

    this.connections.clear();
    this.serverHealth.clear();
    this.totalConnectionCount = 0;
  }
}

/**
 * Create ElectrumX connection pool with servers from configuration
 */
export function createElectrumXPool(
  network: Network,
  customServers?: ElectrumXServer[],
  options?: Partial<ConnectionPoolOptions>,
): ElectrumXConnectionPool {
  let servers: ElectrumXServer[];

  if (customServers) {
    servers = customServers;
  } else {
    // Get network name for configuration lookup
    const networkName = getNetworkNameFromNetwork(network);

    // Get endpoints from centralized config
    const endpoints = getElectrumXEndpoints(networkName);

    // Convert to ElectrumXServer format
    servers = endpoints.map((endpoint, index) => ({
      host: endpoint.host,
      port: endpoint.port,
      protocol: endpoint.protocol,
      weight: Math.max(1, 4 - (endpoint.priority || (index + 1))),
      timeout: endpoint.timeout,
    }));
  }

  return new ElectrumXConnectionPool({
    network,
    servers,
    ...options,
  });
}

/**
 * Helper function to get network name from Network object
 */
function getNetworkNameFromNetwork(network: Network): string {
  if (network && typeof network === 'object') {
    // Check bech32 prefix to determine network
    if ('bech32' in network) {
      switch (network.bech32) {
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
