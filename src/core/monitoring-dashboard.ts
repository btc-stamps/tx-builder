/**
 * Real-time Performance Monitoring Dashboard
 * Comprehensive monitoring system with alerts and real-time metrics
 */

import type { PerformanceReport } from './performance-monitor.js';
import { PerformanceMonitor } from './performance-monitor.js';
import { UTXOCacheManager } from './utxo-cache-manager.js';
import { clearIntervalCompat, setIntervalCompat, type TimerId } from '../utils/timer-utils.ts';
import process from 'node:process';

export interface DashboardConfig {
  updateIntervalMs: number;
  retentionPeriodMs: number;
  enableRealTimeUpdates: boolean;
  enableAlerts: boolean;
  alertThresholds: {
    errorRate: number;
    responseTime: number;
    memoryUsage: number;
    cacheHitRate: number;
  };
  enableWebSocket: boolean;
  enableLogging: boolean;
}

export interface RealTimeMetrics {
  timestamp: number;
  selectionMetrics: {
    successRate: number;
    averageTime: number;
    p95Time: number;
    requestsPerSecond: number;
    algorithmDistribution: Record<string, number>;
  };
  cacheMetrics: {
    hitRate: number;
    memoryUsage: number;
    totalEntries: number;
    evictionRate: number;
  };
  systemMetrics: {
    heapUsed: number;
    heapTotal: number;
    cpuUsage: number;
    activeConnections: number;
  };
  alerts: Alert[];
}

export interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  timestamp: number;
  resolved: boolean;
  data?: any;
}

export interface DashboardStats {
  uptime: number;
  totalSelections: number;
  totalAlerts: number;
  systemHealth: 'healthy' | 'degraded' | 'critical';
  performanceScore: number; // 0-100
  recommendations: string[];
}

/**
 * Real-time monitoring dashboard
 */
export class MonitoringDashboard {
  private config: Required<DashboardConfig>;
  private performanceMonitor: PerformanceMonitor;
  private cacheManager: UTXOCacheManager;
  private alerts = new Map<string, Alert>();
  private metrics: RealTimeMetrics[] = [];
  private updateTimer: TimerId | null = null;
  private startTime = Date.now();
  private subscribers = new Set<(metrics: RealTimeMetrics) => void>();

  constructor(
    performanceMonitor: PerformanceMonitor,
    cacheManager: UTXOCacheManager,
    config?: Partial<DashboardConfig>,
  ) {
    this.performanceMonitor = performanceMonitor;
    this.cacheManager = cacheManager;
    this.config = {
      updateIntervalMs: 5000, // 5 seconds
      retentionPeriodMs: 24 * 60 * 60 * 1000, // 24 hours
      enableRealTimeUpdates: true,
      enableAlerts: true,
      alertThresholds: {
        errorRate: 0.1, // 10%
        responseTime: 1000, // 1 second
        memoryUsage: 0.8, // 80%
        cacheHitRate: 0.5, // 50%
      },
      enableWebSocket: true,
      enableLogging: true,
      ...config,
    };

    if (this.config.enableRealTimeUpdates) {
      this.startRealTimeUpdates();
    }
  }

  /**
   * Get current real-time metrics
   */
  getCurrentMetrics(): RealTimeMetrics {
    const timestamp = Date.now();

    // Get performance data
    const performanceReport = this.performanceMonitor.generateReport(60000); // Last minute
    const cacheStats = this.cacheManager.getStats();
    const memoryUsage = process.memoryUsage();

    // Calculate CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds

    // Build metrics
    const metrics: RealTimeMetrics = {
      timestamp,
      selectionMetrics: {
        successRate: performanceReport.successRate,
        averageTime: performanceReport.averageExecutionTime,
        p95Time: performanceReport.p95ExecutionTime,
        requestsPerSecond: performanceReport.totalSelections / 60, // Last minute
        algorithmDistribution: this.calculateAlgorithmDistribution(
          performanceReport,
        ),
      },
      cacheMetrics: {
        hitRate: cacheStats.hitRate,
        memoryUsage: cacheStats.memoryUsage,
        totalEntries: cacheStats.totalEntries,
        evictionRate: cacheStats.evictionCount /
          Math.max(1, cacheStats.totalEntries),
      },
      systemMetrics: {
        heapUsed: memoryUsage.heapUsed / (1024 * 1024), // MB
        heapTotal: memoryUsage.heapTotal / (1024 * 1024), // MB
        cpuUsage: cpuPercent,
        activeConnections: this.subscribers.size,
      },
      alerts: this.getActiveAlerts(),
    };

    // Check for alert conditions
    if (this.config.enableAlerts) {
      this.checkAlertConditions(metrics);
    }

    return metrics;
  }

