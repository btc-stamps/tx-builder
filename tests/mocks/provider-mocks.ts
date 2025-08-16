/**
 * Provider Mocks for Dependency Injection Testing
 *
 * Comprehensive mocks for all external provider services to enable
 * isolated unit testing with dependency injection patterns.
 */

import type { ProviderInterface, UTXO } from '../../src/interfaces/provider.interface';
import type { FeeRates } from '../../src/interfaces/fee.interface';

/**
 * Mock ElectrumX Provider for testing without external dependencies
 */
export class MockElectrumXProvider implements ProviderInterface {
  private mockUtxos: UTXO[] = [];
  private mockFeeRates: FeeRates = {
    fastest: 50,
    halfHour: 25,
    hour: 15,
    economy: 10,
    minimum: 1,
  };
  private mockTransactions: Map<string, any> = new Map();
  private callCount = 0;
  private shouldFail = false;
  private networkDelay = 0;

  constructor(config?: {
    utxos?: UTXO[];
    feeRates?: FeeRates;
    shouldFail?: boolean;
    networkDelay?: number;
  }) {
    if (config?.utxos) this.mockUtxos = config.utxos;
    if (config?.feeRates) this.mockFeeRates = config.feeRates;
    if (config?.shouldFail) this.shouldFail = config.shouldFail;
    if (config?.networkDelay) this.networkDelay = config.networkDelay;
  }

  async getUTXOs(address: string): Promise<UTXO[]> {
    this.callCount++;

    if (this.networkDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.networkDelay));
    }

    if (this.shouldFail) {
      throw new Error('Mock ElectrumX provider failure');
    }

    // Return all mock UTXOs (address filtering is optional for mock)
    return [...this.mockUtxos];
  }

  async getFeeRates(): Promise<FeeRates> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error('Failed to fetch fee rates');
    }

    return this.mockFeeRates;
  }

  async broadcastTransaction(txHex: string): Promise<string> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error('Failed to broadcast transaction');
    }

    const txid = `mock_tx_${this.callCount}_${txHex.length}`;
    this.mockTransactions.set(txid, { hex: txHex, timestamp: Date.now() });
    return txid;
  }

  async getTransaction(txid: string): Promise<any> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error('Failed to get transaction');
    }

    return this.mockTransactions.get(txid) || null;
  }

  async getBlockHeight(): Promise<number> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error('Failed to get block height');
    }

    return 800000; // Mock block height
  }

  // Test utilities
  getCallCount(): number {
    return this.callCount;
  }

  resetCallCount(): void {
    this.callCount = 0;
  }

  setFailureMode(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  addMockUTXO(utxo: UTXO): void {
    this.mockUtxos.push(utxo);
  }

  clearMockUTXOs(): void {
    this.mockUtxos = [];
  }

  setMockFeeRates(feeRates: FeeRates): void {
    this.mockFeeRates = feeRates;
  }
}

/**
 * Mock Pooled Provider for load balancing tests
 */
export class MockPooledProvider implements ProviderInterface {
  private providers: MockElectrumXProvider[];
  private currentIndex = 0;
  private failureRate = 0; // 0-1, probability of failure

  constructor(providerCount: number = 3, failureRate: number = 0) {
    this.providers = Array.from({ length: providerCount }, (_, i) =>
      new MockElectrumXProvider({
        shouldFail: false, // Start in working condition
        networkDelay: Math.random() * 100, // Random delay 0-100ms
      }));
    this.failureRate = failureRate;
  }

  async getUTXOs(address: string): Promise<UTXO[]> {
    const provider = this.getNextProvider();
    return provider.getUTXOs(address);
  }

  async getFeeRates(): Promise<FeeRates> {
    const provider = this.getNextProvider();
    return provider.getFeeRates();
  }

  async broadcastTransaction(txHex: string): Promise<string> {
    const provider = this.getNextProvider();
    return provider.broadcastTransaction(txHex);
  }

  async getTransaction(txid: string): Promise<any> {
    const provider = this.getNextProvider();
    return provider.getTransaction(txid);
  }

  async getBlockHeight(): Promise<number> {
    const provider = this.getNextProvider();
    return provider.getBlockHeight();
  }

  private getNextProvider(): MockElectrumXProvider {
    const provider = this.providers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.providers.length;
    return provider;
  }

  // Test utilities
  getProviderCount(): number {
    return this.providers.length;
  }

  getTotalCallCount(): number {
    return this.providers.reduce((total, provider) => total + provider.getCallCount(), 0);
  }

  resetAllCallCounts(): void {
    this.providers.forEach((provider) => provider.resetCallCount());
  }

  setProviderFailure(index: number, shouldFail: boolean): void {
    if (this.providers[index]) {
      this.providers[index].setFailureMode(shouldFail);
    }
  }

  addMockUTXOToAll(utxo: UTXO): void {
    this.providers.forEach((provider) => provider.addMockUTXO(utxo));
  }
}

/**
 * Mock Rate Limiter for testing rate limiting behavior
 */
export class MockRateLimiter {
  private callTimes: number[] = [];
  private maxCallsPerSecond: number;
  private enabled = true;

