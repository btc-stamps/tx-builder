/**
 * Core transaction building functionality
 */

export * from './transaction-builder.ts';
export * from './psbt-builder.ts';
export * from './enhanced-psbt-builder.ts';
export * from './rbf-builder.ts';
export * from './cpfp-builder.ts';
export * from './utxo-lock-manager.ts';
export * from './psbt-validator.ts';
export * from './psbt-finalizer.ts';
export * from './script-builder.ts';
// Note: These core modules are not yet implemented
// export * from './address-validator.ts';
// export * from './network-manager.ts';

// Performance monitoring and optimization
export * from './performance-monitor.ts';
export * from './utxo-cache-manager.ts';
export * from './performance-aware-selector.ts';
export * from './parallel-selector.ts';
export * from './streaming-utxo-processor.ts';
export * from './monitoring-dashboard.ts';
// Re-export everything except BenchmarkResult to avoid conflict
export {
  type MetricsUpdate,
  type PerformanceMetrics,
  PerformanceSystem,
  type PerformanceSystemConfig,
  type SelectionRequest,
  type SelectionResponse,
  type SystemHealth,
  type SystemStats,
} from './performance-system.ts';
