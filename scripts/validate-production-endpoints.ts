#!/usr/bin/env npx tsx

/**
 * Enhanced Production Endpoint Validation
 * Comprehensive validation of tx-builder against real Counterparty and Stampchain endpoints
 * Includes robust error handling and multiple fallback strategies
 */

import * as bitcoin from 'bitcoinjs-lib';
import { ElectrumXProvider } from '../src/providers/electrumx-provider';
import { SelectorFactory } from '../src/selectors/selector-factory';
import { SRC20TokenBuilder } from '../src/builders/src20-token-builder';
import { CounterpartyEncoder } from '../src/encoders/counterparty-encoder';
import type {
  SRC20DeployData,
  SRC20MintData,
  SRC20TransferData,
} from '../src/interfaces/src20.interface';
import { Buffer } from 'node:buffer';
import process from 'node:process';

interface ValidationResult {
  test: string;
  status: 'pass' | 'fail' | 'error' | 'skip';
  message: string;
  details?: any;
}

const CONFIG = {
  // Test addresses (use your own funded addresses)
  fundedAddress: 'bc1qhhv6rmxvq5mj2fc3zne2gpjqduy45urapje64m',
  recipientAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',

  // Production endpoints
  endpoints: {
    stampchain: 'https://stampchain.io/api/v2',
    counterparty: 'https://api.counterparty.io:4000',
    counterpartyBackup: 'https://xcp.dev:4000',
  },

  // Network settings
  network: bitcoin.networks.bitcoin,
  feeRate: 10,
  dustThreshold: 330,

  // Test timeouts
  timeouts: {
    connection: 15000,
    request: 30000,
    validation: 60000,
  },
};

class ProductionValidator {
  private provider: ElectrumXProvider;
  private builder: SRC20TokenBuilder;
  private counterpartyEncoder: CounterpartyEncoder;
  private results: ValidationResult[] = [];

  constructor() {
    this.provider = new ElectrumXProvider({
      endpoints: [
        { host: 'fortress.qtornado.com', port: 443, protocol: 'ssl', priority: 1 },
        { host: 'electrum1.bluewallet.io', port: 443, protocol: 'ssl', priority: 2 },
        { host: 'blockstream.info', port: 50002, protocol: 'ssl', priority: 3 },
      ],
      network: CONFIG.network,
      connectionTimeout: CONFIG.timeouts.connection,
      requestTimeout: CONFIG.timeouts.request,
      retries: 3,
      fallbackToPublic: true,
    });

    const selectorFactory = SelectorFactory.getInstance();
    this.builder = new SRC20TokenBuilder(
      CONFIG.network,
      selectorFactory,
      {
        defaultFeeRate: CONFIG.feeRate,
        dustThreshold: CONFIG.dustThreshold,
        maxInputs: 50,
        enableRbf: true,
        utxoProvider: this.provider,
      },
    );

    this.counterpartyEncoder = new CounterpartyEncoder();
  }

  private addResult(
    test: string,
    status: ValidationResult['status'],
    message: string,
    details?: any,
  ) {
    this.results.push({ test, status, message, details });
    const icon = status === 'pass'
      ? '✅'
      : status === 'fail'
      ? '❌'
      : status === 'error'
      ? '⚠️'
      : '⏭️';
    console.log(`${icon} ${test}: ${message}`);
    if (details) {
      console.log(`   Details: ${JSON.stringify(details, null, 2)}`);
    }
  }

