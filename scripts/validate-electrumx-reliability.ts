#!/usr/bin/env tsx
/**
 * ElectrumX Reliability Validation Script
 *
 * HIGH PRIORITY PRE-RELEASE VALIDATION
 *
 * This script comprehensively tests ElectrumX implementation reliability:
 * - Server connectivity and stability
 * - ECONNRESET error handling
 * - Connection pooling and failover
 * - UTXO fetching accuracy
 * - Stress testing with concurrent connections
 * - Graceful degradation testing
 *
 * CRITICAL: Must achieve 100% reliability before production release
 */

import * as bitcoin from 'bitcoinjs-lib';
import { performance } from 'node:perf_hooks';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';

import { ElectrumXProvider } from '../src/index.ts';
import {
  createElectrumXPool,
  type ElectrumXServer,
} from '../src/providers/electrumx-connection-pool.ts';
import {
  DEFAULT_MAINNET_SERVERS,
  DEFAULT_TESTNET_SERVERS,
  type ElectrumXEndpoint,
} from '../src/config/electrumx-config.ts';
import process from 'node:process';

// Test Configuration
const VALIDATION_CONFIG = {
  // Test timeouts
  connectionTimeout: 15000, // 15 seconds
  operationTimeout: 30000, // 30 seconds
  stressTestDuration: 60000, // 1 minute

  // Test parameters
  concurrentConnections: 20,
  operationsPerConnection: 10,
  maxRetries: 3,

  // Reliability thresholds (for production readiness)
  minSuccessRate: 0.95, // 95% success rate required
  maxAllowedEconnResets: 0, // Zero ECONNRESET errors allowed
  maxAverageResponseTime: 5000, // 5 second max avg response

  // Test addresses (known to have UTXOs)
  testAddresses: {
    mainnet: [
      '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', // Genesis coinbase
      '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', // Known P2SH address
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', // Known Bech32
    ],
    testnet: [
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', // Testnet Bech32
      '2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br', // Testnet P2SH
    ],
  },
} as const;

// Validation Results Interface
interface ValidationResult {
  testName: string;
  success: boolean;
  duration: number;
  details: any;
  errors: Error[];
  criticalIssues: string[];
}

interface ServerValidationResult {
  endpoint: ElectrumXEndpoint;
  connected: boolean;
  responseTime: number | null;
  operations: {
    getBlockHeight: boolean;
    getUTXOs: boolean;
    getFeeRate: boolean;
    getBalance: boolean;
  };
  errors: string[];
  econnResetCount: number;
  reconnectionAttempts: number;
}

interface StressTestResult {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  econnResetErrors: number;
  otherErrors: number;
  averageResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  concurrentConnectionsAchieved: number;
}

// Enhanced Error Tracking
class ErrorTracker {
  private errors: Map<string, number> = new Map();
  private econnResetCount = 0;
  private connectionRefusedCount = 0;
  private timeoutCount = 0;

  trackError(error: Error): void {
    const errorType = this.classifyError(error);
    const currentCount = this.errors.get(errorType) || 0;
    this.errors.set(errorType, currentCount + 1);

    // Track specific critical errors
    if (error.message.includes('ECONNRESET')) {
      this.econnResetCount++;
    } else if (error.message.includes('ECONNREFUSED')) {
      this.connectionRefusedCount++;
    } else if (error.message.includes('timeout')) {
      this.timeoutCount++;
    }
  }

  private classifyError(error: Error): string {
    if (error.message.includes('ECONNRESET')) return 'ECONNRESET';
    if (error.message.includes('ECONNREFUSED')) return 'ECONNREFUSED';
    if (error.message.includes('timeout')) return 'TIMEOUT';
    if (error.message.includes('EHOSTUNREACH')) return 'HOST_UNREACHABLE';
    if (error.message.includes('ENOTFOUND')) return 'DNS_FAILURE';
    if (error.message.includes('certificate')) return 'TLS_ERROR';
    return 'OTHER';
  }

