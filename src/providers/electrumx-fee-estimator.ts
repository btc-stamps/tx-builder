/**
 * ElectrumX Fee Estimator
 * Advanced fee estimation with caching, validation, and fallback mechanisms
 */

import type { ElectrumXConnectionPool } from './electrumx-connection-pool.ts';
import type { ElectrumXProvider } from './electrumx-provider.ts';

export interface FeeEstimate {
  priority: 'economy' | 'low' | 'medium' | 'high' | 'urgent';
  confirmationTarget: number;
  feeRate: number; // sat/vB
  estimatedTime: string; // Human readable
  confidence: 'low' | 'medium' | 'high';
  source: 'electrumx' | 'fallback' | 'cached';
  timestamp: number;
}

export interface FeeEstimationOptions {
  includeFallback: boolean;
  cacheTimeout: number; // seconds
  validationThreshold: number; // maximum reasonable fee rate
  minFeeRate: number; // minimum fee rate
  maxConfirmationTarget: number;
}

interface CachedEstimate {
  estimate: FeeEstimate;
  timestamp: number;
}

/**
 * Advanced fee estimation with multiple strategies and validation
 */
export class ElectrumXFeeEstimator {
  private cache = new Map<string, CachedEstimate>();
  public readonly provider: ElectrumXProvider | ElectrumXConnectionPool;
  private options: Required<FeeEstimationOptions>;

  constructor(
    provider: ElectrumXProvider | ElectrumXConnectionPool,
    options?: Partial<FeeEstimationOptions>,
  ) {
    this.provider = provider;
    this.options = {
      includeFallback: true,
      cacheTimeout: 60, // 1 minute
      validationThreshold: 1000, // 1000 sat/vB max
      minFeeRate: 1, // 1 sat/vB min
      maxConfirmationTarget: 144, // ~24 hours
      ...options,
    };
  }

  /**
   * Get comprehensive fee estimates for all priority levels
   */
  async getAllFeeEstimates(): Promise<FeeEstimate[]> {
    const priorities: Array<{
      priority: FeeEstimate['priority'];
      target: number;
      time: string;
    }> = [
      { priority: 'urgent', target: 1, time: '~10 minutes' },
      { priority: 'high', target: 3, time: '~30 minutes' },
      { priority: 'medium', target: 6, time: '~1 hour' },
      { priority: 'low', target: 12, time: '~2 hours' },
      { priority: 'economy', target: 25, time: '~4 hours' },
    ];

    const estimates = await Promise.allSettled(
      priorities.map(async ({ priority, target, time }) => {
        try {
          return await this.getFeeEstimate(priority, target, time);
        } catch (error) {
          console.warn(`Failed to get ${priority} fee estimate:`, error);
          return this.getFallbackEstimate(priority, target, time);
        }
      }),
    );

    return estimates
      .filter(
        (result): result is PromiseFulfilledResult<FeeEstimate> => result.status === 'fulfilled',
      )
      .map((result) => result.value);
  }

