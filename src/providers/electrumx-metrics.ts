/**
 * ElectrumX Performance Metrics
 * Comprehensive monitoring and metrics collection for ElectrumX operations
 */

import {
  clearIntervalCompat as _clearIntervalCompat,
  setIntervalCompat,
  type TimerId,
} from '../utils/timer-utils.ts';

export interface MetricsSample {
  timestamp: number;
  value: number;
  metadata?: Record<string, any>;
}

export interface RequestMetrics {
  method: string;
  serverKey: string;
  duration: number;
  success: boolean;
  error?: string;
  timestamp: number;
  cacheHit?: boolean;
  retryCount?: number;
}

export interface PerformanceStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
  cacheHitRate: number;
  byMethod: Record<
    string,
    {
      count: number;
      successRate: number;
      averageTime: number;
    }
  >;
  byServer: Record<
    string,
    {
      count: number;
      successRate: number;
      averageTime: number;
      isHealthy: boolean;
    }
  >;
}

export interface MetricsConfig {
  retentionPeriodMs: number;
  sampleIntervalMs: number;
  enableDetailed: boolean;
  maxSamples: number;
}

/**
 * Advanced metrics collection and analysis system
 */
export class ElectrumXMetrics {
  private requestHistory: RequestMetrics[] = [];
  private responseTimes: number[] = [];
  private errorRates: MetricsSample[] = [];
  private throughputSamples: MetricsSample[] = [];
  private cacheHitRates: MetricsSample[] = [];
  private config: Required<MetricsConfig>;
  private metricsTimer: TimerId | null = null;
  private startTime = Date.now();

  constructor(config?: Partial<MetricsConfig>) {
    this.config = {
      retentionPeriodMs: 24 * 60 * 60 * 1000, // 24 hours
      sampleIntervalMs: 60 * 1000, // 1 minute
      enableDetailed: true,
      maxSamples: 1440, // 24 hours of minute samples
      ...config,
    };

    if (this.config.enableDetailed) {
      this.startMetricsCollection();
    }
  }

  /**
   * Record a request metric
   */
  recordRequest(metrics: RequestMetrics): void {
    this.requestHistory.push(metrics);
    this.responseTimes.push(metrics.duration);

    // Maintain maximum history size
    if (this.requestHistory.length > this.config.maxSamples * 10) {
      this.requestHistory = this.requestHistory.slice(
        -this.config.maxSamples * 5,
      );
    }

    if (this.responseTimes.length > 10000) {
      this.responseTimes = this.responseTimes.slice(-5000);
    }
  }

  /**
   * Get current performance statistics
   */
  getStats(timeRangeMs?: number): PerformanceStats {
    const cutoff = timeRangeMs ? Date.now() - timeRangeMs : 0;
    const recentRequests = this.requestHistory.filter((r) => r.timestamp > cutoff);

    if (recentRequests.length === 0) {
      return this.getEmptyStats();
    }

    const totalRequests = recentRequests.length;
    const successfulRequests = recentRequests.filter((r) => r.success).length;
    const failedRequests = totalRequests - successfulRequests;

    // Calculate response time percentiles
    const sortedTimes = recentRequests.map((r) => r.duration).sort((a, b) => a - b);

    const averageResponseTime = sortedTimes.reduce((a, b) => a + b, 0) /
      sortedTimes.length;
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);
    const p95ResponseTime = sortedTimes[p95Index] || 0;
    const p99ResponseTime = sortedTimes[p99Index] || 0;

    // Calculate requests per second
    const timeSpanMs = Math.max(
      1000,
      timeRangeMs || Date.now() - (recentRequests[0]?.timestamp || Date.now()),
    );
    const requestsPerSecond = (totalRequests * 1000) / timeSpanMs;

    // Calculate error rate
    const errorRate = totalRequests > 0 ? failedRequests / totalRequests : 0;