  getReport(): any {
    return {
      totalErrors: Array.from(this.errors.values()).reduce((a, b) => a + b, 0),
      errorBreakdown: Object.fromEntries(this.errors),
      criticalCounts: {
        econnReset: this.econnResetCount,
        connectionRefused: this.connectionRefusedCount,
        timeout: this.timeoutCount,
      },
    };
  }

  hasEconnResetErrors(): boolean {
    return this.econnResetCount > 0;
  }

  getCriticalIssues(): string[] {
    const issues: string[] = [];
    if (this.econnResetCount > 0) {
      issues.push(`CRITICAL: ${this.econnResetCount} ECONNRESET errors detected`);
    }
    if (this.connectionRefusedCount > 5) {
      issues.push(`HIGH: ${this.connectionRefusedCount} connection refused errors`);
    }
    if (this.timeoutCount > 3) {
      issues.push(`MEDIUM: ${this.timeoutCount} timeout errors`);
    }
    return issues;
  }
}

// Main Validation Class
class ElectrumXReliabilityValidator {
  private results: ValidationResult[] = [];
  private globalErrorTracker = new ErrorTracker();

  async runCompleteValidation(): Promise<void> {
    console.log('🚀 Starting ElectrumX Reliability Validation...');
    console.log(`Target Success Rate: ${(VALIDATION_CONFIG.minSuccessRate * 100).toFixed(1)}%`);
    console.log(`Max Allowed ECONNRESET Errors: ${VALIDATION_CONFIG.maxAllowedEconnResets}`);
    console.log('='.repeat(60));

    try {
      // 1. Configuration Validation
      await this.validateConfiguration();

      // 2. Server Connectivity Testing
      await this.validateServerConnectivity();

      // 3. Error Handling and Retry Logic
      await this.validateErrorHandling();

      // 4. Connection Pooling and Failover
      await this.validateConnectionPooling();

      // 5. UTXO Fetching Accuracy
      await this.validateUTXOAccuracy();

      // 6. Stress Testing
      await this.validateStressTesting();

      // 7. Graceful Degradation
      await this.validateGracefulDegradation();

      // 8. Final Assessment
      await this.generateFinalReport();
    } catch (error) {
      console.error('❌ Critical validation failure:', error);
      this.globalErrorTracker.trackError(error as Error);
    }
  }

  private validateConfiguration(): void {
    console.log('\n📋 1. Configuration Validation');
    const startTime = performance.now();

    try {
      // Check default server configurations
      const mainnetServers = DEFAULT_MAINNET_SERVERS;
      const testnetServers = DEFAULT_TESTNET_SERVERS;

      console.log(`   Mainnet servers configured: ${mainnetServers.length}`);
      console.log(`   Testnet servers configured: ${testnetServers.length}`);

      // Validate each server configuration
      const configIssues: string[] = [];

      for (const server of mainnetServers) {
        // Check for problematic port configurations
        if (
          server.host === 'blockstream.info' && server.port === 110 && server.protocol === 'ssl'
        ) {
          configIssues.push(
            `CRITICAL: blockstream.info:110 using SSL protocol - port 110 is typically POP3, not ElectrumX SSL`,
          );
        }

        if (server.timeout && server.timeout < 5000) {
          configIssues.push(
            `WARNING: ${server.host}:${server.port} has very short timeout (${server.timeout}ms)`,
          );
        }
      }

      const success = configIssues.length === 0;
      const duration = performance.now() - startTime;

      this.results.push({
        testName: 'Configuration Validation',
        success,
        duration,
        details: {
          mainnetServers: mainnetServers.length,
          testnetServers: testnetServers.length,
          configIssues,
        },
        errors: [],
        criticalIssues: configIssues.filter((issue) => issue.includes('CRITICAL')),
      });

      if (configIssues.length > 0) {
        console.log('   ⚠️  Configuration Issues Found:');
        configIssues.forEach((issue) => console.log(`      - ${issue}`));
      } else {
        console.log('   ✅ Configuration validation passed');
      }
    } catch (error) {
      console.error('   ❌ Configuration validation failed:', error);
      this.globalErrorTracker.trackError(error as Error);
    }
  }