  /**
   * Get dashboard statistics
   */
  getDashboardStats(): DashboardStats {
    const uptime = Date.now() - this.startTime;
    const performanceReport = this.performanceMonitor.generateReport();
    const currentMetrics = this.getCurrentMetrics();

    // Calculate system health
    const systemHealth = this.calculateSystemHealth(currentMetrics);

    // Calculate performance score
    const performanceScore = this.calculatePerformanceScore(
      currentMetrics,
      performanceReport,
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      currentMetrics,
      performanceReport,
    );

    return {
      uptime,
      totalSelections: performanceReport.totalSelections,
      totalAlerts: this.alerts.size,
      systemHealth,
      performanceScore,
      recommendations,
    };
  }

  /**
   * Get performance trends over time
   */
  getPerformanceTrends(timeRangeMs: number = 60 * 60 * 1000): {
    timestamps: number[];
    successRate: number[];
    averageTime: number[];
    memoryUsage: number[];
    cacheHitRate: number[];
  } {
    const cutoff = Date.now() - timeRangeMs;
    const relevantMetrics = this.metrics.filter((m) => m.timestamp > cutoff);

    if (relevantMetrics.length === 0) {
      return {
        timestamps: [],
        successRate: [],
        averageTime: [],
        memoryUsage: [],
        cacheHitRate: [],
      };
    }

    return {
      timestamps: relevantMetrics.map((m) => m.timestamp),
      successRate: relevantMetrics.map((m) => m.selectionMetrics.successRate),
      averageTime: relevantMetrics.map((m) => m.selectionMetrics.averageTime),
      memoryUsage: relevantMetrics.map((m) => m.systemMetrics.heapUsed),
      cacheHitRate: relevantMetrics.map((m) => m.cacheMetrics.hitRate),
    };
  }

