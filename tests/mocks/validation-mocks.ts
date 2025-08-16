/**
 * Validation Service Mocks for Dependency Injection Testing
 *
 * Mocks for all validation services to enable isolated unit testing
 * without external dependencies on validation APIs.
 */

import type { UTXO } from '../../src/interfaces/provider.interface';
import { Buffer } from 'node:buffer';

/**
 * Mock Ordinals Detector for testing ordinal-aware UTXO selection
 */
export class MockOrdinalsDetector {
  private protectedUTXOs: Set<string> = new Set();
  private inscriptionData: Map<string, any> = new Map();
  private shouldFail = false;
  private networkDelay = 0;
  private callCount = 0;

  constructor(config?: {
    protectedUTXOs?: string[];
    shouldFail?: boolean;
    networkDelay?: number;
  }) {
    if (config?.protectedUTXOs) {
      config.protectedUTXOs.forEach((utxo) => this.protectedUTXOs.add(utxo));
    }
    if (config?.shouldFail) this.shouldFail = config.shouldFail;
    if (config?.networkDelay) this.networkDelay = config.networkDelay;
  }

  async isProtectedUTXO(utxo: UTXO): Promise<boolean> {
    this.callCount++;

    if (this.networkDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.networkDelay));
    }

    if (this.shouldFail) {
      throw new Error('Mock ordinals detector failure');
    }

    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    return this.protectedUTXOs.has(utxoKey);
  }

  async getInscriptionData(utxo: UTXO): Promise<any> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error('Failed to get inscription data');
    }

    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    return this.inscriptionData.get(utxoKey) || null;
  }

  // Test utilities
  addProtectedUTXO(utxo: UTXO, inscriptionData?: any): void {
    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    this.protectedUTXOs.add(utxoKey);

    if (inscriptionData) {
      this.inscriptionData.set(utxoKey, inscriptionData);
    }
  }

  removeProtectedUTXO(utxo: UTXO): void {
    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    this.protectedUTXOs.delete(utxoKey);
    this.inscriptionData.delete(utxoKey);
  }

  clearProtectedUTXOs(): void {
    this.protectedUTXOs.clear();
    this.inscriptionData.clear();
  }

  getCallCount(): number {
    return this.callCount;
  }

  resetCallCount(): void {
    this.callCount = 0;
  }

  setFailureMode(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setNetworkDelay(delay: number): void {
    this.networkDelay = delay;
  }
}

/**
 * Mock Counterparty Detector for testing Counterparty token detection
 */
export class MockCounterpartyDetector {
  private protectedUTXOs: Set<string> = new Set();
  private tokenData: Map<string, any> = new Map();
  private shouldFail = false;
  private callCount = 0;

  constructor(config?: {
    protectedUTXOs?: string[];
    shouldFail?: boolean;
  }) {
    if (config?.protectedUTXOs) {
      config.protectedUTXOs.forEach((utxo) => this.protectedUTXOs.add(utxo));
    }
    if (config?.shouldFail) this.shouldFail = config.shouldFail;
  }

  async isProtectedUTXO(utxo: UTXO): Promise<boolean> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error('Mock counterparty detector failure');
    }

    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    return this.protectedUTXOs.has(utxoKey);
  }

  async getTokenData(utxo: UTXO): Promise<any> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error('Failed to get token data');
    }

    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    return this.tokenData.get(utxoKey) || null;
  }

  // Test utilities
  addProtectedUTXO(utxo: UTXO, tokenData?: any): void {
    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    this.protectedUTXOs.add(utxoKey);

    if (tokenData) {
      this.tokenData.set(utxoKey, tokenData);
    }
  }

  removeProtectedUTXO(utxo: UTXO): void {
    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    this.protectedUTXOs.delete(utxoKey);
    this.tokenData.delete(utxoKey);
  }

  clearProtectedUTXOs(): void {
    this.protectedUTXOs.clear();
    this.tokenData.clear();
  }

  getCallCount(): number {
    return this.callCount;
  }

  resetCallCount(): void {
    this.callCount = 0;
  }

  setFailureMode(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }
}

/**
 * Mock Script Validator for testing script validation
 */
export class MockScriptValidator {
  private validScripts: Set<string> = new Set();
  private shouldFail = false;
  private callCount = 0;
  private strictMode = false;

  constructor(config?: {
    validScripts?: string[];
    shouldFail?: boolean;
    strictMode?: boolean;
  }) {
    if (config?.validScripts) {
      config.validScripts.forEach((script) => this.validScripts.add(script));
    }
    if (config?.shouldFail) this.shouldFail = config.shouldFail;
    if (config?.strictMode) this.strictMode = config.strictMode;
  }