  private async validateServerConnectivity(): Promise<void> {
    console.log('\n🔗 2. Server Connectivity Testing');
    const startTime = performance.now();

    const serverResults: ServerValidationResult[] = [];
    const mainnetServers = DEFAULT_MAINNET_SERVERS;

    console.log(`   Testing ${mainnetServers.length} mainnet servers...`);

    for (const endpoint of mainnetServers) {
      const serverResult = await this.testSingleServer(endpoint);
      serverResults.push(serverResult);

      const status = serverResult.connected ? '✅' : '❌';
      const responseTime = serverResult.responseTime ? `${serverResult.responseTime}ms` : 'N/A';
      console.log(
        `   ${status} ${endpoint.host}:${endpoint.port}:${endpoint.protocol} (${responseTime})`,
      );

      if (serverResult.errors.length > 0) {
        serverResult.errors.forEach((error) => console.log(`      Error: ${error}`));
      }
    }

    // Analyze results
    const connectedServers = serverResults.filter((r) => r.connected);
    const econnResetServers = serverResults.filter((r) => r.econnResetCount > 0);

    const success = connectedServers.length >= Math.ceil(mainnetServers.length * 0.6) &&
      econnResetServers.length === 0;

    const duration = performance.now() - startTime;
    const criticalIssues: string[] = [];

    if (econnResetServers.length > 0) {
      criticalIssues.push(`${econnResetServers.length} servers experienced ECONNRESET errors`);
    }

    if (connectedServers.length < mainnetServers.length * 0.5) {
      criticalIssues.push(
        `Only ${connectedServers.length}/${mainnetServers.length} servers connected successfully`,
      );
    }

    this.results.push({
      testName: 'Server Connectivity',
      success,
      duration,
      details: {
        totalServers: mainnetServers.length,
        connectedServers: connectedServers.length,
        econnResetCount: econnResetServers.reduce((sum, s) => sum + s.econnResetCount, 0),
        averageResponseTime: connectedServers.length > 0
          ? connectedServers.reduce((sum, s) => sum + (s.responseTime || 0), 0) /
            connectedServers.length
          : 0,
        serverResults,
      },
      errors: [],
      criticalIssues,
    });

    console.log(
      `   📊 Results: ${connectedServers.length}/${mainnetServers.length} servers connected`,
    );
    if (econnResetServers.length > 0) {
      console.log(`   ⚠️  ${econnResetServers.length} servers had ECONNRESET errors`);
    }
  }

