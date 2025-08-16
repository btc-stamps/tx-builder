/**
 * ElectrumX Server Performance Monitoring and Metrics
 * Comprehensive performance tracking, scoring, and monitoring capabilities
 */

export interface ServerMetrics {
  // Basic metrics
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;

  // Response time metrics
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;

  // Connection metrics
  activeConnections: number;
  totalConnections: number;
  connectionFailures: number;

  // Health metrics
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  uptime: number;

  // Circuit breaker metrics
  circuitBreakerTrips: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  circuitBreakerOpenTime?: number;

  // Performance score (0-100)
  performanceScore: number;
  reliabilityScore: number;
  overallScore: number;

  // Timestamps
  firstRequestTime: number;
  lastRequestTime: number;
  lastHeartbeatTime: number;
}

export interface PerformanceWindow {
  windowStart: number;
  windowEnd: number;
  requestCount: number;
  successCount: number;
  averageResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
}

export interface ServerPerformanceHistory {
  serverId: string;
  windows: PerformanceWindow[];
  dailyMetrics: Map<string, ServerMetrics>; // YYYY-MM-DD -> metrics
  hourlyMetrics: Map<string, ServerMetrics>; // YYYY-MM-DD-HH -> metrics
}

/**
 * Server Performance Monitor with comprehensive metrics tracking
 */
export class ServerPerformanceMonitor {
  private metrics = new Map<string, ServerMetrics>();
  private responseTimeHistory = new Map<string, number[]>();
  private performanceHistory = new Map<string, ServerPerformanceHistory>();
  private windowSize = 5 * 60 * 1000; // 5 minute windows
  private maxHistorySize = 1000; // Keep last 1000 response times per server
  private performanceWeights = {
    responseTime: 0.4,
    reliability: 0.3,
    availability: 0.2,
    stability: 0.1,
  };

