/**
 * ElectrumX Provider
 * Full ElectrumX protocol implementation with WebSocket support
 */

import { createHash } from 'node:crypto';

import * as bitcoin from 'bitcoinjs-lib';
import type { Network } from 'bitcoinjs-lib';

import { ConfigLoader, ElectrumXConfig, ElectrumXEndpoint } from '../config/index.ts';
import type {
  AddressHistory,
  AddressHistoryOptions,
  Balance,
  ElectrumXOptions,
  Transaction,
  UTXO,
} from '../interfaces/provider.interface.ts';

import { BaseProvider } from './base-provider.ts';
import { ElectrumXTCPClient } from './electrumx-tcp-client.ts';
import { clearIntervalCompat, setIntervalCompat, type TimerId } from '../utils/timer-utils.ts';
import process from 'node:process';

// ElectrumX JSON-RPC Protocol Types
interface ElectrumXRequest {
  id: number;
  method: string;
  params: any[];
}

interface ElectrumXResponse<T = any> {
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface ElectrumXServerInfo {
  genesis_hash: string;
  hash_function: string;
  hosts?: Record<string, any>;
  protocol_max: string;
  protocol_min: string;
  pruning?: number;
  server_version: string;
}

interface ElectrumXUnspent {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
}

interface ElectrumXTransactionInfo {
  blockhash?: string;
  blocktime?: number;
  confirmations: number;
  hash: string;
  hex: string;
  locktime: number;
  size: number;
  time?: number;
  txid: string;
  version: number;
  vin: any[];
  vout: any[];
}

interface ElectrumXFeeEstimate {
  [blocks: number]: number;
}

interface ElectrumXHistoryItem {
  tx_hash: string;
  height: number;
  fee?: number;
}

/**
 * ElectrumX provider for interacting with Bitcoin network via ElectrumX servers
 *
 * @remarks
 * ElectrumXProvider implements a robust connection to ElectrumX servers with:
 * - Automatic server failover and retry logic
 * - WebSocket connection management
 * - Full ElectrumX protocol support
 * - Built-in caching for performance
 * - Address validation and script hash conversion
 *
 * Features:
 * - Multiple server endpoints with automatic failover
 * - Configurable retry attempts and timeouts
 * - UTXO fetching with mempool awareness
 * - Transaction broadcasting and monitoring
 * - Balance queries with confirmed/unconfirmed breakdown
 * - Fee estimation support
 *
 * @example
 * ```typescript
 * const provider = new ElectrumXProvider({
 *   endpoints: [
 *     { host: 'electrum.blockstream.info', port: 50002, ssl: true }
 *   ],
 *   network: networks.bitcoin,
 *   maxRetries: 3
 * });
 *
 * const utxos = await provider.getUTXOs('bc1q...');
 * const balance = await provider.getBalance('bc1q...');
 * ```
 */
export class ElectrumXProvider extends BaseProvider {
  private config: ElectrumXConfig;
  private currentEndpoint: ElectrumXEndpoint | null = null;
  private failedEndpoints: Set<string> = new Set();
  private ws: WebSocket | null = null;
  private tcpClient: ElectrumXTCPClient | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  private connectionPromise: Promise<void> | null = null;
  private serverInfo: ElectrumXServerInfo | null = null;
  private isConnecting = false;
  private heartbeatTimer: TimerId | null = null;
  private lastHeartbeat: number = 0;
  private heartbeatInterval = 30000; // 30 seconds
  private missedHeartbeats = 0;
  private maxMissedHeartbeats = 3;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second delay