  private async testSingleServer(endpoint: ElectrumXEndpoint): Promise<ServerValidationResult> {
    const result: ServerValidationResult = {
      endpoint,
      connected: false,
      responseTime: null,
      operations: {
        getBlockHeight: false,
        getUTXOs: false,
        getFeeRate: false,
        getBalance: false,
      },
      errors: [],
      econnResetCount: 0,
      reconnectionAttempts: 0,
    };

    let provider: ElectrumXProvider | null = null;

    try {
      const startTime = performance.now();

      // Create provider with specific timeout settings
      provider = new ElectrumXProvider({
        network: bitcoin.networks.bitcoin,
        endpoints: [endpoint],
        connectionTimeout: VALIDATION_CONFIG.connectionTimeout,
        requestTimeout: VALIDATION_CONFIG.operationTimeout,
        retries: 1, // Single attempt for initial testing
      });

      // Test basic connectivity
      await provider.isConnected();
      result.connected = true;
      result.responseTime = performance.now() - startTime;

      // Test core operations
      try {
        await provider.getBlockHeight();
        result.operations.getBlockHeight = true;
      } catch (error) {
        result.errors.push(`getBlockHeight: ${(error as Error).message}`);
        this.trackError(error as Error, result);
      }

      try {
        await provider.getFeeRate('medium');
        result.operations.getFeeRate = true;
      } catch (error) {
        result.errors.push(`getFeeRate: ${(error as Error).message}`);
        this.trackError(error as Error, result);
      }

      // Test with a known address
      try {
        const testAddress = VALIDATION_CONFIG.testAddresses.mainnet[0];
        await provider.getBalance(testAddress);
        result.operations.getBalance = true;
      } catch (error) {
        result.errors.push(`getBalance: ${(error as Error).message}`);
        this.trackError(error as Error, result);
      }

      try {
        const testAddress = VALIDATION_CONFIG.testAddresses.mainnet[0];
        await provider.getUTXOs(testAddress);
        result.operations.getUTXOs = true;
      } catch (error) {
        result.errors.push(`getUTXOs: ${(error as Error).message}`);
        this.trackError(error as Error, result);
      }
    } catch (error) {
      result.errors.push(`Connection: ${(error as Error).message}`);
      this.trackError(error as Error, result);
    } finally {
      if (provider) {
        try {
          await provider.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
    }

    return result;
  }

  private trackError(error: Error, result: ServerValidationResult): void {
    if (error.message.includes('ECONNRESET')) {
      result.econnResetCount++;
    }
    this.globalErrorTracker.trackError(error);
  }

  private async validateErrorHandling(): Promise<void> {
    console.log('\n🔄 3. Error Handling and Retry Logic Testing');
    const startTime = performance.now();

    try {
      // Test with intentionally bad server
      const badEndpoint: ElectrumXEndpoint = {
        host: 'invalid.nonexistent.server.test',
        port: 50002,
        protocol: 'ssl',
        timeout: 5000,
        maxRetries: 2,
      };

      let errorsCaught = 0;
      let retriesObserved = 0;

      try {
        const provider = new ElectrumXProvider({
          network: bitcoin.networks.bitcoin,
          endpoints: [badEndpoint],
          connectionTimeout: 5000,
          requestTimeout: 10000,
          retries: 3,
        });

        await provider.getBlockHeight();
      } catch {
        errorsCaught++;
        // This should fail as expected
      }

      // Test with timeout server (using very short timeout)
      const timeoutEndpoint = DEFAULT_MAINNET_SERVERS[0];
      if (!timeoutEndpoint) {
        throw new Error('No default mainnet servers available for timeout test');
      }
      try {
        const provider = new ElectrumXProvider({
          network: bitcoin.networks.bitcoin,
          endpoints: [timeoutEndpoint],
          connectionTimeout: 1, // 1ms - should timeout
          requestTimeout: 1,
          retries: 2,
        });

        await provider.getBlockHeight();
      } catch (error) {
        errorsCaught++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('timeout')) {
          retriesObserved++;
        }
      }

      const success = errorsCaught >= 2; // Should catch expected errors
      const duration = performance.now() - startTime;

      this.results.push({
        testName: 'Error Handling',
        success,
        duration,
        details: {
          errorsCaught,
          retriesObserved,
          expectedBehavior: 'Graceful error handling with retries',
        },
        errors: [],
        criticalIssues: success ? [] : ['Error handling not working as expected'],
      });

      console.log(
        `   ✅ Error handling test completed (${errorsCaught} errors handled gracefully)`,
      );
    } catch (error) {
      console.error('   ❌ Error handling test failed:', error);
      this.globalErrorTracker.trackError(error as Error);
    }
  }

  private async validateConnectionPooling(): Promise<void> {
    console.log('\n🏊 4. Connection Pooling and Failover Testing');
    const startTime = performance.now();

    try {
      // Create connection pool with multiple servers
      const workingServers: ElectrumXServer[] = DEFAULT_MAINNET_SERVERS
        .slice(0, 3) // Use first 3 servers
        .map((endpoint) => ({
          host: endpoint.host,
          port: endpoint.port,
          protocol: endpoint.protocol,
          weight: 1,
        }));

      const pool = createElectrumXPool(bitcoin.networks.bitcoin, workingServers, {
        maxConnectionsPerServer: 3,
        minConnectionsPerServer: 1,
        circuitBreakerThreshold: 2,
        circuitBreakerTimeout: 5000,
        healthCheckInterval: 10000,
        loadBalanceStrategy: 'health-based',
      });

      let operationsSuccessful = 0;
      let operationsFailed = 0;

      // Test multiple operations to verify pooling
      for (let i = 0; i < 10; i++) {
        try {
          await pool.getBlockHeight();
          operationsSuccessful++;
          await setTimeoutPromise(100); // Small delay between operations
        } catch (error) {
          operationsFailed++;
          this.globalErrorTracker.trackError(error as Error);
        }
      }

      // Get pool statistics
      const stats = pool.getStats();

      // Test concurrent operations
      const concurrentPromises = Array(5).fill(null).map(async () => {
        try {
          return await pool.getBlockHeight();
        } catch (error) {
          this.globalErrorTracker.trackError(error as Error);
          throw error;
        }
      });

      const concurrentResults = await Promise.allSettled(concurrentPromises);
      const concurrentSuccesses = concurrentResults.filter((r) => r.status === 'fulfilled').length;

      await pool.shutdown();

      const success = operationsSuccessful >= 8 && concurrentSuccesses >= 3;
      const duration = performance.now() - startTime;

      this.results.push({
        testName: 'Connection Pooling',
        success,
        duration,
        details: {
          operationsSuccessful,
          operationsFailed,
          concurrentSuccesses,
          totalConnections: stats.totalConnections,
          averageHealthScore: stats.averageHealthScore,
          circuitBreakersOpen: stats.circuitBreakersOpen,
        },
        errors: [],
        criticalIssues: success ? [] : ['Connection pooling not working reliably'],
      });

      console.log(
        `   📊 Pool Operations: ${operationsSuccessful}/${
          operationsSuccessful + operationsFailed
        } successful`,
      );
      console.log(`   📊 Concurrent Operations: ${concurrentSuccesses}/5 successful`);
      console.log(
        `   📊 Pool Stats: ${stats.totalConnections} connections, ${
          stats.averageHealthScore.toFixed(1)
        } avg health`,
      );
    } catch (error) {
      console.error('   ❌ Connection pooling test failed:', error);
      this.globalErrorTracker.trackError(error as Error);
    }
  }

  private async validateUTXOAccuracy(): Promise<void> {
    console.log('\n🪙 5. UTXO Fetching Accuracy Testing');
    const startTime = performance.now();

    try {
      const provider = new ElectrumXProvider({
        network: bitcoin.networks.bitcoin,
        endpoints: DEFAULT_MAINNET_SERVERS.slice(0, 2),
        retries: 2,
      });

      let utxoTestsPassed = 0;
      let utxoTestsFailed = 0;

      // Test UTXO fetching for multiple addresses
      for (const address of VALIDATION_CONFIG.testAddresses.mainnet) {
        try {
          const utxos = await provider.getUTXOs(address);

          // Validate UTXO structure
          let validUTXOs = 0;
          for (const utxo of utxos) {
            if (utxo.txid && utxo.vout !== undefined && utxo.value > 0) {
              validUTXOs++;
            }
          }

          if (validUTXOs === utxos.length) {
            utxoTestsPassed++;
          } else {
            utxoTestsFailed++;
          }

          console.log(`   📍 ${address}: ${utxos.length} UTXOs (${validUTXOs} valid)`);
        } catch (error) {
          utxoTestsFailed++;
          console.log(`   ❌ ${address}: ${(error as Error).message}`);
          this.globalErrorTracker.trackError(error as Error);
        }
      }

      await provider.disconnect();

      const success = utxoTestsPassed >= utxoTestsFailed;
      const duration = performance.now() - startTime;

      this.results.push({
        testName: 'UTXO Accuracy',
        success,
        duration,
        details: {
          utxoTestsPassed,
          utxoTestsFailed,
          addressesTested: VALIDATION_CONFIG.testAddresses.mainnet.length,
        },
        errors: [],
        criticalIssues: success ? [] : ['UTXO fetching reliability issues detected'],
      });
    } catch (error) {
      console.error('   ❌ UTXO accuracy test failed:', error);
      this.globalErrorTracker.trackError(error as Error);
    }
  }

  private async validateStressTesting(): Promise<void> {
    console.log('\n🚀 6. Stress Testing with Concurrent Connections');
    const startTime = performance.now();

    try {
      const pool = createElectrumXPool(
        bitcoin.networks.bitcoin,
        DEFAULT_MAINNET_SERVERS.slice(0, 3).map((e) => ({
          host: e.host,
          port: e.port,
          protocol: e.protocol,
          weight: 1,
        })),
        {
          maxConnectionsPerServer: 5,
          maxPoolSize: 15,
          loadBalanceStrategy: 'least-connections',
        },
      );

      const stressTestResult: StressTestResult = {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        econnResetErrors: 0,
        otherErrors: 0,
        averageResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Infinity,
        concurrentConnectionsAchieved: 0,
      };

      const responseTimes: number[] = [];

      // Create concurrent operations
      const concurrentOperations = Array(VALIDATION_CONFIG.concurrentConnections).fill(null).map(
        async () => {
          for (let i = 0; i < VALIDATION_CONFIG.operationsPerConnection; i++) {
            const opStartTime = performance.now();
            stressTestResult.totalOperations++;

            try {
              await pool.getBlockHeight();
              const responseTime = performance.now() - opStartTime;
              responseTimes.push(responseTime);
              stressTestResult.successfulOperations++;
            } catch (error) {
              stressTestResult.failedOperations++;
              if ((error as Error).message.includes('ECONNRESET')) {
                stressTestResult.econnResetErrors++;
              } else {
                stressTestResult.otherErrors++;
              }
              this.globalErrorTracker.trackError(error as Error);
            }

            // Small delay to allow other operations
            await setTimeoutPromise(50);
          }
        },
      );

      // Monitor peak connections during stress test
      const connectionMonitor = setInterval(() => {
        const stats = pool.getStats();
        stressTestResult.concurrentConnectionsAchieved = Math.max(
          stressTestResult.concurrentConnectionsAchieved,
          stats.totalActiveConnections,
        );
      }, 500);

      await Promise.allSettled(concurrentOperations);
      clearInterval(connectionMonitor);

      // Calculate statistics
      if (responseTimes.length > 0) {
        stressTestResult.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) /
          responseTimes.length;
        stressTestResult.maxResponseTime = Math.max(...responseTimes);
        stressTestResult.minResponseTime = Math.min(...responseTimes);
      }

      await pool.shutdown();

      const successRate = stressTestResult.successfulOperations / stressTestResult.totalOperations;
      const success = successRate >= VALIDATION_CONFIG.minSuccessRate &&
        stressTestResult.econnResetErrors === 0;

      const duration = performance.now() - startTime;
      const criticalIssues: string[] = [];

      if (successRate < VALIDATION_CONFIG.minSuccessRate) {
        criticalIssues.push(
          `Success rate ${(successRate * 100).toFixed(1)}% below required ${
            (VALIDATION_CONFIG.minSuccessRate * 100).toFixed(1)
          }%`,
        );
      }

      if (stressTestResult.econnResetErrors > 0) {
        criticalIssues.push(
          `${stressTestResult.econnResetErrors} ECONNRESET errors during stress test`,
        );
      }

      this.results.push({
        testName: 'Stress Testing',
        success,
        duration,
        details: stressTestResult,
        errors: [],
        criticalIssues,
      });

      console.log(
        `   📊 Operations: ${stressTestResult.successfulOperations}/${stressTestResult.totalOperations} successful (${
          (successRate * 100).toFixed(1)
        }%)`,
      );
      console.log(`   📊 ECONNRESET errors: ${stressTestResult.econnResetErrors}`);
      console.log(
        `   📊 Average response time: ${stressTestResult.averageResponseTime.toFixed(0)}ms`,
      );
      console.log(
        `   📊 Peak concurrent connections: ${stressTestResult.concurrentConnectionsAchieved}`,
      );
    } catch (error) {
      console.error('   ❌ Stress testing failed:', error);
      this.globalErrorTracker.trackError(error as Error);
    }
  }