  /**
   * Initialize metrics for a server
   */
  initializeServer(serverId: string): void {
    if (!this.metrics.has(serverId)) {
      const now = Date.now();
      this.metrics.set(serverId, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        activeConnections: 0,
        totalConnections: 0,
        connectionFailures: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastFailureTime: 0,
        lastSuccessTime: 0,
        uptime: 0,
        circuitBreakerTrips: 0,
        circuitBreakerState: 'closed',
        performanceScore: 100,
        reliabilityScore: 100,
        overallScore: 100,
        firstRequestTime: now,
        lastRequestTime: 0,
        lastHeartbeatTime: now,
      });

      this.responseTimeHistory.set(serverId, []);
      this.performanceHistory.set(serverId, {
        serverId,
        windows: [],
        dailyMetrics: new Map(),
        hourlyMetrics: new Map(),
      });
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(serverId: string, responseTime: number): void {
    this.initializeServer(serverId);
    const metrics = this.metrics.get(serverId)!;
    const now = Date.now();

    // Update basic metrics
    metrics.totalRequests++;
    metrics.successfulRequests++;
    metrics.consecutiveSuccesses++;
    metrics.consecutiveFailures = 0;
    metrics.lastSuccessTime = now;
    metrics.lastRequestTime = now;
    metrics.lastHeartbeatTime = now;

    // Update response time metrics
    this.updateResponseTimeMetrics(serverId, responseTime);

    // Update performance scores
    this.updatePerformanceScores(serverId);

    // Update performance history
    this.updatePerformanceHistory(serverId, true, responseTime);
  }

  /**
   * Record a failed request
   */
  recordFailure(serverId: string, _errorType?: string): void {
    this.initializeServer(serverId);
    const metrics = this.metrics.get(serverId)!;
    const now = Date.now();

    // Update basic metrics
    metrics.totalRequests++;
    metrics.failedRequests++;
    metrics.consecutiveFailures++;
    metrics.consecutiveSuccesses = 0;
    metrics.lastFailureTime = now;
    metrics.lastRequestTime = now;

    // Update performance scores
    this.updatePerformanceScores(serverId);

    // Update performance history
    this.updatePerformanceHistory(serverId, false);
  }

  /**
   * Record circuit breaker trip
   */
  recordCircuitBreakerTrip(
    serverId: string,
    state: 'open' | 'half-open' | 'closed',
  ): void {
    this.initializeServer(serverId);
    const metrics = this.metrics.get(serverId)!;

    const previousState = metrics.circuitBreakerState;
    metrics.circuitBreakerState = state;

    if (state === 'open' && previousState !== 'open') {
      metrics.circuitBreakerTrips++;
      metrics.circuitBreakerOpenTime = Date.now();
    }

    if (state === 'closed') {
      metrics.circuitBreakerOpenTime = undefined;
    }
  }

  /**
   * Update connection metrics
   */
  updateConnectionMetrics(
    serverId: string,
    active: number,
    total: number,
    failures: number,
  ): void {
    this.initializeServer(serverId);
    const metrics = this.metrics.get(serverId)!;

    metrics.activeConnections = active;
    metrics.totalConnections = total;
    metrics.connectionFailures = failures;
  }

  /**
   * Update response time metrics with percentiles
   */
  private updateResponseTimeMetrics(
    serverId: string,
    responseTime: number,
  ): void {
    const metrics = this.metrics.get(serverId)!;
    const history = this.responseTimeHistory.get(serverId)!;

    // Add to history
    history.push(responseTime);

    // Limit history size
    if (history.length > this.maxHistorySize) {
      history.shift();
    }

    // Calculate statistics
    const sorted = [...history].sort((a, b) => a - b);
    const count = sorted.length;

    if (count > 0) {
      metrics.minResponseTime = sorted[0] ?? 0;
      metrics.maxResponseTime = sorted[count - 1] ?? 0;
      metrics.averageResponseTime = history.reduce((sum, time) => sum + time, 0) / count;

      // Calculate percentiles
      metrics.p50ResponseTime = this.calculatePercentile(sorted, 50);
      metrics.p95ResponseTime = this.calculatePercentile(sorted, 95);
      metrics.p99ResponseTime = this.calculatePercentile(sorted, 99);
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(
    sortedArray: number[],
    percentile: number,
  ): number {
    if (sortedArray.length === 0) return 0;

    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedArray[lower] ?? 0;
    }

    const weight = index - lower;
    return (sortedArray[lower] ?? 0) * (1 - weight) +
      (sortedArray[upper] ?? 0) * weight;
  }

  /**
   * Update comprehensive performance scores
   */
  private updatePerformanceScores(serverId: string): void {
    const metrics = this.metrics.get(serverId)!;

    // Calculate reliability score (success rate)
    const reliabilityScore = metrics.totalRequests > 0
      ? (metrics.successfulRequests / metrics.totalRequests) * 100
      : 100;

    // Calculate performance score (based on response time)
    let performanceScore = 100;
    if (metrics.averageResponseTime > 0) {
      // Penalize high response times with more aggressive scaling for better test discrimination
      if (metrics.averageResponseTime <= 100) {
        // Fast responses (0-100ms) get near-perfect scores (90-100)
        performanceScore = Math.max(
          90,
          100 - (metrics.averageResponseTime / 10),
        );
      } else if (metrics.averageResponseTime <= 1000) {
        // Medium responses (100-1000ms) get good scores (50-90)
        performanceScore = Math.max(
          50,
          90 - ((metrics.averageResponseTime - 100) / 22.5),
        );
      } else {
        // Slow responses (>1000ms) get poor scores (0-50)
        const slowFactor = Math.max(
          0,
          50 - ((metrics.averageResponseTime - 1000) / 100),
        );
        performanceScore = Math.max(0, slowFactor);
      }
      performanceScore = Math.round(performanceScore);
    }

    // Calculate availability score (based on uptime and circuit breaker)
    let availabilityScore = 100;
    const now = Date.now();

    if (metrics.circuitBreakerState === 'open') {
      availabilityScore = 0;
    } else if (metrics.circuitBreakerState === 'half-open') {
      availabilityScore = 50;
    } else if (metrics.lastFailureTime > 0) {
      // Reduce availability score based on recent failures
      const timeSinceFailure = now - metrics.lastFailureTime;
      const failurePenalty = Math.max(
        0,
        100 - (metrics.consecutiveFailures * 10),
      );
      const timeRecovery = Math.min(1, timeSinceFailure / (5 * 60 * 1000)); // 5 minute recovery
      availabilityScore = Math.round(
        failurePenalty * timeRecovery + (1 - timeRecovery) * 50,
      );
    }

    // Calculate stability score (based on variance and circuit breaker trips)
    let stabilityScore = 100;
    if (metrics.circuitBreakerTrips > 0) {
      stabilityScore = Math.max(0, 100 - (metrics.circuitBreakerTrips * 20));
    }

    // Apply consecutive failure penalty to stability
    if (metrics.consecutiveFailures > 0) {
      const failurePenalty = Math.min(50, metrics.consecutiveFailures * 10);
      stabilityScore = Math.max(0, stabilityScore - failurePenalty);
    }

    // Calculate overall weighted score
    const overallScore = Math.round(
      performanceScore * this.performanceWeights.responseTime +
        reliabilityScore * this.performanceWeights.reliability +
        availabilityScore * this.performanceWeights.availability +
        stabilityScore * this.performanceWeights.stability,
    );

    // Update metrics
    metrics.performanceScore = Math.round(performanceScore);
    metrics.reliabilityScore = Math.round(reliabilityScore);
    metrics.overallScore = Math.max(0, Math.min(100, overallScore));

    // Update uptime calculation
    if (metrics.firstRequestTime > 0) {
      const totalTime = now - metrics.firstRequestTime;
      const downtime = metrics.circuitBreakerOpenTime ? (now - metrics.circuitBreakerOpenTime) : 0;
      metrics.uptime = totalTime > 0 ? ((totalTime - downtime) / totalTime) * 100 : 100;
    }
  }

  /**
   * Update performance history windows
   */
  private updatePerformanceHistory(
    serverId: string,
    success: boolean,
    responseTime?: number,
  ): void {
    const history = this.performanceHistory.get(serverId)!;
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowSize) * this.windowSize;

    // Find or create current window
    let currentWindow = history.windows.find((w) => w.windowStart === windowStart);
    if (!currentWindow) {
      currentWindow = {
        windowStart,
        windowEnd: windowStart + this.windowSize,
        requestCount: 0,
        successCount: 0,
        averageResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: responseTime || 0,
      };
      history.windows.push(currentWindow);

      // Limit window history (keep last 288 windows = 24 hours with 5-minute windows)
      if (history.windows.length > 288) {
        history.windows.shift();
      }
    }

    // Update window metrics
    currentWindow.requestCount++;
    if (success) {
      currentWindow.successCount++;
    }

    if (responseTime !== undefined) {
      if (currentWindow.maxResponseTime === 0) {
        currentWindow.maxResponseTime = responseTime;
        currentWindow.minResponseTime = responseTime;
        currentWindow.averageResponseTime = responseTime;
      } else {
        currentWindow.maxResponseTime = Math.max(
          currentWindow.maxResponseTime,
          responseTime,
        );
        currentWindow.minResponseTime = Math.min(
          currentWindow.minResponseTime,
          responseTime,
        );

        // Update running average
        const totalRequests = currentWindow.requestCount;
        const oldAverage = currentWindow.averageResponseTime;
        currentWindow.averageResponseTime = (oldAverage * (totalRequests - 1) + responseTime) /
          totalRequests;
      }
    }

    // Update daily and hourly aggregates
    this.updateTimeBasedMetrics(serverId, now);
  }

  /**
   * Update daily and hourly aggregated metrics
   */
  private updateTimeBasedMetrics(serverId: string, timestamp: number): void {
    const history = this.performanceHistory.get(serverId)!;
    const metrics = this.metrics.get(serverId)!;
    const date = new Date(timestamp);

    // Daily key: YYYY-MM-DD
    const dailyKey = date.toISOString().split('T')[0]!;

    // Hourly key: YYYY-MM-DD-HH
    const hourlyKey = `${dailyKey}-${date.getHours().toString().padStart(2, '0')}`;

    // Update daily metrics - metrics should always exist since we initialize servers
    if (!metrics) {
      throw new Error(`Metrics not found for server ${serverId}`);
    }

    const safeMetrics = metrics;

    if (!history.dailyMetrics.has(dailyKey)) {
      history.dailyMetrics.set(dailyKey, { ...safeMetrics });
    } else {
      // Aggregate daily metrics
      const dailyMetrics = history.dailyMetrics.get(dailyKey);
      if (dailyMetrics) {
        this.aggregateMetrics(dailyMetrics, safeMetrics);
      }
    }

    // Update hourly metrics
    if (!history.hourlyMetrics.has(hourlyKey)) {
      history.hourlyMetrics.set(hourlyKey, { ...safeMetrics });
    } else {
      // Aggregate hourly metrics
      const hourlyMetrics = history.hourlyMetrics.get(hourlyKey);
      if (hourlyMetrics) {
        this.aggregateMetrics(hourlyMetrics, safeMetrics);
      }
    }

    // Cleanup old metrics (keep last 30 days)
    this.cleanupOldMetrics(history, 30);
  }

  /**
   * Aggregate metrics from source into target
   */
  private aggregateMetrics(target: ServerMetrics, source: ServerMetrics): void {
    // Simple aggregation - in production, you might want more sophisticated aggregation
    target.totalRequests = source.totalRequests;
    target.successfulRequests = source.successfulRequests;
    target.failedRequests = source.failedRequests;
    target.averageResponseTime = source.averageResponseTime;
    target.overallScore = source.overallScore;
    target.lastRequestTime = Math.max(
      target.lastRequestTime,
      source.lastRequestTime,
    );
  }

  /**
   * Clean up old metrics to prevent memory bloat
   */
  private cleanupOldMetrics(
    history: ServerPerformanceHistory,
    retentionDays: number,
  ): void {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const cutoffDate = new Date(cutoffTime).toISOString().split('T')[0];

    if (cutoffDate) {
      // Clean daily metrics
      for (const [key] of history.dailyMetrics) {
        if (key < cutoffDate) {
          history.dailyMetrics.delete(key);
        }
      }
    }

    // Clean hourly metrics (more aggressive - keep only last 7 days)
    const hourlyRetentionDate = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000))
      .toISOString().split('T')[0];