  async validateScript(scriptHex: string): Promise<boolean> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error('Mock script validator failure');
    }

    // In strict mode, only explicitly valid scripts pass
    if (this.strictMode) {
      return this.validScripts.has(scriptHex);
    }

    // In permissive mode, only explicitly invalid scripts fail
    return !this.validScripts.has(scriptHex);
  }

  async validateP2WSHScript(scriptHex: string): Promise<{
    isValid: boolean;
    witnessScript?: Buffer;
    redeemScript?: Buffer;
    errors?: string[];
  }> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error('P2WSH script validation failure');
    }

    const isValid = await this.validateScript(scriptHex);
    const errors = isValid ? [] : ['Invalid P2WSH script structure'];

    return {
      isValid,
      witnessScript: isValid ? Buffer.from(scriptHex, 'hex') : undefined,
      redeemScript: isValid ? Buffer.from('0020' + scriptHex, 'hex') : undefined,
      errors,
    };
  }

  async validateTransactionScript(
    inputs: any[],
    outputs: any[],
  ): Promise<{
    isValid: boolean;
    inputValidations: boolean[];
    outputValidations: boolean[];
    errors: string[];
  }> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error('Transaction script validation failure');
    }

    const inputValidations = inputs.map((input) =>
      this.validateScript(input.scriptSig || input.witness?.[0] || '')
    );

    const outputValidations = outputs.map((output) =>
      this.validateScript(output.scriptPubKey || '')
    );

    const allValid = [...inputValidations, ...outputValidations].every((v) => v);
    const errors = allValid ? [] : ['One or more scripts failed validation'];

    return {
      isValid: allValid,
      inputValidations: await Promise.all(inputValidations),
      outputValidations: await Promise.all(outputValidations),
      errors,
    };
  }

  // Test utilities
  addValidScript(scriptHex: string): void {
    this.validScripts.add(scriptHex);
  }

  removeValidScript(scriptHex: string): void {
    this.validScripts.delete(scriptHex);
  }

  clearValidScripts(): void {
    this.validScripts.clear();
  }

  getCallCount(): number {
    return this.callCount;
  }

  resetCallCount(): void {
    this.callCount = 0;
  }

  setFailureMode(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setStrictMode(strictMode: boolean): void {
    this.strictMode = strictMode;
  }
}

/**
 * Mock Stamp Validator for testing stamp validation
 */
export class MockStampValidator {
  private validStamps: Set<string> = new Set();
  private stampMetadata: Map<string, any> = new Map();
  private shouldFail = false;
  private callCount = 0;

  constructor(config?: {
    validStamps?: string[];
    shouldFail?: boolean;
  }) {
    if (config?.validStamps) {
      config.validStamps.forEach((stamp) => this.validStamps.add(stamp));
    }
    if (config?.shouldFail) this.shouldFail = config.shouldFail;
  }

  async validateStamp(imageData: Buffer, mimeType: string): Promise<{
    isValid: boolean;
    metadata?: any;
    errors?: string[];
  }> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error('Mock stamp validator failure');
    }

    const stampHash = this.hashBuffer(imageData);
    const isValid = this.validStamps.has(stampHash);
    const metadata = this.stampMetadata.get(stampHash);
    const errors = isValid ? [] : ['Invalid stamp format or content'];

    return {
      isValid,
      metadata,
      errors,
    };
  }

  async validateStampTransaction(transaction: any): Promise<{
    isValidStampTransaction: boolean;
    hasValidP2WSH: boolean;
    hasValidOpReturn: boolean;
    stampsFound: number;
    errors: string[];
  }> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error('Stamp transaction validation failure');
    }

    // Mock validation logic
    const hasP2WSH = transaction.outputs?.some((output: any) =>
      output.scriptPubKey?.startsWith('0020')
    );

    const hasOpReturn = transaction.outputs?.some((output: any) =>
      output.scriptPubKey?.startsWith('6a')
    );

    const isValid = hasP2WSH && hasOpReturn;
    const stampsFound = isValid ? 1 : 0;
    const errors = isValid ? [] : ['Invalid stamp transaction structure'];

    return {
      isValidStampTransaction: isValid,
      hasValidP2WSH: hasP2WSH || false,
      hasValidOpReturn: hasOpReturn || false,
      stampsFound,
      errors,
    };
  }

  // Test utilities
  addValidStamp(imageData: Buffer, metadata?: any): void {
    const stampHash = this.hashBuffer(imageData);
    this.validStamps.add(stampHash);

    if (metadata) {
      this.stampMetadata.set(stampHash, metadata);
    }
  }

  removeValidStamp(imageData: Buffer): void {
    const stampHash = this.hashBuffer(imageData);
    this.validStamps.delete(stampHash);
    this.stampMetadata.delete(stampHash);
  }

  clearValidStamps(): void {
    this.validStamps.clear();
    this.stampMetadata.clear();
  }

  getCallCount(): number {
    return this.callCount;
  }

  resetCallCount(): void {
    this.callCount = 0;
  }

  setFailureMode(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  private hashBuffer(buffer: Buffer): string {
    // Simple hash function for testing
    let hash = 0;
    for (let i = 0; i < buffer.length; i++) {
      hash = ((hash << 5) - hash + buffer[i]) & 0xffffffff;
    }
    return hash.toString(16);
  }
}