    // Calculate cache hit rate
    const cacheAwareRequests = recentRequests.filter((r) => r.cacheHit !== undefined);
    const cacheHits = cacheAwareRequests.filter((r) => r.cacheHit).length;
    const cacheHitRate = cacheAwareRequests.length > 0 ? cacheHits / cacheAwareRequests.length : 0;

    // Group by method
    const byMethod: PerformanceStats['byMethod'] = {};
    for (const request of recentRequests) {
      if (!byMethod[request.method]) {
        byMethod[request.method] = {
          count: 0,
          successRate: 0,
          averageTime: 0,
        };
      }

      byMethod[request.method]!.count++;
    }

    // Calculate method-specific stats
    for (const method in byMethod) {
      const methodRequests = recentRequests.filter((r) => r.method === method);
      const successfulMethodRequests = methodRequests.filter((r) => r.success);

      byMethod[method]!.successRate = successfulMethodRequests.length /
        methodRequests.length;
      byMethod[method]!.averageTime = methodRequests.reduce((sum, r) => sum + r.duration, 0) /
        methodRequests.length;
    }

    // Group by server
    const byServer: PerformanceStats['byServer'] = {};
    for (const request of recentRequests) {
      if (!byServer[request.serverKey]) {
        byServer[request.serverKey] = {
          count: 0,
          successRate: 0,
          averageTime: 0,
          isHealthy: true,
        };
      }

      byServer[request.serverKey]!.count++;
    }

