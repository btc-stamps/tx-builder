/**
 * ElectrumX Rate Limiter
 * Implements rate limiting, request throttling, and exponential backoff
 */

import {
  clearIntervalCompat,
  setIntervalCompat,
  type TimerId,
} from '../utils/timer-utils.ts';

export interface RateLimitConfig {
  maxRequestsPerSecond: number;
  maxRequestsPerMinute: number;
  maxConcurrentRequests: number;
  backoffMultiplier: number;
  maxBackoffDelay: number;
  baseBackoffDelay: number;
  resetWindowMs: number;
}

interface RequestInfo {
  timestamp: number;
  serverKey: string;
  method: string;
  duration?: number;
  success: boolean;
}

interface ServerLimits {
  requestsThisSecond: number;
  requestsThisMinute: number;
  concurrentRequests: number;
  lastSecondReset: number;
  lastMinuteReset: number;
  consecutiveFailures: number;
  backoffDelay: number;
  nextAllowedRequest: number;
}

/**
 * Advanced rate limiter for ElectrumX requests with per-server tracking
 */
export class ElectrumXRateLimiter {
  private config: Required<RateLimitConfig>;
  private serverLimits = new Map<string, ServerLimits>();
  private requestHistory: RequestInfo[] = [];
  private cleanupTimer: TimerId | null = null;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxRequestsPerSecond: 10,
      maxRequestsPerMinute: 300,
      maxConcurrentRequests: 5,
      backoffMultiplier: 2,
      maxBackoffDelay: 30000, // 30 seconds
      baseBackoffDelay: 1000, // 1 second
      resetWindowMs: 60000, // 1 minute
      ...config,
    };

    this.startCleanup();
  }

  /**
   * Check if request should be allowed and get delay if needed
   */
  checkRateLimit(
    serverKey: string,
    _method: string, // Required by interface: method
  ): { allowed: boolean; delayMs?: number; reason?: string } {
    const limits = this.getOrCreateServerLimits(serverKey);
    const now = Date.now();

    // Update counters if reset windows have passed
    this.updateCounters(limits, now);

    // Check if we're in backoff period
    if (now < limits.nextAllowedRequest) {
      return {
        allowed: false,
        delayMs: limits.nextAllowedRequest - now,
        reason: `Backoff delay active (${limits.consecutiveFailures} consecutive failures)`,
      };
    }

    // Check concurrent requests limit
    if (limits.concurrentRequests >= this.config.maxConcurrentRequests) {
      return {
        allowed: false,
        delayMs: 100, // Short delay
        reason:
          `Too many concurrent requests (${limits.concurrentRequests}/${this.config.maxConcurrentRequests})`,
      };
    }

    // Check per-second limit
    if (limits.requestsThisSecond >= this.config.maxRequestsPerSecond) {
      const delayUntilNextSecond = 1000 - (now - limits.lastSecondReset);
      return {
        allowed: false,
        delayMs: delayUntilNextSecond,
        reason:
          `Rate limit exceeded: ${limits.requestsThisSecond}/${this.config.maxRequestsPerSecond} per second`,
      };
    }

    // Check per-minute limit
    if (limits.requestsThisMinute >= this.config.maxRequestsPerMinute) {
      const delayUntilNextMinute = 60000 - (now - limits.lastMinuteReset);
      return {
        allowed: false,
        delayMs: delayUntilNextMinute,
        reason:
          `Rate limit exceeded: ${limits.requestsThisMinute}/${this.config.maxRequestsPerMinute} per minute`,
      };
    }

    // Request allowed - increment counters
    limits.requestsThisSecond++;
    limits.requestsThisMinute++;
    limits.concurrentRequests++;

    return { allowed: true };
  }

  /**
   * Record request start
   */
  recordRequestStart(serverKey: string, method: string): string {
    const requestId = `${Date.now()}-${Math.random()}`;

    this.requestHistory.push({
      timestamp: Date.now(),
      serverKey,
      method,
      success: true, // Will be updated on completion
    });

    return requestId;
  }

  /**
   * Record request completion
   */
  recordRequestComplete(
    serverKey: string,
    method: string,
    success: boolean,
    duration: number,
  ): void {
    const limits = this.serverLimits.get(serverKey);
    if (limits) {
      limits.concurrentRequests = Math.max(0, limits.concurrentRequests - 1);

      if (success) {
        // Reset backoff on success
        limits.consecutiveFailures = 0;
        limits.backoffDelay = this.config.baseBackoffDelay;
        limits.nextAllowedRequest = 0;
      } else {
        // Increase backoff on failure
        limits.consecutiveFailures++;
        limits.backoffDelay = Math.min(
          limits.backoffDelay * this.config.backoffMultiplier,
          this.config.maxBackoffDelay,
        );
        limits.nextAllowedRequest = Date.now() + limits.backoffDelay;
      }
    }

    // Update request history
    const recent = this.requestHistory.find(
      (req) =>
        req.serverKey === serverKey &&
        req.method === method &&
        !req.duration &&
        Date.now() - req.timestamp < 60000, // Within last minute
    );

    if (recent) {
      recent.duration = duration;
      recent.success = success;
    }
  }

  /**
   * Execute request with rate limiting
   */
  async executeWithRateLimit<T>(
    serverKey: string,
    method: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    while (true) {
      const rateCheck = this.checkRateLimit(serverKey, method);

      if (!rateCheck.allowed) {
        if (rateCheck.delayMs && rateCheck.delayMs > 0) {
          await this.sleep(rateCheck.delayMs);
          continue; // Try again after delay
        } else {
          throw new Error(`Rate limit exceeded: ${rateCheck.reason}`);
        }
      }

      break; // Rate limit check passed
    }

    const startTime = Date.now();
    this.recordRequestStart(serverKey, method);

    try {
      const result = await fn();
      this.recordRequestComplete(
        serverKey,
        method,
        true,
        Date.now() - startTime,
      );
      return result;
    } catch (error) {
      this.recordRequestComplete(
        serverKey,
        method,
        false,
        Date.now() - startTime,
      );
      throw error;
    }
  }

  /**
   * Get or create server limits
   */
  private getOrCreateServerLimits(serverKey: string): ServerLimits {
    if (!this.serverLimits.has(serverKey)) {
      const now = Date.now();
      this.serverLimits.set(serverKey, {
        requestsThisSecond: 0,
        requestsThisMinute: 0,
        concurrentRequests: 0,
        lastSecondReset: now,
        lastMinuteReset: now,
        consecutiveFailures: 0,
        backoffDelay: this.config.baseBackoffDelay,
        nextAllowedRequest: 0,
      });
    }
    return this.serverLimits.get(serverKey)!;
  }

  /**
   * Update rate limit counters
   */
  private updateCounters(limits: ServerLimits, now: number): void {
    // Reset second counter if needed
    if (now - limits.lastSecondReset >= 1000) {
      limits.requestsThisSecond = 0;
      limits.lastSecondReset = now;
    }

    // Reset minute counter if needed
    if (now - limits.lastMinuteReset >= 60000) {
      limits.requestsThisMinute = 0;
      limits.lastMinuteReset = now;
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanup(): void {
    this.cleanupTimer = setIntervalCompat(() => {
      this.cleanupHistory();
    }, this.config.resetWindowMs);
  }

  /**
   * Clean up old request history
   */
  private cleanupHistory(): void {
    const cutoff = Date.now() - this.config.resetWindowMs;
    this.requestHistory = this.requestHistory.filter((req) => req.timestamp > cutoff);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get rate limiting statistics
   */
  getStats(): {
    servers: Array<{
      serverKey: string;
      requestsThisSecond: number;
      requestsThisMinute: number;
      concurrentRequests: number;
      consecutiveFailures: number;
      backoffDelay: number;
      nextAllowedRequest: number;
    }>;
    recentRequests: {
      total: number;
      successful: number;
      failed: number;
      averageDuration: number;
      byMethod: Record<string, number>;
    };
  } {
    const servers = Array.from(this.serverLimits.entries()).map((
      [serverKey, limits],
    ) => ({
      serverKey,
      ...limits,
    }));

    const recentRequests = this.requestHistory.filter((req) => req.duration !== undefined);
    const successful = recentRequests.filter((req) => req.success).length;
    const failed = recentRequests.length - successful;

    const averageDuration = recentRequests.length > 0
      ? recentRequests.reduce((sum, req) => sum + (req.duration || 0), 0) /
        recentRequests.length
      : 0;

    const byMethod: Record<string, number> = {};
    for (const req of recentRequests) {
      byMethod[req.method] = (byMethod[req.method] || 0) + 1;
    }

    return {
      servers,
      recentRequests: {
        total: recentRequests.length,
        successful,
        failed,
        averageDuration,
        byMethod,
      },
    };
  }

  /**
   * Reset rate limits for a server (use carefully)
   */
  resetServerLimits(serverKey: string): void {
    const limits = this.serverLimits.get(serverKey);
    if (limits) {
      const now = Date.now();
      limits.requestsThisSecond = 0;
      limits.requestsThisMinute = 0;
      limits.concurrentRequests = 0;
      limits.lastSecondReset = now;
      limits.lastMinuteReset = now;
      limits.consecutiveFailures = 0;
      limits.backoffDelay = this.config.baseBackoffDelay;
      limits.nextAllowedRequest = 0;
    }
  }

  /**
   * Reset all rate limits (use carefully)
   */
  resetAllLimits(): void {
    for (const serverKey of this.serverLimits.keys()) {
      this.resetServerLimits(serverKey);
    }
    this.requestHistory = [];
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Shutdown rate limiter
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.serverLimits.clear();
    this.requestHistory = [];
  }
}

/**
 * Create rate limiter with sensible defaults
 */
export function createElectrumXRateLimiter(
  config?: Partial<RateLimitConfig>,
): ElectrumXRateLimiter {
  return new ElectrumXRateLimiter(config);
}

/**
 * Create conservative rate limiter (fewer requests, longer backoff)
 */
export function createConservativeRateLimiter(): ElectrumXRateLimiter {
  return new ElectrumXRateLimiter({
    maxRequestsPerSecond: 5,
    maxRequestsPerMinute: 150,
    maxConcurrentRequests: 3,
    backoffMultiplier: 3,
    maxBackoffDelay: 60000, // 1 minute
    baseBackoffDelay: 2000, // 2 seconds
  });
}

/**
 * Create aggressive rate limiter (more requests, shorter backoff)
 */
export function createAggressiveRateLimiter(): ElectrumXRateLimiter {
  return new ElectrumXRateLimiter({
    maxRequestsPerSecond: 20,
    maxRequestsPerMinute: 600,
    maxConcurrentRequests: 10,
    backoffMultiplier: 1.5,
    maxBackoffDelay: 15000, // 15 seconds
    baseBackoffDelay: 500, // 500ms
  });
}