/**
 * Factory for creating configured mock validators
 */
export class MockValidatorFactory {
  static createOrdinalsDetector(config?: {
    protectedCount?: number;
    shouldFail?: boolean;
    networkDelay?: number;
  }): MockOrdinalsDetector {
    const protectedUTXOs = config?.protectedCount
      ? Array.from({ length: config.protectedCount }, (_, i) => `protected_tx_${i}:0`)
      : [];

    return new MockOrdinalsDetector({
      protectedUTXOs,
      shouldFail: config?.shouldFail || false,
      networkDelay: config?.networkDelay || 0,
    });
  }

  static createCounterpartyDetector(config?: {
    protectedCount?: number;
    shouldFail?: boolean;
  }): MockCounterpartyDetector {
    const protectedUTXOs = config?.protectedCount
      ? Array.from({ length: config.protectedCount }, (_, i) => `cp_tx_${i}:0`)
      : [];

    return new MockCounterpartyDetector({
      protectedUTXOs,
      shouldFail: config?.shouldFail || false,
    });
  }

  static createScriptValidator(config?: {
    validScriptCount?: number;
    shouldFail?: boolean;
    strictMode?: boolean;
  }): MockScriptValidator {
    const validScripts = config?.validScriptCount
      ? Array.from({ length: config.validScriptCount }, (_, i) => `valid_script_${i}`)
      : [];

    return new MockScriptValidator({
      validScripts,
      shouldFail: config?.shouldFail || false,
      strictMode: config?.strictMode || false,
    });
  }

  static createStampValidator(config?: {
    validStampCount?: number;
    shouldFail?: boolean;
  }): MockStampValidator {
    const validator = new MockStampValidator({
      shouldFail: config?.shouldFail || false,
    });

    // Add some valid stamps for testing
    if (config?.validStampCount) {
      for (let i = 0; i < config.validStampCount; i++) {
        const mockImageData = Buffer.from(`mock_stamp_${i}`, 'utf8');
        validator.addValidStamp(mockImageData, {
          stampNumber: i,
          creator: 'test_creator',
          description: `Test stamp ${i}`,
        });
      }
    }

    return validator;
  }
}

/**
 * Multi-provider detector mock for testing consensus mechanisms
 */
export class MockOrdinalsMultiProviderDetector {
  private detectors: Array<{
    name: string;
    detector: MockOrdinalsDetector | MockCounterpartyDetector;
  }> = [];
  private strategy: 'first-success' | 'any-positive' | 'consensus' = 'first-success';
  private callCount = 0;

  constructor(strategy: 'first-success' | 'any-positive' | 'consensus' = 'first-success') {
    this.strategy = strategy;
  }

  addDetector(name: string, detector: MockOrdinalsDetector | MockCounterpartyDetector): void {
    this.detectors.push({ name, detector });
  }

  async isProtectedUTXO(utxo: UTXO): Promise<boolean> {
    this.callCount++;

    if (this.detectors.length === 0) {
      return false;
    }

    switch (this.strategy) {
      case 'first-success':
        for (const { detector } of this.detectors) {
          try {
            const result = await detector.isProtectedUTXO(utxo);
            if (result) return true;
          } catch (error) {
            // Continue to next detector
          }
        }
        return false;

      case 'any-positive':
        const results = await Promise.allSettled(
          this.detectors.map(({ detector }) => detector.isProtectedUTXO(utxo)),
        );
        return results.some((result) => result.status === 'fulfilled' && result.value === true);

      case 'consensus':
        const consensusResults = await Promise.allSettled(
          this.detectors.map(({ detector }) => detector.isProtectedUTXO(utxo)),
        );
        const positiveVotes =
          consensusResults.filter((result) =>
            result.status === 'fulfilled' && result.value === true
          ).length;
        return positiveVotes > this.detectors.length / 2;

      default:
        return false;
    }
  }

  getCallCount(): number {
    return this.callCount;
  }

  resetCallCount(): void {
    this.callCount = 0;
  }

  setStrategy(strategy: 'first-success' | 'any-positive' | 'consensus'): void {
    this.strategy = strategy;
  }

  clearDetectors(): void {
    this.detectors = [];
  }

  getDetectorCount(): number {
    return this.detectors.length;
  }
}