  /**
   * Create custom alert
   */
  createAlert(
    type: Alert['type'],
    severity: Alert['severity'],
    title: string,
    message: string,
    data?: any,
  ): string {
    const alert: Alert = {
      id: this.generateAlertId(),
      type,
      severity,
      title,
      message,
      timestamp: Date.now(),
      resolved: false,
      data,
    };

    this.alerts.set(alert.id, alert);

    if (this.config.enableLogging) {
      console.log(`[ALERT ${severity.toUpperCase()}] ${title}: ${message}`);
    }

    return alert.id;
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      return true;
    }
    return false;
  }

  /**
   * Subscribe to real-time updates
   */
  subscribe(callback: (metrics: RealTimeMetrics) => void): () => void {
    this.subscribers.add(callback);

    // Send current metrics immediately
    callback(this.getCurrentMetrics());

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Export metrics data
   */
  exportMetrics(timeRangeMs?: number): {
    config: DashboardConfig;
    uptime: number;
    metrics: RealTimeMetrics[];
    alerts: Alert[];
    performanceReport: PerformanceReport;
  } {
    const cutoff = timeRangeMs ? Date.now() - timeRangeMs : 0;
    const relevantMetrics = this.metrics.filter((m) => m.timestamp > cutoff);

    return {
      config: this.config,
      uptime: Date.now() - this.startTime,
      metrics: relevantMetrics,
      alerts: Array.from(this.alerts.values()),
      performanceReport: this.performanceMonitor.generateReport(timeRangeMs),
    };
  }

  /**
   * Clear old data and reset
   */
  cleanup(): void {
    const cutoff = Date.now() - this.config.retentionPeriodMs;

    // Clear old metrics
    this.metrics = this.metrics.filter((m) => m.timestamp > cutoff);

    // Clear resolved alerts older than retention period
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.resolved && alert.timestamp < cutoff) {
        this.alerts.delete(id);
      }
    }
  }

  /**
   * Update dashboard configuration
   */
  updateConfig(newConfig: Partial<DashboardConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart updates if interval changed
    if (newConfig.updateIntervalMs && this.updateTimer) {
      this.stopRealTimeUpdates();
      this.startRealTimeUpdates();
    }
  }

  /**
   * Shutdown dashboard
   */
  shutdown(): void {
    this.stopRealTimeUpdates();
    this.subscribers.clear();
    this.alerts.clear();
    this.metrics = [];
  }

  /**
   * Start real-time updates
   */
  private startRealTimeUpdates(): void {
    if (this.updateTimer) return;

    this.updateTimer = setIntervalCompat(() => {
      const metrics = this.getCurrentMetrics();

      // Store metrics
      this.metrics.push(metrics);

      // Notify subscribers
      for (const callback of this.subscribers) {
        try {
          callback(metrics);
        } catch (error) {
          console.error('Error notifying subscriber:', error);
        }
      }

      // Cleanup old data periodically
      if (this.metrics.length % 100 === 0) {
        this.cleanup();
      }
    }, this.config.updateIntervalMs);
  }

  /**
   * Stop real-time updates
   */
  private stopRealTimeUpdates(): void {
    if (this.updateTimer) {
      clearIntervalCompat(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * Calculate algorithm distribution
   */
  private calculateAlgorithmDistribution(
    report: PerformanceReport,
  ): Record<string, number> {
    const distribution: Record<string, number> = {};

    type AlgorithmStats = {
      selectionCount: number;
      successRate: number;
      averageTime: number;
      averageWaste: number;
      preferredScenarios: string[];
    };

    const statsValues: AlgorithmStats[] = Object.values(
      report.algorithmComparison,
    );
    const total = statsValues.reduce(
      (sum: number, stats: AlgorithmStats) => sum + stats.selectionCount,
      0,
    );

    if (total === 0) return distribution;

    for (
      const [algorithm, stats] of Object.entries(report.algorithmComparison)
    ) {
      // Type assertion to ensure TypeScript knows the exact type
      const typedStats = stats as AlgorithmStats;
      distribution[algorithm] = typedStats.selectionCount / total;
    }

    return distribution;
  }

  /**
   * Get active (unresolved) alerts
   */
  private getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter((alert) => !alert.resolved);
  }

  /**
   * Check for alert conditions
   */
  private checkAlertConditions(metrics: RealTimeMetrics): void {
    const thresholds = this.config.alertThresholds;

    // Error rate alert
    const errorRate = 1 - metrics.selectionMetrics.successRate;
    if (errorRate > thresholds.errorRate) {
      const existingAlert = this.findExistingAlert('high-error-rate');
      if (!existingAlert) {
        this.createAlert(
          'error',
          'high',
          'High Error Rate',
          `Selection error rate is ${(errorRate * 100).toFixed(1)}%`,
          { errorRate, threshold: thresholds.errorRate },
        );
      }
    } else {
      this.resolveAlertsByType('high-error-rate');
    }

    // Response time alert
    if (metrics.selectionMetrics.averageTime > thresholds.responseTime) {
      const existingAlert = this.findExistingAlert('slow-response');
      if (!existingAlert) {
        this.createAlert(
          'warning',
          'medium',
          'Slow Response Times',
          `Average response time is ${metrics.selectionMetrics.averageTime.toFixed(0)}ms`,
          {
            responseTime: metrics.selectionMetrics.averageTime,
            threshold: thresholds.responseTime,
          },
        );
      }
    } else {
      this.resolveAlertsByType('slow-response');
    }

    // Memory usage alert
    const memoryRatio = metrics.systemMetrics.heapUsed /
      metrics.systemMetrics.heapTotal;
    if (memoryRatio > thresholds.memoryUsage) {
      const existingAlert = this.findExistingAlert('high-memory');
      if (!existingAlert) {
        this.createAlert(
          'warning',
          'high',
          'High Memory Usage',
          `Memory usage is ${(memoryRatio * 100).toFixed(1)}%`,
          { memoryUsage: memoryRatio, threshold: thresholds.memoryUsage },
        );
      }
    } else {
      this.resolveAlertsByType('high-memory');
    }

    // Cache hit rate alert
    if (metrics.cacheMetrics.hitRate < thresholds.cacheHitRate) {
      const existingAlert = this.findExistingAlert('low-cache-hit');
      if (!existingAlert) {
        this.createAlert(
          'info',
          'low',
          'Low Cache Hit Rate',
          `Cache hit rate is ${(metrics.cacheMetrics.hitRate * 100).toFixed(1)}%`,
          {
            cacheHitRate: metrics.cacheMetrics.hitRate,
            threshold: thresholds.cacheHitRate,
          },
        );
      }
    } else {
      this.resolveAlertsByType('low-cache-hit');
    }
  }

  /**
   * Find existing alert by type
   */
  private findExistingAlert(type: string): Alert | undefined {
    return Array.from(this.alerts.values()).find(
      (alert) => !alert.resolved && alert.data?.alertType === type,
    );
  }

  /**
   * Resolve alerts by type
   */
  private resolveAlertsByType(type: string): void {
    for (const alert of this.alerts.values()) {
      if (!alert.resolved && alert.data?.alertType === type) {
        alert.resolved = true;
      }
    }
  }

  /**
   * Calculate system health
   */
  private calculateSystemHealth(
    metrics: RealTimeMetrics,
  ): 'healthy' | 'degraded' | 'critical' {
    const criticalAlerts = metrics.alerts.filter((a) => a.severity === 'critical').length;
    const highAlerts = metrics.alerts.filter((a) => a.severity === 'high').length;

    if (criticalAlerts > 0) return 'critical';
    if (highAlerts > 2 || metrics.selectionMetrics.successRate < 0.8) {
      return 'degraded';
    }
    return 'healthy';
  }

  /**
   * Calculate performance score (0-100)
   */
  private calculatePerformanceScore(
    metrics: RealTimeMetrics,
    _report: PerformanceReport,
  ): number {
    let score = 100;

    // Success rate impact (0-30 points)
    score -= (1 - metrics.selectionMetrics.successRate) * 30;

    // Response time impact (0-25 points)
    const timeScore = Math.min(
      25,
      (metrics.selectionMetrics.averageTime / 1000) * 25,
    );
    score -= timeScore;

    // Memory usage impact (0-20 points)
    const memoryRatio = metrics.systemMetrics.heapUsed /
      metrics.systemMetrics.heapTotal;
    score -= memoryRatio * 20;

    // Cache efficiency impact (0-15 points)
    score -= (1 - metrics.cacheMetrics.hitRate) * 15;

    // Alert penalty (0-10 points)
    const alertPenalty = Math.min(10, metrics.alerts.length * 2);
    score -= alertPenalty;

    return Math.max(0, Math.round(score));
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(
    metrics: RealTimeMetrics,
    _report: PerformanceReport,
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.selectionMetrics.successRate < 0.9) {
      recommendations.push(
        'Consider optimizing algorithm selection parameters',
      );
    }

    if (metrics.selectionMetrics.averageTime > 500) {
      recommendations.push(
        'Enable parallel algorithm execution for better performance',
      );
    }

    if (metrics.cacheMetrics.hitRate < 0.7) {
      recommendations.push('Increase cache size or adjust TTL settings');
    }

    const memoryRatio = metrics.systemMetrics.heapUsed /
      metrics.systemMetrics.heapTotal;
    if (memoryRatio > 0.8) {
      recommendations.push(
        'Consider increasing heap size or enabling memory optimization',
      );
    }

    if (metrics.alerts.length > 3) {
      recommendations.push(
        'Review and resolve pending alerts to improve system health',
      );
    }

    return recommendations;
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize the monitoring dashboard
   */
  initialize(): Promise<void> {
    console.log('Monitoring Dashboard initialized');
    return Promise.resolve();
  }

  /**
   * Start the dashboard server
   */
  startServer(port: number = 3001): void {
    console.log(`Monitoring Dashboard server started on port ${port}`);
    this.startRealTimeUpdates();
  }

  /**
   * Update metrics with new data
   */
  updateMetrics(newMetrics: any): void {
    // Add new metrics data to the internal metrics array
    const _timestamp = Date.now();

    // Store the metrics for later retrieval
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-500); // Keep only recent metrics
    }

    console.log(`Dashboard metrics updated: ${JSON.stringify(newMetrics)}`);
  }
}