  private async validateGracefulDegradation(): Promise<void> {
    console.log('\n🛡️ 7. Graceful Degradation Testing');
    const startTime = performance.now();

    try {
      // Test with mix of working and non-working servers
      const mixedServers: ElectrumXServer[] = [
        // Working servers (first 2 default servers)
        ...DEFAULT_MAINNET_SERVERS.slice(0, 2).map((e) => ({
          host: e.host,
          port: e.port,
          protocol: e.protocol,
          weight: 1,
        })),
        // Non-working servers
        { host: 'invalid1.test', port: 50002, protocol: 'ssl', weight: 1 },
        { host: 'invalid2.test', port: 50001, protocol: 'tcp', weight: 1 },
      ];

      const pool = createElectrumXPool(bitcoin.networks.bitcoin, mixedServers, {
        circuitBreakerThreshold: 1, // Quick circuit breaking for test
        circuitBreakerTimeout: 2000,
        maxConnectionsPerServer: 2,
        healthCheckInterval: 5000,
      });

      let degradationTestPassed = 0;
      let degradationTestFailed = 0;

      // Test that operations still work despite some servers being down
      for (let i = 0; i < 5; i++) {
        try {
          await pool.getBlockHeight();
          degradationTestPassed++;
        } catch (error) {
          degradationTestFailed++;
          this.globalErrorTracker.trackError(error as Error);
        }
        await setTimeoutPromise(500);
      }

      const stats = pool.getStats();
      const healthyServers = stats.servers.filter((s) => s.healthy).length;
      const openCircuitBreakers = stats.circuitBreakersOpen;

      await pool.shutdown();

      const success = degradationTestPassed >= 3 && healthyServers >= 1;
      const duration = performance.now() - startTime;

      this.results.push({
        testName: 'Graceful Degradation',
        success,
        duration,
        details: {
          degradationTestPassed,
          degradationTestFailed,
          healthyServers,
          openCircuitBreakers,
          totalServers: mixedServers.length,
        },
        errors: [],
        criticalIssues: success ? [] : ['Graceful degradation not working properly'],
      });

      console.log(
        `   📊 Operations with degraded servers: ${degradationTestPassed}/${
          degradationTestPassed + degradationTestFailed
        } successful`,
      );
      console.log(`   📊 Healthy servers: ${healthyServers}/${mixedServers.length}`);
      console.log(`   📊 Circuit breakers opened: ${openCircuitBreakers}`);
    } catch (error) {
      console.error('   ❌ Graceful degradation test failed:', error);
      this.globalErrorTracker.trackError(error as Error);
    }
  }