  /**
   * Get fee estimate for specific priority
   */
  async getFeeEstimate(
    priority: FeeEstimate['priority'],
    confirmationTarget?: number,
    estimatedTime?: string,
  ): Promise<FeeEstimate> {
    const target = confirmationTarget || this.getDefaultTarget(priority);
    const time = estimatedTime || this.getEstimatedTime(target);
    const cacheKey = `${priority}-${target}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) {
      return { ...cached.estimate, source: 'cached' };
    }

    try {
      // Get estimate from ElectrumX
      const rawFeeRate = await this.provider.getFeeRate(
        this.mapPriorityToProviderPriority(priority),
      );

      // Validate and process the fee rate
      const feeRate = this.validateAndProcessFeeRate(rawFeeRate, priority);
      const confidence = this.calculateConfidence(feeRate, target);

      const estimate: FeeEstimate = {
        priority,
        confirmationTarget: target,
        feeRate,
        estimatedTime: time,
        confidence,
        source: 'electrumx',
        timestamp: Date.now(),
      };

      // Cache the estimate
      this.cache.set(cacheKey, {
        estimate,
        timestamp: Date.now(),
      });

      return estimate;
    } catch (error) {
      console.warn(`ElectrumX fee estimation failed for ${priority}:`, error);

      if (this.options.includeFallback) {
        return this.getFallbackEstimate(priority, target, time);
      }

      throw error;
    }
  }

  /**
   * Get optimal fee for transaction size
   */
  async getOptimalFee(
    transactionSizeBytes: number,
    priority: FeeEstimate['priority'] = 'medium',
  ): Promise<{
    totalFee: number;
    feeRate: number;
    estimate: FeeEstimate;
  }> {
    const estimate = await this.getFeeEstimate(priority);
    const totalFee = Math.ceil(transactionSizeBytes * estimate.feeRate);

    return {
      totalFee,
      feeRate: estimate.feeRate,
      estimate,
    };
  }

  /**
   * Get fee estimates from multiple confirmation targets
   */
  async getFeeRangeEstimate(
    minTarget: number = 1,
    maxTarget: number = 25,
  ): Promise<{
    estimates: Array<{
      target: number;
      feeRate: number;
      estimatedTime: string;
    }>;
    recommended: FeeEstimate;
  }> {
    const targets = this.generateTargetRange(minTarget, maxTarget);
    const estimates = [];

    for (const target of targets) {
      try {
        const priority = this.targetToPriority(target);
        const time = this.getEstimatedTime(target);
        const estimate = await this.getFeeEstimate(priority, target, time);

        estimates.push({
          target,
          feeRate: estimate.feeRate,
          estimatedTime: time,
        });
      } catch (error) {
        console.warn(`Failed to get estimate for target ${target}:`, error);
      }
    }

    // Sort by fee rate and find recommended middle ground
    estimates.sort((a, b) => b.feeRate - a.feeRate);
    const medianIndex = Math.floor(estimates.length / 2);
    const medianEstimate = estimates[medianIndex];

    const recommended = await this.getFeeEstimate(
      'medium',
      medianEstimate?.target || 6,
      medianEstimate?.estimatedTime || '~1 hour',
    );

    return { estimates, recommended };
  }

  /**
   * Validate fee rate and apply corrections
   */
  private validateAndProcessFeeRate(
    rawFeeRate: number,
    priority: FeeEstimate['priority'],
  ): number {
    let feeRate = rawFeeRate;

    // Handle negative or zero fee rates
    if (feeRate <= 0) {
      feeRate = this.getDefaultFeeRate(priority);
    }

    // Apply minimum fee rate
    feeRate = Math.max(feeRate, this.options.minFeeRate);

    // Apply maximum fee rate (protection against unreasonable rates)
    if (feeRate > this.options.validationThreshold) {
      console.warn(
        `Fee rate ${feeRate} exceeds threshold, capping at ${this.options.validationThreshold}`,
      );
      feeRate = this.options.validationThreshold;
    }

    // Apply priority-based adjustments
    feeRate = this.applyPriorityAdjustment(feeRate, priority);

    return Math.max(1, Math.round(feeRate));
  }

  /**
   * Apply priority-based fee rate adjustments
   */
  private applyPriorityAdjustment(
    baseFeeRate: number,
    priority: FeeEstimate['priority'],
  ): number {
    const multipliers = {
      economy: 0.5,
      low: 0.8,
      medium: 1.0,
      high: 1.5,
      urgent: 2.0,
    };

    return baseFeeRate * multipliers[priority];
  }

  /**
   * Calculate confidence level based on fee rate and target
   */
  private calculateConfidence(
    feeRate: number,
    confirmationTarget: number,
  ): FeeEstimate['confidence'] {
    // Simple heuristic: higher fee rates and lower targets = higher confidence
    const feeScore = Math.min(feeRate / 50, 1); // Normalize around 50 sat/vB
    const targetScore = Math.max(0, 1 - (confirmationTarget - 1) / 24); // Lower target = higher score
    const combinedScore = (feeScore + targetScore) / 2;

    if (combinedScore > 0.7) return 'high';
    if (combinedScore > 0.4) return 'medium';
    return 'low';
  }

  /**
   * Get fallback estimate when ElectrumX is unavailable
   */
  private getFallbackEstimate(
    priority: FeeEstimate['priority'],
    confirmationTarget: number,
    estimatedTime: string,
  ): FeeEstimate {
    const fallbackRates = {
      economy: 2,
      low: 5,
      medium: 15,
      high: 30,
      urgent: 50,
    };

    return {
      priority,
      confirmationTarget,
      feeRate: fallbackRates[priority],
      estimatedTime,
      confidence: 'low',
      source: 'fallback',
      timestamp: Date.now(),
    };
  }

  /**
   * Map priority to provider priority format
   */
  private mapPriorityToProviderPriority(
    priority: FeeEstimate['priority'],
  ): 'low' | 'medium' | 'high' {
    switch (priority) {
      case 'economy':
      case 'low':
        return 'low';
      case 'high':
      case 'urgent':
        return 'high';
      default:
        return 'medium';
    }
  }

  /**
   * Get default confirmation target for priority
   */
  private getDefaultTarget(priority: FeeEstimate['priority']): number {
    const targets = {
      urgent: 1,
      high: 3,
      medium: 6,
      low: 12,
      economy: 25,
    };

    return targets[priority];
  }

  /**
   * Get default fee rate for priority (fallback)
   */
  private getDefaultFeeRate(priority: FeeEstimate['priority']): number {
    const rates = {
      urgent: 50,
      high: 30,
      medium: 15,
      low: 5,
      economy: 2,
    };

    return rates[priority];
  }

  /**
   * Convert confirmation target to priority
   */
  private targetToPriority(target: number): FeeEstimate['priority'] {
    if (target <= 1) return 'urgent';
    if (target <= 3) return 'high';
    if (target <= 6) return 'medium';
    if (target <= 12) return 'low';
    return 'economy';
  }

  /**
   * Get estimated confirmation time for target
   */
  private getEstimatedTime(confirmationTarget: number): string {
    const minutes = confirmationTarget * 10; // ~10 minutes per block

    if (minutes < 60) {
      return `~${minutes} minutes`;
    }

    const hours = Math.round(minutes / 60);
    return `~${hours} hour${hours === 1 ? '' : 's'}`;
  }

  /**
   * Generate range of confirmation targets
   */
  private generateTargetRange(min: number, max: number): number[] {
    const targets = [1, 2, 3, 6, 12, 25, 50, 100, 144];
    return targets.filter((t) => t >= min && t <= max);
  }

  /**
   * Check if cached estimate is still valid
   */
  private isCacheValid(timestamp: number): boolean {
    return (Date.now() - timestamp) / 1000 < this.options.cacheTimeout;
  }

  /**
   * Clear expired cache entries
   */
  private cleanupCache(): void {
    const _now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (!this.isCacheValid(cached.timestamp)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    entries: Array<{
      key: string;
      age: number;
      priority: string;
      feeRate: number;
    }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, cached]) => ({
      key,
      age: (Date.now() - cached.timestamp) / 1000,
      priority: cached.estimate.priority,
      feeRate: cached.estimate.feeRate,
    }));

    return {
      size: this.cache.size,
      hitRate: 0, // Would need request tracking to calculate this
      entries,
    };
  }

  /**
   * Clear all cached estimates
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Update estimation options
   */
  updateOptions(newOptions: Partial<FeeEstimationOptions>): void {
    this.options = { ...this.options, ...newOptions };
    this.clearCache(); // Clear cache when options change
  }

  /**
   * Export current fee estimates
   */
  async exportFeeEstimates(): Promise<{
    timestamp: number;
    estimates: FeeEstimate[];
    metadata: {
      provider: string;
      cacheSize: number;
      options: FeeEstimationOptions;
    };
  }> {
    const estimates = await this.getAllFeeEstimates();

    return {
      timestamp: Date.now(),
      estimates,
      metadata: {
        provider: 'electrumx',
        cacheSize: this.cache.size,
        options: this.options,
      },
    };
  }

  /**
   * Shutdown fee estimator
   */
  shutdown(): void {
    this.clearCache();
  }
}

/**
 * Create ElectrumX fee estimator with default configuration
 */
export function createElectrumXFeeEstimator(
  provider: ElectrumXProvider | ElectrumXConnectionPool,
  options?: Partial<FeeEstimationOptions>,
): ElectrumXFeeEstimator {
  return new ElectrumXFeeEstimator(provider, options);
}

/**
 * Create conservative fee estimator (longer cache, higher minimums)
 */
export function createConservativeFeeEstimator(
  provider: ElectrumXProvider | ElectrumXConnectionPool,
): ElectrumXFeeEstimator {
  return new ElectrumXFeeEstimator(provider, {
    includeFallback: true,
    cacheTimeout: 300, // 5 minutes
    validationThreshold: 500, // Lower max
    minFeeRate: 2, // Higher minimum
    maxConfirmationTarget: 50,
  });
}

/**
 * Create aggressive fee estimator (shorter cache, lower minimums)
 */
export function createAggressiveFeeEstimator(
  provider: ElectrumXProvider | ElectrumXConnectionPool,
): ElectrumXFeeEstimator {
  return new ElectrumXFeeEstimator(provider, {
    includeFallback: true,
    cacheTimeout: 30, // 30 seconds
    validationThreshold: 2000, // Higher max
    minFeeRate: 1, // Lower minimum
    maxConfirmationTarget: 144,
  });
}