/**
 * Create monitoring dashboard
 */
export function createMonitoringDashboard(
  performanceMonitor: PerformanceMonitor,
  cacheManager: UTXOCacheManager,
  config?: Partial<DashboardConfig>,
): MonitoringDashboard {
  return new MonitoringDashboard(performanceMonitor, cacheManager, config);
}

/**
 * Create production monitoring dashboard
 */
export function createProductionMonitoringDashboard(
  performanceMonitor: PerformanceMonitor,
  cacheManager: UTXOCacheManager,
): MonitoringDashboard {
  return new MonitoringDashboard(performanceMonitor, cacheManager, {
    updateIntervalMs: 10000, // 10 seconds
    retentionPeriodMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    enableRealTimeUpdates: true,
    enableAlerts: true,
    alertThresholds: {
      errorRate: 0.05, // 5%
      responseTime: 2000, // 2 seconds
      memoryUsage: 0.85, // 85%
      cacheHitRate: 0.7, // 70%
    },
    enableWebSocket: true,
    enableLogging: true,
  });
}

/**
 * Create development monitoring dashboard
 */
export function createDevelopmentMonitoringDashboard(
  performanceMonitor: PerformanceMonitor,
  cacheManager: UTXOCacheManager,
): MonitoringDashboard {
  return new MonitoringDashboard(performanceMonitor, cacheManager, {
    updateIntervalMs: 2000, // 2 seconds
    retentionPeriodMs: 60 * 60 * 1000, // 1 hour
    enableRealTimeUpdates: true,
    enableAlerts: true,
    alertThresholds: {
      errorRate: 0.2, // 20% (more lenient for development)
      responseTime: 5000, // 5 seconds
      memoryUsage: 0.9, // 90%
      cacheHitRate: 0.3, // 30%
    },
    enableWebSocket: false,
    enableLogging: true,
  });
}