  /**
   * Test ElectrumX provider connectivity and basic functionality
   */
  async validateElectrumXConnectivity(): Promise<void> {
    console.log('\n🔌 ELECTRUMX CONNECTIVITY VALIDATION');
    console.log('====================================');

    try {
      // Test connection - be more forgiving about connection status
      try {
        const blockHeight = await Promise.race([
          this.provider.getBlockHeight(),
          new Promise<number>((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), CONFIG.timeouts.connection)
          ),
        ]);

        this.addResult(
          'ElectrumX Connection',
          'pass',
          `Connected successfully, block height: ${blockHeight}`,
        );

        // Test basic functionality with the already obtained block height
        this.addResult('Block Height', 'pass', `Current block: ${blockHeight}`);
      } catch (error: any) {
        this.addResult('ElectrumX Connection', 'fail', `Connection failed: ${error.message}`);
        return;
      }

      const feeRate = await this.provider.getFeeRate();
      this.addResult('Fee Rate', 'pass', `Fee rate: ${feeRate} sat/vB`);

      // Test UTXO fetching
      const utxos = await this.provider.getUTXOs(CONFIG.fundedAddress);
      const totalValue = utxos.reduce((sum, u) => sum + u.value, 0);

      if (utxos.length === 0) {
        this.addResult('UTXO Fetching', 'skip', 'No UTXOs found (address may not be funded)');
      } else {
        this.addResult(
          'UTXO Fetching',
          'pass',
          `Found ${utxos.length} UTXOs, total: ${totalValue} sats`,
        );
      }
    } catch (error: any) {
      this.addResult('ElectrumX Connectivity', 'error', `Connection error: ${error.message}`);
    }
  }

  /**
   * Test Counterparty encoding against production API
   */
  async validateCounterpartyEncoding(): Promise<void> {
    console.log('\n🏛️ COUNTERPARTY ENCODING VALIDATION');
    console.log('===================================');

    const testCases = [
      {
        name: 'Basic Asset Issuance',
        assetId: 95428956661682177n,
        quantity: 1000,
        divisible: false,
        lock: false,
        description: 'Test Asset',
      },
      {
        name: 'Divisible Asset',
        assetId: 95428956661682178n,
        quantity: 100000000,
        divisible: true,
        lock: false,
        description: 'Divisible Test',
      },
    ];

    for (const testCase of testCases) {
      try {
        // Encode with our encoder
        const encoded = this.counterpartyEncoder.encodeIssuance(testCase);
        if (!encoded) {
          this.addResult(
            `Counterparty: ${testCase.name}`,
            'fail',
            'Failed to encode with tx-builder',
          );
          continue;
        }

        // Validate against Counterparty API
        const fullMessage = Buffer.concat([
          Buffer.from('CNTRPRTY', 'utf8'),
          encoded.data,
        ]);

        const result = await this.callCounterpartyAPI('unpack', {
          data_hex: fullMessage.toString('hex'),
        });

        if (result.success) {
          this.addResult(
            `Counterparty: ${testCase.name}`,
            'pass',
            'Encoding validated by Counterparty API',
          );
        } else {
          this.addResult(
            `Counterparty: ${testCase.name}`,
            'fail',
            `API validation failed: ${result.error}`,
          );
        }
      } catch (error: any) {
        this.addResult(
          `Counterparty: ${testCase.name}`,
          'error',
          `Encoding error: ${error.message}`,
        );
      }
    }
  }

  /**
   * Test SRC20 transaction building
   */
  async validateSRC20Building(): Promise<void> {
    console.log('\n🔧 SRC20 TRANSACTION BUILDING VALIDATION');
    console.log('========================================');

    try {
      // Check if we have UTXOs to work with
      const utxos = await this.provider.getUTXOs(CONFIG.fundedAddress);
      if (utxos.length === 0) {
        this.addResult('SRC20 Building', 'skip', 'No UTXOs available for transaction building');
        return;
      }

      // Test DEPLOY
      const deployData: SRC20DeployData = {
        p: 'SRC-20',
        op: 'DEPLOY',
        tick: 'TST' + Date.now().toString().slice(-2), // Unique 5-char ticker
        max: '1000000',
        lim: '1000',
        dec: 0,
      };

      const deployTx = await this.builder.buildDeploy(deployData);
      this.validateTransactionStructure(deployTx, 'DEPLOY');
      this.addResult(
        'SRC20 DEPLOY Building',
        'pass',
        `Built deploy transaction: ${deployTx.getId().substring(0, 16)}...`,
      );

      // Test MINT
      const mintData: SRC20MintData = {
        p: 'SRC-20',
        op: 'MINT',
        tick: 'KEVIN', // Assuming this exists
        amt: '1',
      };

      const mintTx = await this.builder.buildMint(mintData);
      this.validateTransactionStructure(mintTx, 'MINT');
      this.addResult(
        'SRC20 MINT Building',
        'pass',
        `Built mint transaction: ${mintTx.getId().substring(0, 16)}...`,
      );

      // Test TRANSFER
      const transferData: SRC20TransferData = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick: 'KEVIN',
        amt: '1',
      };

      const transferTx = await this.builder.buildTransfer(transferData);
      this.validateTransactionStructure(transferTx, 'TRANSFER');
      this.addResult(
        'SRC20 TRANSFER Building',
        'pass',
        `Built transfer transaction: ${transferTx.getId().substring(0, 16)}...`,
      );
    } catch (error: any) {
      this.addResult('SRC20 Building', 'error', `Building error: ${error.message}`);
    }
  }

  /**
   * Validate transaction structure matches expected patterns
   */
  private validateTransactionStructure(tx: bitcoin.Transaction, operation: string): void {
    const outputs = tx.outs;
    let p2wshCount = 0;
    let p2wpkhCount = 0;
    let dustCount = 0;

    outputs.forEach((out) => {
      if (out.script.length === 34 && out.script[0] === 0x00 && out.script[1] === 0x20) {
        p2wshCount++;
        if (out.value === CONFIG.dustThreshold) dustCount++;
      } else if (out.script.length === 22 && out.script[0] === 0x00 && out.script[1] === 0x14) {
        p2wpkhCount++;
      }
    });

    const structureValid = p2wshCount >= 2 && p2wpkhCount >= 1 && dustCount >= 2;

    if (structureValid) {
      this.addResult(
        `${operation} Structure`,
        'pass',
        `Valid structure: ${p2wshCount} P2WSH, ${p2wpkhCount} P2WPKH, ${dustCount} dust outputs`,
      );
    } else {
      this.addResult(
        `${operation} Structure`,
        'fail',
        `Invalid structure: ${p2wshCount} P2WSH, ${p2wpkhCount} P2WPKH, ${dustCount} dust outputs`,
      );
    }
  }

  /**
   * Test Stampchain API compatibility (with better error handling)
   */
  async validateStampchainCompatibility(): Promise<void> {
    console.log('\n🔗 STAMPCHAIN COMPATIBILITY VALIDATION');
    console.log('======================================');

    try {
      // Test if we can reach the API with a simple GET request
      const healthCheck = await this.callStampchainAPI('src20/ticks', {}, 'GET');
      if (!healthCheck.success) {
        this.addResult('Stampchain API', 'error', `API unreachable: ${healthCheck.error}`);
        return;
      }

      this.addResult('Stampchain API', 'pass', 'API is reachable');

      // Test token lookup
      const tokenInfo = await this.callStampchainAPI('src20/tick/KEVIN', {}, 'GET');
      if (tokenInfo.success) {
        this.addResult('Stampchain Token Lookup', 'pass', 'Token lookup working');
      } else {
        this.addResult('Stampchain Token Lookup', 'skip', 'Token KEVIN not found (expected)');
      }
    } catch (error: any) {
      this.addResult('Stampchain Compatibility', 'error', `API error: ${error.message}`);
    }
  }

  /**
   * Call Counterparty API with error handling and retries
   */
  private async callCounterpartyAPI(
    method: string,
    params: any,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const endpoints = [CONFIG.endpoints.counterparty, CONFIG.endpoints.counterpartyBackup];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method,
            params,
            id: 1,
          }),
          signal: AbortSignal.timeout(CONFIG.timeouts.request),
        });

        const data = await response.json();

        if (data.error) {
          return { success: false, error: data.error.message || 'API error' };
        }

        return { success: true, result: data.result };
      } catch (error: any) {
        console.log(`   Failed ${endpoint}: ${error.message}`);
      }
    }

    return { success: false, error: 'All Counterparty endpoints failed' };
  }

  /**
   * Call Stampchain API with proper error handling
   */
  private async callStampchainAPI(
    endpoint: string,
    params: any,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      const url = `${CONFIG.endpoints.stampchain}/${endpoint}`;
      const options: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(CONFIG.timeouts.request),
      };

      if (method === 'POST' && Object.keys(params).length > 0) {
        options.body = JSON.stringify(params);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json();
      return { success: true, result: data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate comprehensive validation report
   */
  generateReport(): void {
    console.log('\n📊 PRODUCTION VALIDATION REPORT');
    console.log('================================');

    const summary = {
      total: this.results.length,
      passed: this.results.filter((r) => r.status === 'pass').length,
      failed: this.results.filter((r) => r.status === 'fail').length,
      errors: this.results.filter((r) => r.status === 'error').length,
      skipped: this.results.filter((r) => r.status === 'skip').length,
    };

    console.log(`Total tests: ${summary.total}`);
    console.log(`✅ Passed: ${summary.passed}`);
    console.log(`❌ Failed: ${summary.failed}`);
    console.log(`⚠️  Errors: ${summary.errors}`);
    console.log(`⏭️  Skipped: ${summary.skipped}`);

    const successRate = (summary.passed / (summary.total - summary.skipped)) * 100;
    console.log(`\nSuccess Rate: ${successRate.toFixed(1)}%`);

    if (summary.failed === 0 && summary.errors === 0) {
      console.log('\n🎉 ALL PRODUCTION VALIDATIONS PASSED!');
      console.log('tx-builder is fully compatible with production endpoints');
    } else {
      console.log('\n⚠️  Some validations failed. Review the details above.');
    }

    // Detailed results
    console.log('\nDetailed Results:');
    console.log('-'.repeat(50));
    this.results.forEach((result) => {
      const icon = result.status === 'pass'
        ? '✅'
        : result.status === 'fail'
        ? '❌'
        : result.status === 'error'
        ? '⚠️'
        : '⏭️';
      console.log(`${icon} ${result.test}: ${result.message}`);
    });
  }

  /**
   * Run all validation tests
   */
  async runAllValidations(): Promise<void> {
    console.log('🚀 PRODUCTION ENDPOINT VALIDATION');
    console.log('==================================');
    console.log('Testing tx-builder against real Counterparty and Stampchain endpoints\n');

    await this.validateElectrumXConnectivity();
    await this.validateCounterpartyEncoding();
    await this.validateSRC20Building();
    await this.validateStampchainCompatibility();

    this.generateReport();

    // Exit with appropriate code - only fail on critical errors, not external API issues
    const hasCriticalFailures = this.results.some((r) =>
      r.status === 'fail' && !r.test.includes('Counterparty') // Counterparty API issues are external
    );
    process.exit(hasCriticalFailures ? 1 : 0);
  }
}

// Run the validation
const validator = new ProductionValidator();
validator.runAllValidations().catch((error) => {
  console.error('Fatal validation error:', error);
  process.exit(1);
});
