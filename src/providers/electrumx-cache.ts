/**
 * ElectrumX Response Cache
 * Intelligent caching system with TTL, LRU eviction, and invalidation strategies
 */

import type { Balance, Transaction, UTXO } from '../interfaces/provider.interface.ts';
import { clearIntervalCompat, setIntervalCompat, type TimerId } from '../utils/timer-utils.ts';

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // Estimated size in bytes
}

export interface CacheConfig {
  maxMemoryMB: number;
  defaultTTL: number; // seconds
  utxoTTL: number;
  balanceTTL: number;
  transactionTTL: number;
  feeEstimateTTL: number;
  blockHeightTTL: number;
  cleanupInterval: number; // seconds
  compressionEnabled: boolean;
}

export interface CacheStats {
  totalEntries: number;
  memoryUsageMB: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
  lastCleanup: number;
  entriesByType: Record<string, number>;
}

/**
 * Advanced caching system with LRU eviction and intelligent TTL
 */
export class ElectrumXCache {
  private cache = new Map<string, CacheEntry>();
  private config: Required<CacheConfig>;
  private accessOrder: string[] = []; // For LRU eviction
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    lastCleanup: Date.now(),
  };
  private cleanupTimer: TimerId | null = null;
  private memoryUsage = 0; // Estimated memory usage in bytes

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxMemoryMB: 100,
      defaultTTL: 300, // 5 minutes
      utxoTTL: 60, // 1 minute - UTXOs can change frequently
      balanceTTL: 30, // 30 seconds - Balance changes often
      transactionTTL: 3600, // 1 hour - Transactions are immutable once confirmed
      feeEstimateTTL: 60, // 1 minute - Fee estimates change frequently
      blockHeightTTL: 600, // 10 minutes - Block height changes roughly every 10 minutes
      cleanupInterval: 300, // 5 minutes
      compressionEnabled: false, // Could implement gzip compression
      ...config,
    };

    this.startCleanupTimer();
  }

  /**
   * Get cached item
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.memoryUsage -= entry.size;
      this.stats.misses++;
      return null;
    }

    // Update access tracking
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    this.updateAccessOrder(key);
    this.stats.hits++;

    return entry.data as T;
  }

  /**
   * Set cached item
   */
  set<T>(
    key: string,
    data: T,
    ttl?: number,
    category?: 'utxo' | 'balance' | 'transaction' | 'fee' | 'block',
  ): void {
    const now = Date.now();
    const effectiveTTL = ttl || this.getTTLForCategory(category);
    const size = this.estimateSize(data);

    // Remove existing entry if present
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!;
      this.memoryUsage -= existing.size;
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      ttl: effectiveTTL,
      accessCount: 1,
      lastAccessed: now,
      size,
    };

    this.cache.set(key, entry);
    this.memoryUsage += size;
    this.updateAccessOrder(key);

    // Check memory usage and evict if necessary
    this.enforceMemoryLimit();
  }

  /**
   * Cache UTXO data with address-based invalidation
   */
  cacheUTXOs(address: string, utxos: UTXO[]): void {
    const key = `utxo:${address}`;
    this.set(key, utxos, undefined, 'utxo');

    // Also cache individual UTXOs for faster lookup
    utxos.forEach((utxo) => {
      const utxoKey = `utxo-item:${utxo.txid}:${utxo.vout}`;
      this.set(utxoKey, utxo, this.config.utxoTTL * 2, 'utxo'); // Longer TTL for individual items
    });
  }

  /**
   * Get cached UTXOs for address
   */
  getCachedUTXOs(address: string): UTXO[] | null {
    return this.get<UTXO[]>(`utxo:${address}`);
  }

  /**
   * Cache balance data
   */
  cacheBalance(address: string, balance: Balance): void {
    const key = `balance:${address}`;
    this.set(key, balance, undefined, 'balance');
  }

  /**
   * Get cached balance
   */
  getCachedBalance(address: string): Balance | null {
    return this.get<Balance>(`balance:${address}`);
  }

  /**
   * Cache transaction data
   */
  cacheTransaction(txid: string, transaction: Transaction): void {
    const key = `tx:${txid}`;
    this.set(key, transaction, undefined, 'transaction');
  }

  /**
   * Get cached transaction
   */
  getCachedTransaction(txid: string): Transaction | null {
    return this.get<Transaction>(`tx:${txid}`);
  }

  /**
   * Cache fee estimate
   */
  cacheFeeEstimate(priority: string, feeRate: number): void {
    const key = `fee:${priority}`;
    this.set(key, feeRate, undefined, 'fee');
  }

  /**
   * Get cached fee estimate
   */
  getCachedFeeEstimate(priority: string): number | null {
    return this.get<number>(`fee:${priority}`);
  }

  /**
   * Cache block height
   */
  cacheBlockHeight(height: number): void {
    const key = 'blockheight';
    this.set(key, height, undefined, 'block');
  }

  /**
   * Get cached block height
   */
  getCachedBlockHeight(): number | null {
    return this.get<number>('blockheight');
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidatePattern(pattern: string): number {
    let count = 0;
    const regex = new RegExp(pattern);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        const entry = this.cache.get(key)!;
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        this.memoryUsage -= entry.size;
        count++;
      }
    }

    return count;
  }

  /**
   * Invalidate all UTXO caches for an address
   */
  invalidateAddress(address: string): void {
    this.invalidatePattern(
      `^(utxo|balance):${address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    );
  }

  /**
   * Invalidate all fee estimates
   */
  invalidateFeeEstimates(): void {
    this.invalidatePattern('^fee:');
  }

  /**
   * Batch set multiple items
   */
  setBatch<T>(
    items: Array<{ key: string; data: T; ttl?: number; category?: string }>,
  ): void {
    for (const item of items) {
      this.set(item.key, item.data, item.ttl, item.category as any);
    }
  }

  /**
   * Batch get multiple items
   */
  getBatch<T>(keys: string[]): Record<string, T | null> {
    const results: Record<string, T | null> = {};

    for (const key of keys) {
      results[key] = this.get<T>(key);
    }

    return results;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const missRate = totalRequests > 0 ? this.stats.misses / totalRequests : 0;

    // Count entries by type
    const entriesByType: Record<string, number> = {};
    for (const key of this.cache.keys()) {
      const type = key.split(':')[0];
      if (type) {
        entriesByType[type] = (entriesByType[type] || 0) + 1;
      }
    }

    return {
      totalEntries: this.cache.size,
      memoryUsageMB: this.memoryUsage / (1024 * 1024),
      hitRate,
      missRate,
      evictionCount: this.stats.evictions,
      lastCleanup: this.stats.lastCleanup,
      entriesByType,
    };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.memoryUsage = 0;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      lastCleanup: Date.now(),
    };
  }

  /**
   * Get entries sorted by access frequency
   */
  getTopEntries(limit: number = 10): Array<{
    key: string;
    accessCount: number;
    age: number;
    size: number;
  }> {
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        accessCount: entry.accessCount,
        age: (Date.now() - entry.timestamp) / 1000,
        size: entry.size,
      }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);

    return entries;
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl * 1000;
  }

  /**
   * Get TTL for category
   */
  private getTTLForCategory(category?: string): number {
    switch (category) {
      case 'utxo':
        return this.config.utxoTTL;
      case 'balance':
        return this.config.balanceTTL;
      case 'transaction':
        return this.config.transactionTTL;
      case 'fee':
        return this.config.feeEstimateTTL;
      case 'block':
        return this.config.blockHeightTTL;
      default:
        return this.config.defaultTTL;
    }
  }

  /**
   * Estimate size of data in bytes
   */
  private estimateSize(data: any): number {
    if (data === null || data === undefined) return 8;
    if (typeof data === 'string') return data.length * 2; // Unicode characters
    if (typeof data === 'number') return 8;
    if (typeof data === 'boolean') return 4;
    if (Array.isArray(data)) {
      return data.reduce((size, item) => size + this.estimateSize(item), 16); // Array overhead
    }
    if (typeof data === 'object') {
      return Object.entries(data).reduce(
        (size, [key, value]) => size + key.length * 2 + this.estimateSize(value),
        16,
      );
    }
    return 16; // Default size
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    // Remove if already present
    this.removeFromAccessOrder(key);

    // Add to end (most recently accessed)
    this.accessOrder.push(key);
  }

  /**
   * Remove from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Enforce memory limit by evicting LRU entries
   */
  private enforceMemoryLimit(): void {
    const maxBytes = this.config.maxMemoryMB * 1024 * 1024;

    while (this.memoryUsage > maxBytes && this.accessOrder.length > 0) {
      const lruKey = this.accessOrder.shift()!;
      const entry = this.cache.get(lruKey);

      if (entry) {
        this.cache.delete(lruKey);
        this.memoryUsage -= entry.size;
        this.stats.evictions++;
      }
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setIntervalCompat(() => {
      this.cleanup();
    }, this.config.cleanupInterval * 1000);
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        this.memoryUsage -= entry.size;
        cleanedCount++;
      }
    }

    this.stats.lastCleanup = now;

    if (cleanedCount > 0) {
      console.log(`ElectrumX cache cleaned up ${cleanedCount} expired entries`);
    }
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart cleanup timer if interval changed
    if (newConfig.cleanupInterval) {
      if (this.cleanupTimer) {
        clearIntervalCompat(this.cleanupTimer);
      }
      this.startCleanupTimer();
    }

    // Enforce new memory limit if changed
    if (newConfig.maxMemoryMB) {
      this.enforceMemoryLimit();
    }
  }

  /**
   * Export cache data for analysis
   */
  export(): {
    config: CacheConfig;
    stats: CacheStats;
    entries: Array<{
      key: string;
      size: number;
      age: number;
      accessCount: number;
      ttl: number;
    }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      size: entry.size,
      age: (Date.now() - entry.timestamp) / 1000,
      accessCount: entry.accessCount,
      ttl: entry.ttl,
    }));

    return {
      config: this.config,
      stats: this.getStats(),
      entries,
    };
  }

  /**
   * Import cache data (careful - this replaces current cache)
   */
  import(
    data: { entries: Array<{ key: string; data: any; ttl: number }> },
  ): void {
    this.clear();

    for (const entry of data.entries) {
      this.set(entry.key, entry.data, entry.ttl);
    }
  }

  /**
   * Shutdown cache
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearIntervalCompat(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.clear();
  }
}

/**
 * Create ElectrumX cache with sensible defaults
 */
export function createElectrumXCache(
  config?: Partial<CacheConfig>,
): ElectrumXCache {
  return new ElectrumXCache(config);
}

/**
 * Create memory-optimized cache (smaller memory footprint)
 */
export function createMemoryOptimizedCache(): ElectrumXCache {
  return new ElectrumXCache({
    maxMemoryMB: 25,
    utxoTTL: 30,
    balanceTTL: 15,
    transactionTTL: 1800, // 30 minutes
    feeEstimateTTL: 30,
    blockHeightTTL: 300, // 5 minutes
    cleanupInterval: 60, // 1 minute
  });
}

/**
 * Create performance-optimized cache (larger memory, longer TTL)
 */
export function createPerformanceOptimizedCache(): ElectrumXCache {
  return new ElectrumXCache({
    maxMemoryMB: 500,
    utxoTTL: 120, // 2 minutes
    balanceTTL: 60, // 1 minute
    transactionTTL: 7200, // 2 hours
    feeEstimateTTL: 120, // 2 minutes
    blockHeightTTL: 1200, // 20 minutes
    cleanupInterval: 600, // 10 minutes
  });
}