    // Calculate server-specific stats
    for (const serverKey in byServer) {
      const serverRequests = recentRequests.filter((r) => r.serverKey === serverKey);
      const successfulServerRequests = serverRequests.filter((r) => r.success);

      byServer[serverKey]!.successRate = successfulServerRequests.length /
        serverRequests.length;
      byServer[serverKey]!.averageTime = serverRequests.reduce((sum, r) => sum + r.duration, 0) /
        serverRequests.length;
      byServer[serverKey]!.isHealthy = byServer[serverKey]!.successRate > 0.8; // 80% success rate threshold
    }

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      requestsPerSecond,
      errorRate,
      cacheHitRate,
      byMethod,
      byServer,
    };
  }

  /**
   * Get historical trend data
   */
  getTrendData(
    metric: 'responseTime' | 'errorRate' | 'throughput' | 'cacheHitRate',
    timeRangeMs?: number,
  ): MetricsSample[] {
    const cutoff = timeRangeMs ? Date.now() - timeRangeMs : 0;

    switch (metric) {
      case 'responseTime':
        return this.requestHistory
          .filter((r) => r.timestamp > cutoff)
          .map((r) => ({
            timestamp: r.timestamp,
            value: r.duration,
            metadata: { method: r.method, serverKey: r.serverKey },
          }));

      case 'errorRate':
        return this.errorRates.filter((s) => s.timestamp > cutoff);

      case 'throughput':
        return this.throughputSamples.filter((s) => s.timestamp > cutoff);

      case 'cacheHitRate':
        return this.cacheHitRates.filter((s) => s.timestamp > cutoff);

      default:
        return [];
    }
  }

  /**
   * Get server health scores
   */
  getServerHealthScores(timeRangeMs: number = 5 * 60 * 1000): Record<
    string,
    {
      score: number; // 0-100
      factors: {
        successRate: number;
        averageResponseTime: number;
        availability: number;
      };
      recommendation: 'healthy' | 'warning' | 'unhealthy';
    }
  > {
    const stats = this.getStats(timeRangeMs);
    const scores: Record<string, any> = {};

    for (const [serverKey, serverStats] of Object.entries(stats.byServer)) {
      // Success rate factor (0-40 points)
      const successRateScore = serverStats.successRate * 40;

      // Response time factor (0-35 points, inverted - lower is better)
      const avgResponseTime = serverStats.averageTime;
      const responseTimeScore = Math.max(0, 35 - avgResponseTime / 100); // Penalize every 100ms

      // Availability factor (0-25 points)
      const expectedRequests = stats.totalRequests /
        Object.keys(stats.byServer).length;
      const availabilityRatio = Math.min(
        1,
        serverStats.count / expectedRequests,
      );
      const availabilityScore = availabilityRatio * 25;

      const totalScore = successRateScore + responseTimeScore +
        availabilityScore;

      let recommendation: 'healthy' | 'warning' | 'unhealthy';
      if (totalScore >= 80) recommendation = 'healthy';
      else if (totalScore >= 60) recommendation = 'warning';
      else recommendation = 'unhealthy';

      scores[serverKey] = {
        score: Math.round(totalScore),
        factors: {
          successRate: serverStats.successRate,
          averageResponseTime: avgResponseTime,
          availability: availabilityRatio,
        },
        recommendation,
      };
    }

    return scores;
  }

  /**
   * Detect performance anomalies
   */
  detectAnomalies(sensitivityThreshold: number = 2): Array<{
    type:
      | 'high_error_rate'
      | 'slow_response'
      | 'low_throughput'
      | 'server_degradation';
    severity: 'low' | 'medium' | 'high';
    message: string;
    timestamp: number;
    data: any;
  }> {
    const anomalies = [];
    const recentStats = this.getStats(5 * 60 * 1000); // Last 5 minutes
    const historicalStats = this.getStats(60 * 60 * 1000); // Last hour

    // High error rate anomaly
    if (
      recentStats.errorRate >
        historicalStats.errorRate * sensitivityThreshold &&
      recentStats.errorRate > 0.1
    ) {
      anomalies.push({
        type: 'high_error_rate' as const,
        severity: recentStats.errorRate > 0.5 ? ('high' as const) : ('medium' as const),
        message: `Error rate increased to ${
          (recentStats.errorRate * 100).toFixed(
            1,
          )
        }% (historical: ${(historicalStats.errorRate * 100).toFixed(1)}%)`,
        timestamp: Date.now(),
        data: {
          current: recentStats.errorRate,
          historical: historicalStats.errorRate,
        },
      });
    }

    // Slow response anomaly
    if (
      recentStats.averageResponseTime >
        historicalStats.averageResponseTime * sensitivityThreshold &&
      recentStats.averageResponseTime > 1000
    ) {
      anomalies.push({
        type: 'slow_response' as const,
        severity: recentStats.averageResponseTime > 5000 ? ('high' as const) : ('medium' as const),
        message: `Response time increased to ${
          recentStats.averageResponseTime.toFixed(
            0,
          )
        }ms (historical: ${historicalStats.averageResponseTime.toFixed(0)}ms)`,
        timestamp: Date.now(),
        data: {
          current: recentStats.averageResponseTime,
          historical: historicalStats.averageResponseTime,
        },
      });
    }

    // Low throughput anomaly
    if (
      recentStats.requestsPerSecond <
        historicalStats.requestsPerSecond / sensitivityThreshold &&
      historicalStats.requestsPerSecond > 1
    ) {
      anomalies.push({
        type: 'low_throughput' as const,
        severity: 'medium' as const,
        message: `Throughput decreased to ${
          recentStats.requestsPerSecond.toFixed(
            2,
          )
        } req/s (historical: ${historicalStats.requestsPerSecond.toFixed(2)} req/s)`,
        timestamp: Date.now(),
        data: {
          current: recentStats.requestsPerSecond,
          historical: historicalStats.requestsPerSecond,
        },
      });
    }

    // Server degradation anomaly
    for (
      const [serverKey, serverStats] of Object.entries(recentStats.byServer)
    ) {
      if (serverStats.successRate < 0.8) {
        anomalies.push({
          type: 'server_degradation' as const,
          severity: serverStats.successRate < 0.5 ? ('high' as const) : ('medium' as const),
          message: `Server ${serverKey} success rate dropped to ${
            (
              serverStats.successRate * 100
            ).toFixed(1)
          }%`,
          timestamp: Date.now(),
          data: { serverKey, successRate: serverStats.successRate },
        });
      }
    }

    return anomalies;
  }

  /**
   * Get uptime information
   */
  getUptimeInfo(): {
    startTime: number;
    uptime: number;
    uptimeFormatted: string;
  } {
    const uptime = Date.now() - this.startTime;
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

    return {
      startTime: this.startTime,
      uptime,
      uptimeFormatted: `${hours}h ${minutes}m ${seconds}s`,
    };
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsTimer = setIntervalCompat(() => {
      this.collectPeriodicMetrics();
    }, this.config.sampleIntervalMs);
  }

  /**
   * Collect periodic metrics snapshots
   */
  private collectPeriodicMetrics(): void {
    const now = Date.now();
    const recentStats = this.getStats(this.config.sampleIntervalMs * 2);

    // Sample error rate
    this.errorRates.push({
      timestamp: now,
      value: recentStats.errorRate,
    });

    // Sample throughput
    this.throughputSamples.push({
      timestamp: now,
      value: recentStats.requestsPerSecond,
    });

    // Sample cache hit rate
    this.cacheHitRates.push({
      timestamp: now,
      value: recentStats.cacheHitRate,
    });

    // Clean up old samples
    const cutoff = now - this.config.retentionPeriodMs;
    this.errorRates = this.errorRates.filter((s) => s.timestamp > cutoff);
    this.throughputSamples = this.throughputSamples.filter((s) => s.timestamp > cutoff);
    this.cacheHitRates = this.cacheHitRates.filter((s) => s.timestamp > cutoff);

    // Limit sample arrays
    if (this.errorRates.length > this.config.maxSamples) {
      this.errorRates = this.errorRates.slice(-this.config.maxSamples);
    }
    if (this.throughputSamples.length > this.config.maxSamples) {
      this.throughputSamples = this.throughputSamples.slice(
        -this.config.maxSamples,
      );
    }
    if (this.cacheHitRates.length > this.config.maxSamples) {
      this.cacheHitRates = this.cacheHitRates.slice(-this.config.maxSamples);
    }
  }

  /**
   * Get empty stats structure
   */
  private getEmptyStats(): PerformanceStats {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      requestsPerSecond: 0,
      errorRate: 0,
      cacheHitRate: 0,
      byMethod: {},
      byServer: {},
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.requestHistory = [];
    this.responseTimes = [];
    this.errorRates = [];
    this.throughputSamples = [];
    this.cacheHitRates = [];
    this.startTime = Date.now();
  }

  /**
   * Export metrics data
   */
  export(): {
    config: MetricsConfig;
    uptime: number;
    stats: PerformanceStats;
    requestHistory: RequestMetrics[];
    trends: {
      errorRates: MetricsSample[];
      throughputSamples: MetricsSample[];
      cacheHitRates: MetricsSample[];
    };
  } {
    return {
      config: this.config,
      uptime: Date.now() - this.startTime,
      stats: this.getStats(),
      requestHistory: [...this.requestHistory],
      trends: {
        errorRates: [...this.errorRates],
        throughputSamples: [...this.throughputSamples],
        cacheHitRates: [...this.cacheHitRates],
      },
    };
  }

  /**
   * Shutdown metrics collection
   */
  shutdown(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }
}

/**
 * Create ElectrumX metrics collector
 */
export function createElectrumXMetrics(
  config?: Partial<MetricsConfig>,
): ElectrumXMetrics {
  return new ElectrumXMetrics(config);
}

/**
 * Create lightweight metrics collector (less detailed tracking)
 */
export function createLightweightMetrics(): ElectrumXMetrics {
  return new ElectrumXMetrics({
    retentionPeriodMs: 2 * 60 * 60 * 1000, // 2 hours
    sampleIntervalMs: 5 * 60 * 1000, // 5 minutes
    enableDetailed: false,
    maxSamples: 100,
  });
}

/**
 * Create comprehensive metrics collector (detailed tracking)
 */
export function createComprehensiveMetrics(): ElectrumXMetrics {
  return new ElectrumXMetrics({
    retentionPeriodMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    sampleIntervalMs: 30 * 1000, // 30 seconds
    enableDetailed: true,
    maxSamples: 20160, // 7 days of 30-second samples
  });
}