  constructor(options?: ElectrumXOptions) {
    // Convert old-style options to new configuration format
    const configOptions: Partial<ElectrumXConfig> = {};

    if (options) {
      configOptions.network = options.network;
      if (options.connectionTimeout || options.timeout) {
        configOptions.connectionTimeout = options.connectionTimeout ||
          options.timeout || undefined;
      }
      if (options.requestTimeout || options.timeout) {
        configOptions.requestTimeout = options.requestTimeout ||
          options.timeout || undefined;
      }
      if (options.fallbackToPublic !== undefined) {
        configOptions.fallbackToPublic = options.fallbackToPublic;
      }

      // Handle legacy single endpoint options
      if (options.host && options.port) {
        const endpoint: ElectrumXEndpoint = {
          host: options.host,
          port: options.port,
          protocol: options.protocol || 'wss',
          priority: 0,
        };
        if (options.timeout !== undefined) {
          endpoint.timeout = options.timeout;
        }
        if (options.retries !== undefined) {
          endpoint.maxRetries = options.retries;
        }
        configOptions.endpoints = [endpoint];
      } else if (options.endpoints) {
        configOptions.endpoints = options.endpoints;
      }
    }

    // Load configuration with all layers
    const config = ConfigLoader.loadConfig(configOptions);

    // Convert network string to bitcoin.Network object
    const networkObj = (config.network as unknown as string) === 'testnet'
      ? bitcoin.networks.testnet
      : bitcoin.networks.bitcoin;

    super({
      network: networkObj,
      timeout: config.requestTimeout || 30000,
      retries: 3,
      retryDelay: 1000,
      maxRetryDelay: 10000,
    });

    this.config = config;
  }

  /**
   * Get UTXOs for a given address
   */
  async getUTXOs(address: string): Promise<UTXO[]> {
    if (!this.isValidAddress(address)) {
      throw new Error(`Invalid address: ${address}`);
    }

    const scriptHash = this.addressToScriptHash(address);
    const unspents =
      (await this.executeWithRetry(() =>
        this.call('blockchain.scripthash.listunspent', [scriptHash])
      )) as ElectrumXUnspent[];

    // Get block height once for all confirmations
    const currentHeight = await this.getBlockHeight();

    return unspents.map((utxo): UTXO => {
      const result: UTXO = {
        txid: utxo.tx_hash,
        vout: utxo.tx_pos,
        value: utxo.value,
        scriptPubKey: this.getScriptPubKey(address),
        confirmations: utxo.height > 0 ? currentHeight - utxo.height + 1 : 0,
      };
      if (utxo.height > 0) {
        result.height = utxo.height;
      }
      return result;
    });
  }