    if (hourlyRetentionDate) {
      for (const [key] of history.hourlyMetrics) {
        if (key.split('-').slice(0, 3).join('-') < hourlyRetentionDate) {
          history.hourlyMetrics.delete(key);
        }
      }
    }
  }

  /**
   * Get current metrics for a server
   */
  getMetrics(serverId: string): ServerMetrics | null {
    const metrics = this.metrics.get(serverId);
    if (!metrics) return null;

    // Return a copy to prevent mutations affecting previously returned references
    return { ...metrics };
  }

  /**
   * Get metrics for all servers
   */
  getAllMetrics(): Map<string, ServerMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Get performance history for a server
   */
  getPerformanceHistory(serverId: string): ServerPerformanceHistory | null {
    return this.performanceHistory.get(serverId) || null;
  }

  /**
   * Get servers ranked by overall performance score
   */
  getRankedServers(): Array<{ serverId: string; metrics: ServerMetrics }> {
    return Array.from(this.metrics.entries())
      .map(([serverId, metrics]) => ({ serverId, metrics }))
      .sort((a, b) => b.metrics.overallScore - a.metrics.overallScore);
  }

  /**
   * Get servers that meet minimum performance criteria
   */
  getHealthyServers(
    minScore = 70,
  ): Array<{ serverId: string; metrics: ServerMetrics }> {
    return this.getRankedServers()
      .filter(({ metrics }) =>
        metrics.overallScore >= minScore &&
        metrics.circuitBreakerState === 'closed'
      );
  }

  /**
   * Get performance summary statistics
   */
  getPerformanceSummary(): {
    totalServers: number;
    healthyServers: number;
    averageScore: number;
    totalRequests: number;
    totalSuccessfulRequests: number;
    overallSuccessRate: number;
    averageResponseTime: number;
    circuitBreakersOpen: number;
  } {
    const allMetrics = Array.from(this.metrics.values());

    if (allMetrics.length === 0) {
      return {
        totalServers: 0,
        healthyServers: 0,
        averageScore: 0,
        totalRequests: 0,
        totalSuccessfulRequests: 0,
        overallSuccessRate: 0,
        averageResponseTime: 0,
        circuitBreakersOpen: 0,
      };
    }

    const totalRequests = allMetrics.reduce(
      (sum, m) => sum + m.totalRequests,
      0,
    );
    const totalSuccessfulRequests = allMetrics.reduce(
      (sum, m) => sum + m.successfulRequests,
      0,
    );
    const averageScore = allMetrics.reduce((sum, m) => sum + m.overallScore, 0) /
      allMetrics.length;
    const averageResponseTime = allMetrics
      .filter((m) => m.averageResponseTime > 0)
      .reduce((sum, m) => sum + m.averageResponseTime, 0) /
      Math.max(1, allMetrics.filter((m) => m.averageResponseTime > 0).length);

    return {
      totalServers: allMetrics.length,
      healthyServers:
        allMetrics.filter((m) => m.overallScore >= 70 && m.circuitBreakerState === 'closed').length,
      averageScore: Math.round(averageScore),
      totalRequests,
      totalSuccessfulRequests,
      overallSuccessRate: totalRequests > 0 ? (totalSuccessfulRequests / totalRequests) * 100 : 0,
      averageResponseTime: Math.round(averageResponseTime),
      circuitBreakersOpen: allMetrics.filter((m) => m.circuitBreakerState === 'open').length,
    };
  }

  /**
   * Reset metrics for a server
   */
  resetServerMetrics(serverId: string): void {
    this.metrics.delete(serverId);
    this.responseTimeHistory.delete(serverId);
    this.performanceHistory.delete(serverId);
  }

  /**
   * Reset all metrics
   */
  resetAllMetrics(): void {
    this.metrics.clear();
    this.responseTimeHistory.clear();
    this.performanceHistory.clear();
  }
}
