/**
 * @module Providers
 * @description UTXO and blockchain data provider implementations with support for multiple Bitcoin data sources.
 * This module provides robust, production-ready providers for fetching UTXOs, transaction data, and blockchain
 * information with built-in connection pooling, rate limiting, caching, and comprehensive error handling.
 *
 * Features:
 * - ElectrumX protocol implementation with TCP/WebSocket support
 * - Connection pooling and automatic failover
 * - Rate limiting and request throttling
 * - Intelligent caching with TTL
 * - Performance metrics and monitoring
 * - Transaction tracking and fee estimation
 *
 * @example Basic ElectrumX provider usage
 * ```typescript
 * import { ElectrumXProvider } from '@btc-stamps/tx-builder/providers';
 *
 * const provider = new ElectrumXProvider({
 *   endpoints: [
 *     { host: 'electrum.example.com', port: 50002, protocol: 'wss' }
 *   ],
 *   network: 'mainnet'
 * });
 *
 * await provider.connect();
 * const utxos = await provider.getUTXOs('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
 * ```
 *
 * @example Advanced provider with connection pooling
 * ```typescript
 * import { ElectrumXPooledProvider, ElectrumXConnectionPool } from '@btc-stamps/tx-builder/providers';
 *
 * const pool = new ElectrumXConnectionPool({
 *   endpoints: [
 *     { host: 'electrum1.example.com', port: 50002 },
 *     { host: 'electrum2.example.com', port: 50002 },
 *     { host: 'electrum3.example.com', port: 50002 }
 *   ],
 *   maxConnections: 5,
 *   healthCheckInterval: 30000
 * });
 *
 * const provider = new ElectrumXPooledProvider({ pool });
 * const balance = await provider.getBalance('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
 * ```
 *
 * @example Provider with caching and metrics
 * ```typescript
 * import { ElectrumXProvider, ElectrumXCache, ElectrumXMetrics } from '@btc-stamps/tx-builder/providers';
 *
 * const cache = new ElectrumXCache({ ttl: 300000 }); // 5 minute TTL
 * const metrics = new ElectrumXMetrics();
 *
 * const provider = new ElectrumXProvider({
 *   endpoints: [{ host: 'electrum.example.com', port: 50002 }],
 *   cache,
 *   metrics
 * });
 *
 * // Cached responses and performance tracking automatically handled
 * const utxos = await provider.getUTXOs(address);
 * const stats = metrics.getStats();
 * ```
 */

export * from './base-provider.ts';
export * from './electrumx-provider.ts';
export { ConfigLoader } from '../config/index.ts';
export * from './electrumx-connection-pool.ts';
export * from './electrumx-pooled-provider.ts';
export * from './electrumx-transaction-tracker.ts';
export * from './electrumx-rate-limiter.ts';
export * from './electrumx-fee-estimator.ts';
export * from './electrumx-cache.ts';
export * from './electrumx-metrics.ts';
export * from './mock-electrumx-fee-provider.ts';
// ElectrumX fee estimation is handled by ElectrumXFeeEstimator
// Note: These providers are not yet implemented
// export * from './mempool-provider';
// export * from './blockstream-provider';
// export * from './fallback-provider';
// export * from './provider-factory';