  /**
   * Get balance for a given address
   */
  async getBalance(address: string): Promise<Balance> {
    if (!this.isValidAddress(address)) {
      throw new Error(`Invalid address: ${address}`);
    }

    const scriptHash = this.addressToScriptHash(address);
    const balance =
      (await this.executeWithRetry(() =>
        this.call('blockchain.scripthash.get_balance', [scriptHash])
      )) as { confirmed: number; unconfirmed: number };

    return {
      confirmed: balance.confirmed,
      unconfirmed: balance.unconfirmed,
      total: balance.confirmed + balance.unconfirmed,
    };
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(txid: string): Promise<Transaction> {
    if (!this.isValidTxid(txid)) {
      throw new Error(`Invalid transaction ID: ${txid}`);
    }

    const [hex, info] = await Promise.all([
      this.executeWithRetry(() =>
        this.call('blockchain.transaction.get', [txid, false])
      ) as Promise<string>,
      this.executeWithRetry(() => this.call('blockchain.transaction.get', [txid, true])) as Promise<
        ElectrumXTransactionInfo
      >,
    ]);

    const currentHeight = await this.getBlockHeight();
    const confirmations = info.confirmations || 0;

    const transaction: Transaction = {
      txid: info.txid,
      hex,
      confirmations,
      size: info.size,
    };

    if (confirmations > 0) {
      transaction.height = currentHeight - confirmations + 1;
    }

    if (info.time || info.blocktime) {
      transaction.timestamp = info.time || info.blocktime || undefined;
    }

    return transaction;
  }

  /**
   * Broadcast a signed transaction
   */
  async broadcastTransaction(hexTx: string): Promise<string> {
    if (!hexTx || typeof hexTx !== 'string' || hexTx.length < 20) {
      throw new Error('Invalid transaction hex');
    }

    const txid =
      (await this.executeWithRetry(() =>
        this.call('blockchain.transaction.broadcast', [hexTx])
      )) as string;

    return txid;
  }

  /**
   * Get comprehensive fee estimates for multiple confirmation targets
   */
  async getFeeEstimates(): Promise<ElectrumXFeeEstimate> {
    const targetBlocks = [1, 6, 25]; // High, medium, low priority
    const estimates: ElectrumXFeeEstimate = {};

    // Get estimates for each target block count
    for (const blocks of targetBlocks) {
      const feeEstimate = await this.executeWithRetry(() =>
        this.call('blockchain.estimatefee', [blocks])
      ) as number;

      // Convert from BTC/kB to sat/vB
      const satPerKB = feeEstimate * 100000000; // BTC to satoshis
      const satPerVB = satPerKB / 1000; // kB to vB

      // Ensure minimum fee rate
      estimates[blocks] = Math.max(1, Math.round(satPerVB));
    }

    return estimates;
  }

  /**
   * Get current fee rate (sat/vB) for specific priority
   */
  async getFeeRate(
    priority: 'low' | 'medium' | 'high' = 'medium',
  ): Promise<number> {
    const targetBlocks = {
      high: 1, // Next block
      medium: 6, // ~1 hour
      low: 25, // ~4 hours
    };

    const estimates = await this.getFeeEstimates();
    return estimates[targetBlocks[priority]] || 10; // Fallback to 10 sat/vB
  }

  /**
   * Get current block height
   */
  async getBlockHeight(): Promise<number> {
    const headers =
      (await this.executeWithRetry(() => this.call('blockchain.headers.subscribe'))) as {
        height: number;
        hex: string;
      };

    return headers.height;
  }

  /**
   * Get address transaction history
   */
  async getAddressHistory(
    address: string,
    options?: AddressHistoryOptions,
  ): Promise<AddressHistory[]> {
    if (!this.isValidAddress(address)) {
      throw new Error(`Invalid address: ${address}`);
    }

    const scriptHash = this.addressToScriptHash(address);

    try {
      const historyItems = (await this.executeWithRetry(() =>
        this.call('blockchain.scripthash.get_history', [scriptHash])
      )) as ElectrumXHistoryItem[];

      // Convert ElectrumX history format to our interface
      let history: AddressHistory[] = historyItems.map((
        item,
      ): AddressHistory => ({
        txid: item.tx_hash,
        height: item.height,
        ...(item.fee !== undefined && { fee: item.fee }),
      }));

      // Apply height filtering if requested
      if (options?.fromHeight !== undefined) {
        history = history.filter((item) =>
          item.height >= options.fromHeight!
        );
      }

      if (options?.toHeight !== undefined) {
        history = history.filter((item) => item.height <= options.toHeight!);
      }

      // Sort by height descending (most recent first)
      history.sort((a, b) => b.height - a.height);

      // Apply limit if requested
      if (options?.limit !== undefined && options.limit > 0) {
        history = history.slice(0, options.limit);
      }

      return history;
    } catch (error) {
      // Handle common ElectrumX errors gracefully
      if (error instanceof Error) {
        if (error.message.includes('invalid address')) {
          throw new Error(`Invalid address format: ${address}`);
        }
        if (error.message.includes('scripthash')) {
          throw new Error(
            `Failed to get address history: Invalid script hash for address ${address}`,
          );
        }
        if (
          error.message.includes('timeout') ||
          error.message.includes('connection')
        ) {
          throw new Error(`Failed to get address history: ${error.message}`);
        }
      }

      throw new Error(`Failed to get address history for ${address}: ${error}`);
    }
  }

  /**
   * Check if provider is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.ensureConnection();
      return this.ws?.readyState === WebSocket.OPEN;
    } catch {
      return false;
    }
  }

  /**
   * Convert Bitcoin address to ElectrumX script hash
   */
  private addressToScriptHash(address: string): string {
    try {
      // Decode address to get script
      const decoded = bitcoin.address.toOutputScript(address, this.network);

      // Hash the script with SHA256
      const hash = createHash('sha256').update(decoded).digest();

      // Reverse bytes for ElectrumX format
      return hash.reverse().toString('hex');
    } catch (error) {
      throw new Error(`Failed to convert address to script hash: ${error}`);
    }
  }

  /**
   * Get script public key for address
   */
  private getScriptPubKey(address: string): string {
    try {
      const script = bitcoin.address.toOutputScript(address, this.network);
      return script.toString('hex');
    } catch (error) {
      throw new Error(`Failed to get script public key: ${error}`);
    }
  }

  /**
   * Ensure WebSocket connection is established
   */
  private async ensureConnection(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.connect();
    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  /**
   * Establish WebSocket connection
   */
  private async connect(): Promise<void> {
    if (this.isConnecting) {
      throw new Error('Already connecting');
    }

    this.isConnecting = true;

    try {
      // Try endpoints in priority order
      for (const endpoint of this.config.endpoints) {
        const endpointKey = `${endpoint.host}:${endpoint.port}`;

        if (this.failedEndpoints.has(endpointKey)) {
          continue; // Skip failed endpoints
        }

        try {
          await this.connectToEndpoint(endpoint);
          this.currentEndpoint = endpoint;
          console.log(
            `Connected to ElectrumX: ${endpointKey} (${endpoint.protocol})`,
          );
          return;
        } catch (error) {
          console.warn(`Failed to connect to ${endpointKey}:`, error);

          // Track ECONNRESET and other critical connection errors
          if ((error as Error).message.includes('ECONNRESET')) {
            console.error(
              `CRITICAL: ECONNRESET error on ${endpointKey} - this endpoint may be unreliable`,
            );
          }

          this.failedEndpoints.add(endpointKey);
          continue;
        }
      }

      throw new Error('Failed to connect to any ElectrumX endpoint');
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Connect to a specific endpoint
   */
  private async connectToEndpoint(endpoint: ElectrumXEndpoint): Promise<void> {
    // Use TCP for tcp/ssl protocols, WebSocket for ws/wss
    if (
      endpoint.protocol === 'tcp' || endpoint.protocol === 'ssl' ||
      (endpoint.protocol as string) === 'tls'
    ) {
      return await this.connectViaTCP(endpoint);
    } else {
      return await this.connectViaWebSocket(endpoint);
    }
  }

  /**
   * Connect via TCP/SSL
   */
  private async connectViaTCP(endpoint: ElectrumXEndpoint): Promise<void> {
    this.tcpClient = new ElectrumXTCPClient({
      timeout: endpoint.timeout || this.config.connectionTimeout || 10000,
      keepAlive: true,
      rejectUnauthorized: false,
    });

    await this.tcpClient.connect(endpoint);

    // Get server info
    this.serverInfo = await this.tcpClient.request('server.version', [
      'tx-builder',
      '1.4',
    ]);

    // Start heartbeat
    this.startHeartbeat();
  }

  /**
   * Connect via WebSocket
   */
  private connectViaWebSocket(endpoint: ElectrumXEndpoint): Promise<void> {
    const url = `${endpoint.protocol}://${endpoint.host}:${endpoint.port}`;

    // Create WebSocket connection
    this.ws = new WebSocket(url);

    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not initialized'));
        return;
      }

      const connectionTimeout = setTimeout(
        () => {
          reject(
            new Error(
              `Connection timeout to ${endpoint.host}:${endpoint.port}`,
            ),
          );
          this.cleanup();
        },
        endpoint.timeout || this.config.connectionTimeout || 5000,
      );

      this.ws.onopen = async () => {
        clearTimeout(connectionTimeout);

        try {
          // Get server info on connection
          this.serverInfo = await this.call('server.version', [
            'tx-builder',
            '1.4',
          ]);

          // Start heartbeat monitoring
          this.startHeartbeat();

          resolve();
        } catch (error) {
          reject(error);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const response: ElectrumXResponse = JSON.parse(event.data.toString());

          // Update heartbeat on any message received
          this.lastHeartbeat = Date.now();
          this.missedHeartbeats = 0;

          this.handleResponse(response);
        } catch (error) {
          console.error('Failed to parse ElectrumX response:', error);
        }
      };

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        reject(new Error(`WebSocket error: ${error}`));
      };

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.warn(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);

        // Attempt automatic reconnection for unexpected closures
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnection();
        } else {
          this.cleanup();
        }
      };
    });
  }

  /**
   * Make JSON-RPC call to ElectrumX server
   */
  private async call(method: string, params: any[] = []): Promise<any> {
    await this.ensureConnection();

    // Use TCP client if available
    if (this.tcpClient && this.tcpClient.isConnected()) {
      return this.tcpClient.request(method, params);
    }

    // Otherwise use WebSocket
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('No connection available');
    }

    const id = ++this.requestId;
    const request: ElectrumXRequest = { id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.timeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.ws!.send(JSON.stringify(request));
    });
  }

  /**
   * Handle ElectrumX response
   */
  private handleResponse(response: ElectrumXResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return; // Unexpected response
    }

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timeout);

    if (response.error) {
      const error = new Error(`ElectrumX error: ${response.error.message}`);
      (error as any).code = response.error.code;
      (error as any).data = response.error.data;
      pending.reject(error);
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.stopHeartbeat(); // Clear any existing heartbeat

    this.lastHeartbeat = Date.now();
    this.missedHeartbeats = 0;

    this.heartbeatTimer = setIntervalCompat(() => {
      this.performHeartbeat();
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearIntervalCompat(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Perform heartbeat check
   */
  private performHeartbeat(): void {
    const now = Date.now();
    const timeSinceLastHeartbeat = now - this.lastHeartbeat;

    // If we haven't received any messages recently, send a ping
    if (timeSinceLastHeartbeat > this.heartbeatInterval) {
      this.missedHeartbeats++;

      if (this.missedHeartbeats > this.maxMissedHeartbeats) {
        console.warn('ElectrumX connection lost - too many missed heartbeats');
        this.cleanup();
        return;
      }

      // Send a ping (use server.ping if available, otherwise use server.version as ping)
      this.sendPing().catch((error) => {
        console.warn('Heartbeat ping failed:', error);
        this.missedHeartbeats++;
      });
    }
  }

  /**
   * Send ping to server
   */
  private async sendPing(): Promise<void> {
    try {
      // Use server.ping if supported, otherwise use server.version as a keep-alive
      await this.call('server.ping', []);
    } catch {
      // If server.ping is not supported, try server.version
      try {
        await this.call('server.version', ['tx-builder', '1.4']);
      } catch (versionError) {
        throw versionError;
      }
    }
  }

  /**
   * Schedule automatic reconnection with exponential backoff
   */
  private scheduleReconnection(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`,
    );

    setTimeout(async () => {
      try {
        console.log(
          `Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`,
        );
        await this.connect();

        // Reset reconnection counter on successful connection
        this.reconnectAttempts = 0;
        console.log('Reconnection successful');
      } catch (error) {
        console.warn(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);

        // Try again if we haven't exceeded max attempts
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnection();
        } else {
          console.error('Max reconnection attempts reached, giving up');
          this.cleanup();
        }
      }
    }, delay);
  }

  /**
   * Cleanup connections and pending requests
   */
  private cleanup(): void {
    // Stop heartbeat
    this.stopHeartbeat();

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    // Close WebSocket
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }

    // Close TCP client
    if (this.tcpClient) {
      this.tcpClient.disconnect();
      this.tcpClient = null;
    }

    this.serverInfo = null;
    this.isConnecting = false;
    this.lastHeartbeat = 0;
    this.missedHeartbeats = 0;
  }

  /**
   * Disconnect from ElectrumX server
   */
  disconnect(): Promise<void> {
    // Reset reconnection attempts when manually disconnecting
    this.reconnectAttempts = this.maxReconnectAttempts;
    this.cleanup();
    return Promise.resolve();
  }

  /**
   * Get server information
   */
  getServerInfo(): ElectrumXServerInfo | null {
    return this.serverInfo;
  }

  /**
   * Get current configuration
   */
  getConfig(): ElectrumXConfig {
    return { ...this.config };
  }

  /**
   * Get current active endpoint
   */
  getCurrentEndpoint(): ElectrumXEndpoint | null {
    return this.currentEndpoint ? { ...this.currentEndpoint } : null;
  }

  /**
   * Get failed endpoints (for debugging)
   */
  getFailedEndpoints(): string[] {
    return Array.from(this.failedEndpoints);
  }

  /**
   * Reset failed endpoints (to allow retry)
   */
  resetFailedEndpoints(): void {
    this.failedEndpoints.clear();
  }

  /**
   * Test connection to all configured endpoints
   */
  async testEndpoints(): Promise<
    Array<{ endpoint: ElectrumXEndpoint; success: boolean; error?: string }>
  > {
    const results: Array<
      { endpoint: ElectrumXEndpoint; success: boolean; error?: string }
    > = [];

    for (const endpoint of this.config.endpoints) {
      try {
        // Temporarily connect to test endpoint
        const tempProvider = new ElectrumXProvider({
          network: this.config.network,
          endpoints: [endpoint],
        });

        await tempProvider.isConnected();
        await tempProvider.disconnect();

        results.push({ endpoint, success: true });
      } catch (error) {
        results.push({
          endpoint,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }
}

/**
 * Create ElectrumX provider with default configuration (legacy compatibility)
 */
export function createElectrumXProvider(
  host: string,
  port: number,
  network: Network,
  options?: Partial<ElectrumXOptions>,
): ElectrumXProvider {
  return new ElectrumXProvider({
    host,
    port,
    network,
    protocol: 'wss',
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
    maxRetryDelay: 10000,
    ...options,
  });
}

/**
 * Create ElectrumX provider with multiple endpoints
 */
export function createMultiEndpointProvider(
  endpoints: Array<{
    host: string;
    port: number;
    protocol?: 'tcp' | 'ssl' | 'ws' | 'wss';
    priority?: number;
  }>,
  network: Network,
  options?: Partial<ElectrumXOptions>,
): ElectrumXProvider {
  return new ElectrumXProvider({
    network,
    endpoints: endpoints.map((ep) => ({
      ...ep,
      protocol: ep.protocol || 'ssl',
    })),
    ...options,
  });
}

/**
 * Create ElectrumX provider for local development
 * Reads configuration from environment variables
 */
export function createLocalDevelopmentProvider(
  network: Network = bitcoin.networks.bitcoin,
): ElectrumXProvider {
  const host = process.env.ELECTRUMX_HOST;
  const port = parseInt(process.env.ELECTRUMX_PORT || '8000');
  const protocol = (process.env.ELECTRUMX_PROTOCOL as 'tcp' | 'ssl' | 'ws' | 'wss') || 'tcp';

  if (!host) {
    throw new Error(
      'Local development requires ELECTRUMX_HOST environment variable. ' +
        'Please set it in your .env file (not committed to git).',
    );
  }

  return new ElectrumXProvider({
    network,
    endpoints: [
      {
        host,
        port,
        protocol,
        priority: 0,
      },
    ],
    fallbackToPublic: false, // Don't fallback for local dev
  });
}

/**
 * Create ElectrumX provider with public endpoints only
 */
export function createPublicProvider(
  network: Network = bitcoin.networks.bitcoin,
): ElectrumXProvider {
  return new ElectrumXProvider({
    network,
    fallbackToPublic: true,
  });
}

/**
 * Create ElectrumX provider from environment configuration
 */
export function createProviderFromEnvironment(): ElectrumXProvider {
  return new ElectrumXProvider();
}