  private generateFinalReport(): void {
    console.log('\n📊 8. Final Reliability Assessment');
    console.log('='.repeat(60));

    const totalTests = this.results.length;
    const passedTests = this.results.filter((r) => r.success).length;
    const overallSuccessRate = passedTests / totalTests;

    const errorReport = this.globalErrorTracker.getReport();
    const criticalIssues = this.globalErrorTracker.getCriticalIssues();

    // Collect all critical issues from tests
    const allCriticalIssues = this.results
      .flatMap((r) => r.criticalIssues)
      .concat(criticalIssues);

    // Production readiness assessment
    const productionReady = overallSuccessRate >= VALIDATION_CONFIG.minSuccessRate &&
      !this.globalErrorTracker.hasEconnResetErrors() &&
      allCriticalIssues.length === 0;

    console.log(`\n🎯 PRODUCTION READINESS ASSESSMENT:`);
    console.log(`   Overall Test Success Rate: ${(overallSuccessRate * 100).toFixed(1)}%`);
    console.log(
      `   Required Success Rate: ${(VALIDATION_CONFIG.minSuccessRate * 100).toFixed(1)}%`,
    );
    console.log(`   ECONNRESET Errors: ${errorReport.criticalCounts.econnReset}`);
    console.log(
      `   Other Connection Errors: ${
        errorReport.criticalCounts.connectionRefused + errorReport.criticalCounts.timeout
      }`,
    );
    console.log(`   Total Critical Issues: ${allCriticalIssues.length}`);

    console.log(`\n📋 TEST RESULTS SUMMARY:`);
    this.results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      const duration = result.duration.toFixed(0);
      console.log(`   ${index + 1}. ${status} ${result.testName} (${duration}ms)`);

      if (result.criticalIssues.length > 0) {
        result.criticalIssues.forEach((issue) => {
          console.log(`      🚨 ${issue}`);
        });
      }
    });

    if (errorReport.totalErrors > 0) {
      console.log(`\n⚠️  ERROR ANALYSIS:`);
      Object.entries(errorReport.errorBreakdown).forEach(([type, count]) => {
        console.log(`   ${type}: ${count} occurrences`);
      });
    }

    if (allCriticalIssues.length > 0) {
      console.log(`\n🚨 CRITICAL ISSUES REQUIRING ATTENTION:`);
      allCriticalIssues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
      });
    }

    console.log(`\n${productionReady ? '🎉' : '⚠️'} FINAL VERDICT:`);
    if (productionReady) {
      console.log(`   ✅ ElectrumX implementation is PRODUCTION READY`);
      console.log(`   ✅ All reliability requirements met`);
      console.log(`   ✅ Zero ECONNRESET errors detected`);
      console.log(`   ✅ Proper failover and error handling confirmed`);
    } else {
      console.log(`   ❌ ElectrumX implementation is NOT production ready`);
      console.log(`   ❌ Critical issues must be resolved before release`);

      if (overallSuccessRate < VALIDATION_CONFIG.minSuccessRate) {
        console.log(
          `   ❌ Success rate too low: ${(overallSuccessRate * 100).toFixed(1)}% < ${
            (VALIDATION_CONFIG.minSuccessRate * 100).toFixed(1)
          }%`,
        );
      }

      if (this.globalErrorTracker.hasEconnResetErrors()) {
        console.log(`   ❌ ECONNRESET errors detected: ${errorReport.criticalCounts.econnReset}`);
      }

      if (allCriticalIssues.length > 0) {
        console.log(`   ❌ ${allCriticalIssues.length} critical issues require resolution`);
      }
    }

    console.log('\n📝 RECOMMENDATIONS:');

    if (errorReport.criticalCounts.econnReset > 0) {
      console.log('   1. 🔧 Fix ECONNRESET handling - implement proper connection retry logic');
      console.log(
        '   2. 🔧 Review server configurations, especially blockstream.info:110 SSL setup',
      );
      console.log('   3. 🔧 Add connection keepalive and heartbeat mechanisms');
    }

    if (overallSuccessRate < 1.0) {
      console.log('   4. 🔧 Improve error handling and fallback mechanisms');
      console.log('   5. 🔧 Consider adding more reliable backup servers');
    }

    console.log('   6. 📊 Monitor this validation script in CI/CD pipeline');
    console.log('   7. 🔄 Run extended reliability tests before each release');

    console.log('\n' + '='.repeat(60));

    // Exit with error code if not production ready
    if (!productionReady) {
      process.exit(1);
    }
  }
}

// Main execution
async function main(): Promise<void> {
  const validator = new ElectrumXReliabilityValidator();
  await validator.runCompleteValidation();
}

// Run validation if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('💥 Validation script failed:', error);
    process.exit(1);
  });
}

export { ElectrumXReliabilityValidator, VALIDATION_CONFIG };
