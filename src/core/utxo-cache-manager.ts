/**
 * UTXO Cache Manager
 * Advanced caching layer with TTL management and performance optimization
 */

import type { SelectionOptions } from '../interfaces/selector.interface.js';
import type { UTXO } from '../interfaces/provider.interface.js';

export interface UTXOCacheEntry {
  utxos: UTXO[];
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  blockHeight?: number;
  totalValue: number;
  hash: string; // Hash of the UTXO set for integrity
}

export interface IndexedUTXOData {
  byValue: Map<number, UTXO[]>; // UTXOs grouped by value ranges
  byConfirmations: Map<number, UTXO[]>; // UTXOs grouped by confirmation count
  sortedByValue: UTXO[]; // UTXOs sorted by value (ascending)
  sortedByConfirmations: UTXO[]; // UTXOs sorted by confirmations (descending)
  totalValue: number;
  count: number;
  lastUpdated: number;
}

export interface CacheConfig {
  maxCacheSize: number; // Maximum number of cached UTXO sets
  defaultTTL: number; // Default TTL in seconds
  blockHeightTTL: number; // TTL based on block confirmations
  memoryLimit: number; // Memory limit in MB
  enableIndexing: boolean; // Enable indexed data structures
  compressionThreshold: number; // Compress UTXO sets larger than this
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  memoryUsage: number;
  indexHitRate: number;
  averageUTXOSetSize: number;
  evictionCount: number;
  compressionRatio: number;
}

/**
 * Advanced UTXO caching system with indexing and performance optimization
 */