  constructor(maxCallsPerSecond: number = 10) {
    this.maxCallsPerSecond = maxCallsPerSecond;
  }

  async checkRateLimit(): Promise<void> {
    if (!this.enabled) return;

    const now = Date.now();
    this.callTimes = this.callTimes.filter((time) => now - time < 1000);

    if (this.callTimes.length >= this.maxCallsPerSecond) {
      const delay = 1000 - (now - this.callTimes[0]);
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    this.callTimes.push(now);
  }

  // Test utilities
  getCallCount(): number {
    return this.callTimes.length;
  }

  resetCallHistory(): void {
    this.callTimes = [];
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setMaxCallsPerSecond(maxCalls: number): void {
    this.maxCallsPerSecond = maxCalls;
  }
}

/**
 * Mock API client for external service testing
 */
export class MockAPIClient {
  private responses: Map<string, any> = new Map();
  private callHistory: Array<{ endpoint: string; params: any; timestamp: number }> = [];
  private shouldFail = false;
  private failureMessage = 'Mock API failure';

  setMockResponse(endpoint: string, response: any): void {
    this.responses.set(endpoint, response);
  }

  async get(endpoint: string, params?: any): Promise<any> {
    this.callHistory.push({ endpoint, params, timestamp: Date.now() });

    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }

    const response = this.responses.get(endpoint);
    if (!response) {
      throw new Error(`No mock response configured for endpoint: ${endpoint}`);
    }

    return response;
  }

  async post(endpoint: string, data: any): Promise<any> {
    this.callHistory.push({ endpoint, params: data, timestamp: Date.now() });

    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }

    const response = this.responses.get(endpoint);
    if (!response) {
      throw new Error(`No mock response configured for endpoint: ${endpoint}`);
    }

    return response;
  }

  // Test utilities
  getCallHistory(): Array<{ endpoint: string; params: any; timestamp: number }> {
    return [...this.callHistory];
  }

  getCallCount(endpoint?: string): number {
    if (endpoint) {
      return this.callHistory.filter((call) => call.endpoint === endpoint).length;
    }
    return this.callHistory.length;
  }

  clearCallHistory(): void {
    this.callHistory = [];
  }

  setFailureMode(shouldFail: boolean, message?: string): void {
    this.shouldFail = shouldFail;
    if (message) this.failureMessage = message;
  }

  clearMockResponses(): void {
    this.responses.clear();
  }
}

/**
 * Factory for creating configured mock providers
 */
export class MockProviderFactory {
  static createElectrumXProvider(config?: {
    utxoCount?: number;
    shouldFail?: boolean;
    networkDelay?: number;
  }): MockElectrumXProvider {
    const mockUtxos = config?.utxoCount
      ? Array.from({ length: config.utxoCount }, (_, i) => ({
        txid: `mock_tx_${i}`,
        vout: 0,
        value: 100000 + i * 1000,
        scriptPubKey: `mock_script_${i}`,
        confirmations: 6,
      }))
      : [];

    return new MockElectrumXProvider({
      utxos: mockUtxos,
      shouldFail: config?.shouldFail || false,
      networkDelay: config?.networkDelay || 0,
    });
  }

  static createPooledProvider(config?: {
    providerCount?: number;
    failureRate?: number;
  }): MockPooledProvider {
    return new MockPooledProvider(
      config?.providerCount || 3,
      config?.failureRate || 0,
    );
  }

  static createRateLimiter(maxCallsPerSecond: number = 10): MockRateLimiter {
    return new MockRateLimiter(maxCallsPerSecond);
  }

  static createAPIClient(): MockAPIClient {
    return new MockAPIClient();
  }
}

/**
 * Dependency injection container for tests
 */
export class TestDIContainer {
  private providers: Map<string, any> = new Map();

  register<T>(name: string, instance: T): void {
    this.providers.set(name, instance);
  }

  resolve<T>(name: string): T {
    const instance = this.providers.get(name);
    if (!instance) {
      throw new Error(`No provider registered for: ${name}`);
    }
    return instance;
  }

  clear(): void {
    this.providers.clear();
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  // Common test setup methods
  setupBasicProviders(): void {
    this.register('electrumx', MockProviderFactory.createElectrumXProvider({ utxoCount: 10 }));
    this.register('pooled', MockProviderFactory.createPooledProvider());
    this.register('rateLimiter', MockProviderFactory.createRateLimiter());
    this.register('apiClient', MockProviderFactory.createAPIClient());
  }

  setupFailureProviders(): void {
    this.register(
      'electrumx',
      MockProviderFactory.createElectrumXProvider({
        utxoCount: 5,
        shouldFail: true,
      }),
    );
    this.register(
      'pooled',
      MockProviderFactory.createPooledProvider({
        providerCount: 3,
        failureRate: 0.5,
      }),
    );
  }

  setupSlowProviders(): void {
    this.register(
      'electrumx',
      MockProviderFactory.createElectrumXProvider({
        utxoCount: 10,
        networkDelay: 500,
      }),
    );
  }
}