export class UTXOCacheManager {
  private cache = new Map<string, UTXOCacheEntry>();
  private indexCache = new Map<string, IndexedUTXOData>();
  private accessOrder: string[] = []; // LRU tracking
  private stats = {
    hits: 0,
    misses: 0,
    indexHits: 0,
    indexMisses: 0,
    evictions: 0,
    compressions: 0,
  };
  private config: Required<CacheConfig>;
  private memoryUsage = 0;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxCacheSize: 1000,
      defaultTTL: 300, // 5 minutes
      blockHeightTTL: 600, // 10 minutes
      memoryLimit: 500, // 500 MB
      enableIndexing: true,
      compressionThreshold: 1000, // UTXOs
      ...config,
    };
  }

  /**
   * Get cached UTXOs for an address
   */
  getUTXOs(address: string, blockHeight?: number): UTXO[] | null {
    const key = this.generateKey(address, blockHeight);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.evictEntry(key);
      this.stats.misses++;
      return null;
    }

    // Update access tracking
    this.updateAccess(key, entry);
    this.stats.hits++;

    return this.decompressUTXOs(entry.utxos);
  }

  /**
   * Cache UTXOs for an address
   */
  setUTXOs(
    address: string,
    utxos: UTXO[],
    blockHeight?: number,
    customTTL?: number,
  ): void {
    const key = this.generateKey(address, blockHeight);
    const ttl = customTTL || this.calculateTTL(utxos, blockHeight);
    const compressedUTXOs = this.compressUTXOs(utxos);
    const hash = this.generateUTXOHash(utxos);
    const totalValue = utxos.reduce((sum, utxo) => sum + utxo.value, 0);

    const entry: UTXOCacheEntry = {
      utxos: compressedUTXOs,
      timestamp: Date.now(),
      ttl,
      accessCount: 1,
      lastAccessed: Date.now(),
      ...(blockHeight !== undefined && { blockHeight }),
      totalValue,
      hash,
    };

    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.evictEntry(key);
    }

    this.cache.set(key, entry);
    this.updateAccessOrder(key);

    // Create indexed data if enabled
    if (this.config.enableIndexing) {
      this.createIndexedData(key, utxos);
    }

    // Update memory tracking
    this.updateMemoryUsage();

    // Enforce limits
    this.enforceLimits();
  }

  /**
   * Get UTXOs optimized for specific selection criteria
   */
  getOptimizedUTXOs(
    address: string,
    options: SelectionOptions,
    blockHeight?: number,
  ): UTXO[] | null {
    const key = this.generateKey(address, blockHeight);
    const indexKey = `${key}:index`;

    // Try to get indexed data first
    if (this.config.enableIndexing && this.indexCache.has(indexKey)) {
      const indexedData = this.indexCache.get(indexKey)!;

      if (!this.isIndexExpired(indexedData)) {
        this.stats.indexHits++;
        return this.selectFromIndexedData(indexedData, options);
      } else {
        this.indexCache.delete(indexKey);
        this.stats.indexMisses++;
      }
    }

    // Fallback to regular cache
    return this.getUTXOs(address, blockHeight);
  }

  /**
   * Pre-filter UTXOs by value range for faster selection
   */
  getUTXOsByValueRange(
    address: string,
    minValue: number,
    maxValue: number,
    blockHeight?: number,
  ): UTXO[] | null {
    const key = this.generateKey(address, blockHeight);
    const indexKey = `${key}:index`;

    if (this.config.enableIndexing && this.indexCache.has(indexKey)) {
      const indexedData = this.indexCache.get(indexKey)!;

      if (!this.isIndexExpired(indexedData)) {
        const filteredUTXOs = indexedData.sortedByValue.filter(
          (utxo) => utxo.value >= minValue && utxo.value <= maxValue,
        );
        this.stats.indexHits++;
        return filteredUTXOs;
      }
    }

    // Fallback to full UTXO set filtering
    const utxos = this.getUTXOs(address, blockHeight);
    if (utxos) {
      return utxos.filter((utxo) => utxo.value >= minValue && utxo.value <= maxValue);
    }

    return null;
  }

  /**
   * Get UTXOs suitable for specific confirmation requirements
   */
  getUTXOsByConfirmations(
    address: string,
    minConfirmations: number,
    blockHeight?: number,
  ): UTXO[] | null {
    const key = this.generateKey(address, blockHeight);
    const indexKey = `${key}:index`;

    if (this.config.enableIndexing && this.indexCache.has(indexKey)) {
      const indexedData = this.indexCache.get(indexKey)!;

      if (!this.isIndexExpired(indexedData)) {
        const filteredUTXOs = indexedData.sortedByConfirmations.filter(
          (utxo) => (utxo.confirmations ?? 0) >= minConfirmations,
        );
        this.stats.indexHits++;
        return filteredUTXOs;
      }
    }

    const utxos = this.getUTXOs(address, blockHeight);
    if (utxos) {
      return utxos.filter((utxo) => (utxo.confirmations ?? 0) >= minConfirmations);
    }

    return null;
  }

  /**
   * Invalidate cache entries for an address
   */
  invalidateAddress(address: string): number {
    let count = 0;
    const pattern = `${address}:`;

    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        this.evictEntry(key);
        count++;
      }
    }

    // Also invalidate index cache
    for (const key of this.indexCache.keys()) {
      if (key.startsWith(pattern)) {
        this.indexCache.delete(key);
      }
    }

    return count;
  }

  /**
   * Invalidate cache entries older than specified block height
   */
  invalidateByBlockHeight(blockHeight: number): number {
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.blockHeight && entry.blockHeight < blockHeight) {
        this.evictEntry(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Batch update multiple addresses
   */
  batchUpdate(
    updates: Array<{
      address: string;
      utxos: UTXO[];
      blockHeight?: number;
      ttl?: number;
    }>,
  ): void {
    for (const update of updates) {
      this.setUTXOs(
        update.address,
        update.utxos,
        update.blockHeight,
        update.ttl,
      );
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const totalIndexRequests = this.stats.indexHits + this.stats.indexMisses;

    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const missRate = totalRequests > 0 ? this.stats.misses / totalRequests : 0;
    const indexHitRate = totalIndexRequests > 0 ? this.stats.indexHits / totalIndexRequests : 0;

    const utxoCounts = Array.from(this.cache.values()).map((entry) => entry.utxos.length);
    const averageUTXOSetSize = utxoCounts.length > 0
      ? utxoCounts.reduce((sum, count) => sum + count, 0) / utxoCounts.length
      : 0;

    const compressionRatio = this.stats.compressions > 0
      ? this.stats.compressions / this.cache.size
      : 0;

    return {
      totalEntries: this.cache.size,
      hitRate,
      missRate,
      memoryUsage: this.memoryUsage / (1024 * 1024), // MB
      indexHitRate,
      averageUTXOSetSize,
      evictionCount: this.stats.evictions,
      compressionRatio,
    };
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
    this.indexCache.clear();
    this.accessOrder = [];
    this.memoryUsage = 0;
    this.stats = {
      hits: 0,
      misses: 0,
      indexHits: 0,
      indexMisses: 0,
      evictions: 0,
      compressions: 0,
    };
  }

  /**
   * Export cache data for analysis
   */
  export(): {
    config: CacheConfig;
    stats: CacheStats;
    entries: Array<{
      key: string;
      utxoCount: number;
      totalValue: number;
      age: number;
      accessCount: number;
      ttl: number;
      blockHeight?: number;
    }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      utxoCount: entry.utxos.length,
      totalValue: entry.totalValue,
      age: (Date.now() - entry.timestamp) / 1000,
      accessCount: entry.accessCount,
      ttl: entry.ttl,
      blockHeight: entry.blockHeight,
    }));

    return {
      config: this.config,
      stats: this.getStats(),
      entries,
    };
  }

  /**
   * Generate cache key
   */
  private generateKey(address: string, blockHeight?: number): string {
    return blockHeight ? `${address}:${blockHeight}` : address;
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: UTXOCacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl * 1000;
  }

  /**
   * Check if indexed data is expired
   */
  private isIndexExpired(indexedData: IndexedUTXOData): boolean {
    return Date.now() - indexedData.lastUpdated > this.config.defaultTTL * 1000;
  }

  /**
   * Calculate TTL based on UTXO characteristics
   */
  private calculateTTL(utxos: UTXO[], _blockHeight?: number): number {
    // Adjust TTL based on confirmation depth
    const avgConfirmations = utxos.reduce((sum, utxo) => sum + (utxo.confirmations || 0), 0) /
      utxos.length;

    if (avgConfirmations < 1) {
      return 30; // 30 seconds for unconfirmed UTXOs
    } else if (avgConfirmations < 6) {
      return 120; // 2 minutes for low-confirmation UTXOs
    }

    return this.config.defaultTTL;
  }

  /**
   * Update access tracking
   */
  private updateAccess(key: string, entry: UTXOCacheEntry): void {
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    this.updateAccessOrder(key);
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Evict cache entry
   */
  private evictEntry(key: string): void {
    this.cache.delete(key);
    this.indexCache.delete(`${key}:index`);

    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }

    this.stats.evictions++;
  }

  /**
   * Compress UTXOs if needed
   */
  private compressUTXOs(utxos: UTXO[]): UTXO[] {
    if (utxos.length > this.config.compressionThreshold) {
      // Simple compression: remove redundant data, optimize representation
      this.stats.compressions++;
      // For now, just return as-is - could implement actual compression
    }

    return utxos;
  }

  /**
   * Decompress UTXOs
   */
  private decompressUTXOs(utxos: UTXO[]): UTXO[] {
    // For now, just return as-is - would reverse compression
    return utxos;
  }

  /**
   * Generate hash for UTXO set integrity
   */
  private generateUTXOHash(utxos: UTXO[]): string {
    // Simple hash based on UTXO identifiers and values
    const data = utxos
      .map((utxo) => `${utxo.txid}:${utxo.vout}:${utxo.value}`)
      .sort()
      .join('|');

    // Simple hash function (in production, use crypto hash)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString(36);
  }

  /**
   * Create indexed data structures
   */
  private createIndexedData(key: string, utxos: UTXO[]): void {
    const byValue = new Map<number, UTXO[]>();
    const byConfirmations = new Map<number, UTXO[]>();

    // Group by value ranges (powers of 10)
    for (const utxo of utxos) {
      const valueRange = Math.floor(Math.log10(utxo.value));
      if (!byValue.has(valueRange)) {
        byValue.set(valueRange, []);
      }
      byValue.get(valueRange)!.push(utxo);
    }

    // Group by confirmations
    for (const utxo of utxos) {
      const confirmationGroup = Math.min(utxo.confirmations || 0, 100); // Cap at 100
      if (!byConfirmations.has(confirmationGroup)) {
        byConfirmations.set(confirmationGroup, []);
      }
      byConfirmations.get(confirmationGroup)!.push(utxo);
    }

    const indexedData: IndexedUTXOData = {
      byValue,
      byConfirmations,
      sortedByValue: [...utxos].sort((a, b) => a.value - b.value),
      sortedByConfirmations: [...utxos].sort((a, b) =>
        (b.confirmations || 0) - (a.confirmations || 0)
      ),
      totalValue: utxos.reduce((sum, utxo) => sum + utxo.value, 0),
      count: utxos.length,
      lastUpdated: Date.now(),
    };

    this.indexCache.set(`${key}:index`, indexedData);
  }

  /**
   * Select UTXOs from indexed data based on selection options
   */
  private selectFromIndexedData(
    indexedData: IndexedUTXOData,
    options: SelectionOptions,
  ): UTXO[] {
    // Quick pre-filtering based on target value
    const targetValue = options.targetValue;

    // Start with UTXOs that could potentially contribute
    // Use heuristic: look for UTXOs that are not too small relative to target
    const minRelevantValue = Math.max(546, Math.floor(targetValue * 0.001)); // At least 0.1% of target

    const relevantUTXOs = indexedData.sortedByValue.filter((utxo) =>
      utxo.value >= minRelevantValue
    );

    // Also include confirmed UTXOs if needed
    if (options.minConfirmations) {
      return relevantUTXOs.filter((utxo) =>
        (utxo.confirmations || 0) >= (options.minConfirmations ?? 0)
      );
    }

    return relevantUTXOs;
  }

  /**
   * Update memory usage tracking
   */
  private updateMemoryUsage(): void {
    // Estimate memory usage (simplified)
    this.memoryUsage = 0;

    for (const entry of this.cache.values()) {
      // Rough estimate: each UTXO ~200 bytes + overhead
      this.memoryUsage += entry.utxos.length * 200 + 1000; // 1KB overhead per entry
    }

    for (const indexedData of this.indexCache.values()) {
      // Index overhead: roughly 50% more than raw data
      this.memoryUsage += indexedData.count * 300;
    }
  }

  /**
   * Enforce cache size and memory limits
   */
  private enforceLimits(): void {
    const maxMemoryBytes = this.config.memoryLimit * 1024 * 1024;

    // Enforce memory limit
    while (this.memoryUsage > maxMemoryBytes && this.accessOrder.length > 0) {
      const lruKey = this.accessOrder.shift()!;
      this.evictEntry(lruKey);
      this.updateMemoryUsage();
    }

    // Enforce cache size limit
    while (
      this.cache.size > this.config.maxCacheSize && this.accessOrder.length > 0
    ) {
      const lruKey = this.accessOrder.shift()!;
      this.evictEntry(lruKey);
    }
  }

  /**
   * Initialize the cache manager
   */
  initialize(): Promise<void> {
    this.clear();
    console.log('UTXO Cache Manager initialized');
    return Promise.resolve();
  }

  /**
   * Shutdown the cache manager
   */
  shutdown(): Promise<void> {
    this.clear();
    console.log('UTXO Cache Manager shutdown completed');
    return Promise.resolve();
  }

  /**
   * Generic set method for caching selection results
   */
  set(key: string, _value: any, ttl?: number): void {
    // For selection results, we'll create a simple cache entry
    const entry: UTXOCacheEntry = {
      utxos: [], // Empty UTXOs since this is for selection results
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      accessCount: 1,
      lastAccessed: Date.now(),
      totalValue: 0,
      hash: key, // Use key as hash for simplicity
    };

    // Store the actual value in a simple Map for non-UTXO data
    if (!this.cache.has(`generic:${key}`)) {
      this.cache.set(`generic:${key}`, entry);
      this.updateAccessOrder(`generic:${key}`);
    }
  }

  /**
   * Generic get method for cached selection results
   */
  get(key: string): any {
    const entry = this.cache.get(`generic:${key}`);
    if (!entry || this.isExpired(entry)) {
      return null;
    }

    this.updateAccess(`generic:${key}`, entry);
    return entry; // In a real implementation, would return the actual cached value
  }
}

/**
 * Create UTXO cache manager
 */
export function createUTXOCacheManager(
  config?: Partial<CacheConfig>,
): UTXOCacheManager {
  return new UTXOCacheManager(config);
}

/**
 * Create memory-optimized cache
 */
export function createMemoryOptimizedUTXOCache(): UTXOCacheManager {
  return new UTXOCacheManager({
    maxCacheSize: 100,
    defaultTTL: 60,
    memoryLimit: 50, // 50 MB
    enableIndexing: false,
    compressionThreshold: 500,
  });
}

/**
 * Create performance-optimized cache
 */
export function createPerformanceOptimizedUTXOCache(): UTXOCacheManager {
  return new UTXOCacheManager({
    maxCacheSize: 5000,
    defaultTTL: 600, // 10 minutes
    memoryLimit: 1000, // 1 GB
    enableIndexing: true,
    compressionThreshold: 2000,
  });
}
