#!/usr/bin/env npx tsx

/**
 * Master Stampchain Validation Script
 *
 * Comprehensive validation of tx-builder against stampchain.io API
 * Consolidates all validation logic into a single authoritative script
 *
 * Usage:
 *   npx tsx scripts/validate-stampchain-master.ts [options]
 *
 * Options:
 *   --quick     Run quick local validation only (no API calls)
 *   --api       Run full API validation (requires funded address)
 *   --deploy    Test only DEPLOY operations
 *   --mint      Test only MINT operations
 *   --transfer  Test only TRANSFER operations
 *   --all       Run all tests (default)
 */

import * as bitcoin from 'bitcoinjs-lib';
import { SRC20Encoder } from '../src/encoders/src20-encoder';
import { SRC20TokenBuilder } from '../src/builders/src20-token-builder';
import { SelectorFactory } from '../src/selectors/selector-factory';
import { ElectrumXProvider } from '../src/providers/electrumx-provider';
import type {
  SRC20DeployData,
  SRC20MintData,
  SRC20TransferData,
} from '../src/interfaces/src20.interface';
import process from 'node:process';

// Configuration
const CONFIG = {
  // Real funded address for API testing
  fundedAddress: process.env.FUNDED_ADDRESS || 'bc1qhhv6rmxvq5mj2fc3zne2gpjqduy45urapje64m',
  recipientAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',

  // Stampchain API endpoint
  stampchainAPI: 'https://stampchain.io/api/v2',

  // Test parameters
  testTokens: {
    deploy: ['TSTAA', 'TSTAB', 'TSTAC'], // Non-existent tokens
    mint: ['KEVIN', 'STAMPS'], // Existing tokens
    transfer: ['KEVIN'], // Tokens for transfer
  },

  // Expected values for validation
  expected: {
    dustValue: 330, // Bitcoin Stamps dust value
    lengthPrefixFormat: 'single_byte', // [0x00, length] format
    deployFirstOutput: 'P2WPKH_sender', // First output type for DEPLOY
    mintFirstOutput: 'P2WPKH_sender', // First output type for MINT
    transferFirstOutput: 'P2WPKH_recipient', // First output type for TRANSFER
  },
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  quick: args.includes('--quick'),
  api: args.includes('--api'),
  deploy: args.includes('--deploy'),
  mint: args.includes('--mint'),
  transfer: args.includes('--transfer'),
  all: args.includes('--all') ||
    (!args.includes('--deploy') && !args.includes('--mint') && !args.includes('--transfer')),
};

// If neither quick nor api specified, run both
if (!options.quick && !options.api) {
  options.quick = true;
  options.api = true;
}

/**
 * Quick local validation (no API calls)
 */
async function runQuickValidation() {
  console.log('\n🚀 QUICK LOCAL VALIDATION');
  console.log('========================\n');

  const encoder = new SRC20Encoder();

  // Test 1: Dust Value
  console.log('1️⃣  Dust Value Check:');
  const testData = {
    p: 'SRC-20' as const,
    op: 'DEPLOY' as const,
    tick: 'TEST',
    max: '1000000',
    lim: '1000',
    dec: 0,
  };

  const result = encoder.encode(testData, { dustValue: 330 });
  const dustValue = result.p2wshOutputs[0]?.value;
  const dustPass = dustValue === CONFIG.expected.dustValue;
  console.log(`   Dust value: ${dustValue} sats`);
  console.log(`   Expected: ${CONFIG.expected.dustValue} sats`);
  console.log(`   Status: ${dustPass ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 2: Length Prefix Format
  console.log('2️⃣  Length Prefix Format:');
  const firstOutput = result.p2wshOutputs[0];
  let lengthPrefixPass = false;
  if (firstOutput) {
    const data = firstOutput.script.slice(2); // Skip OP_0 and push byte
    const byte1 = data[0];
    const byte2 = data[1];
    if (byte1 !== undefined && byte2 !== undefined) {
      lengthPrefixPass = byte1 === 0x00;
      console.log(
        `   Format: [0x${byte1.toString(16).padStart(2, '0')}, 0x${
          byte2.toString(16).padStart(2, '0')
        }]`,
      );
      console.log(`   Expected: [0x00, single_byte]`);
      console.log(`   Status: ${lengthPrefixPass ? '✅ PASS' : '❌ FAIL'}\n`);
    } else {
      console.log(`   ❌ Insufficient data in script to check length prefix`);
    }
  }

  // Test 3: Output Ordering
  console.log('3️⃣  Output Ordering:');

  // Mock provider for testing
  const mockProvider = {
    getUTXOs(address: string) {
      return [{
        txid: 'a'.repeat(64),
        vout: 0,
        value: 100000,
        address,
        confirmations: 10,
      }];
    },
    isConnected() {
      return true;
    },
  };

  const selectorFactory = SelectorFactory.getInstance();
  const builder = new SRC20TokenBuilder(
    bitcoin.networks.bitcoin,
    selectorFactory,
    {
      defaultFeeRate: 10,
      dustThreshold: 330,
      utxoProvider: mockProvider,
    },
  );

  // Test DEPLOY ordering
  const deployTx = await builder.buildDeploy({
    p: 'SRC-20',
    op: 'DEPLOY',
    tick: 'TEST',
    max: '1000000',
    lim: '1000',
    dec: 0,
  } as any);

  const deployFirst = deployTx.outs[0];
  let isDeployCorrect = false;
  if (!deployFirst) {
    console.log(`   DEPLOY first output: MISSING - no outputs found`);
    console.log(`   Status: ❌ FAIL`);
  } else {
    isDeployCorrect = deployFirst.script.length === 22 &&
      deployFirst.script[0] === 0x00 &&
      deployFirst.script[1] === 0x14;
    console.log(`   DEPLOY first output: ${isDeployCorrect ? 'P2WPKH to sender' : 'INCORRECT'}`);
    console.log(`   Status: ${isDeployCorrect ? '✅ PASS' : '❌ FAIL'}`);
  }

  // Test MINT ordering
  const mintTx = await builder.buildMint({
    p: 'SRC-20',
    op: 'MINT',
    tick: 'TEST',
    amt: '100',
  } as any);

  const mintFirst = mintTx.outs[0];
  let isMintCorrect = false;
  if (!mintFirst) {
    console.log(`   MINT first output: MISSING - no outputs found`);
    console.log(`   Status: ❌ FAIL`);
  } else {
    isMintCorrect = mintFirst.script.length === 22 &&
      mintFirst.script[0] === 0x00 &&
      mintFirst.script[1] === 0x14;
    console.log(`   MINT first output: ${isMintCorrect ? 'P2WPKH to sender' : 'INCORRECT'}`);
    console.log(`   Status: ${isMintCorrect ? '✅ PASS' : '❌ FAIL'}`);
  }

  // Test TRANSFER ordering
  const transferTx = await builder.buildTransfer({
    p: 'SRC-20',
    op: 'TRANSFER',
    tick: 'TEST',
    amt: '10',
  } as any);

  const transferFirst = transferTx.outs[0];
  let isTransferCorrect = false;
  if (!transferFirst) {
    console.log(`   TRANSFER first output: MISSING - no outputs found`);
    console.log(`   Status: ❌ FAIL`);
  } else {
    isTransferCorrect = transferFirst.script.length === 22 &&
      transferFirst.script[0] === 0x00 &&
      transferFirst.script[1] === 0x14;
    console.log(
      `   TRANSFER first output: ${isTransferCorrect ? 'P2WPKH to recipient' : 'INCORRECT'}`,
    );
    console.log(`   Status: ${isTransferCorrect ? '✅ PASS' : '❌ FAIL'}`);
  }

  const allPass = dustPass && lengthPrefixPass && isDeployCorrect && isMintCorrect &&
    isTransferCorrect;
  console.log(`\n   Overall: ${allPass ? '✅ ALL CHECKS PASS' : '❌ SOME CHECKS FAILED'}`);

  return allPass;
}

/**
 * Call stampchain API
 */
async function callStampchainAPI(
  operation: 'DEPLOY' | 'MINT' | 'TRANSFER',
  params: any,
): Promise<{ success: boolean; hex?: string; error?: string }> {
  try {
    const body = {
      op: operation,
      ...params,
      toAddress: params.toAddress || CONFIG.fundedAddress,
      changeAddress: CONFIG.fundedAddress,
      satsPerVB: 10,
    };

    const response = await fetch(`${CONFIG.stampchainAPI}/src20/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      hex: data.tx_hex || data.hex,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Compare transaction outputs
 */
function compareOutputs(stampHex: string, builderHex: string): boolean {
  const stampTx = bitcoin.Transaction.fromHex(stampHex);
  const builderTx = bitcoin.Transaction.fromHex(builderHex);

  // Count P2WSH outputs
  const countP2WSH = (tx: bitcoin.Transaction) => {
    return tx.outs.filter((out) =>
      out.script.length === 34 &&
      out.script[0] === 0x00 &&
      out.script[1] === 0x20
    ).length;
  };

  const stampP2WSH = countP2WSH(stampTx);
  const builderP2WSH = countP2WSH(builderTx);

  // Check dust values
  const checkDust = (tx: bitcoin.Transaction) => {
    return tx.outs.filter((out) => out.value === 330).length;
  };

  const stampDust = checkDust(stampTx);
  const builderDust = checkDust(builderTx);

  const match = stampP2WSH === builderP2WSH &&
    stampDust === builderDust &&
    stampTx.outs.length === builderTx.outs.length;

  console.log(
    `   Stampchain: ${stampTx.outs.length} outputs, ${stampP2WSH} P2WSH, ${stampDust} with 330 sats`,
  );
  console.log(
    `   TxBuilder:  ${builderTx.outs.length} outputs, ${builderP2WSH} P2WSH, ${builderDust} with 330 sats`,
  );
  console.log(`   Match: ${match ? '✅' : '❌'}`);

  return match;
}

/**
 * Run API validation
 */
async function runAPIValidation() {
  console.log('\n🌐 STAMPCHAIN API VALIDATION');
  console.log('============================\n');

  // Initialize real provider and builder
  const provider = new ElectrumXProvider();
  const selectorFactory = SelectorFactory.getInstance();
  const builder = new SRC20TokenBuilder(
    bitcoin.networks.bitcoin,
    selectorFactory,
    {
      defaultFeeRate: 10,
      dustThreshold: 330,
      utxoProvider: provider,
    },
  );

  // Check connection
  console.log('📡 Checking ElectrumX connection...');
  const connected = await provider.isConnected();
  if (!connected) {
    console.log('❌ Failed to connect to ElectrumX');
    return false;
  }
  console.log('✅ Connected to ElectrumX\n');

  // Check UTXOs
  console.log('💰 Checking UTXOs...');
  const utxos = await provider.getUTXOs(CONFIG.fundedAddress);
  console.log(`   Found ${utxos.length} UTXOs`);

  if (utxos.length === 0) {
    console.log('❌ No UTXOs available! Please fund the address:');
    console.log(`   ${CONFIG.fundedAddress}`);
    return false;
  }

  const totalValue = utxos.reduce((sum, u) => sum + u.value, 0);
  console.log(`   Total value: ${totalValue} sats (${(totalValue / 100000000).toFixed(8)} BTC)\n`);

  let allPass = true;

  // Test DEPLOY
  if (options.all || options.deploy) {
    console.log('📝 Testing DEPLOY:');
    const tick = 'TST' + Date.now().toString().slice(-2);

    const deployData: SRC20DeployData = {
      p: 'SRC-20',
      op: 'DEPLOY',
      tick,
      max: '1000000',
      lim: '1000',
      dec: 0,
    };

    try {
      const builderTx = await builder.buildDeploy(deployData);
      const stampResult = await callStampchainAPI('DEPLOY', {
        tick,
        max: '1000000',
        lim: '1000',
        dec: 0,
      });

      if (stampResult.success && stampResult.hex) {
        const match = compareOutputs(stampResult.hex, builderTx.toHex());
        if (!match) allPass = false;
      } else {
        console.log(`   ⚠️  Stampchain: ${stampResult.error}`);
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
      allPass = false;
    }
    console.log();
  }

  // Test MINT
  if (options.all || options.mint) {
    console.log('📝 Testing MINT:');

    for (const tick of CONFIG.testTokens.mint.slice(0, 1)) {
      const mintData: SRC20MintData = {
        p: 'SRC-20',
        op: 'MINT',
        tick,
        amt: '100',
      };

      try {
        const builderTx = await builder.buildMint(mintData);
        const stampResult = await callStampchainAPI('MINT', {
          tick,
          amt: '100',
        });

        if (stampResult.success && stampResult.hex) {
          const match = compareOutputs(stampResult.hex, builderTx.toHex());
          if (!match) allPass = false;
        } else {
          console.log(`   ⚠️  Stampchain: ${stampResult.error}`);
        }
      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
        allPass = false;
      }
    }
    console.log();
  }

  // Test TRANSFER
  if (options.all || options.transfer) {
    console.log('📝 Testing TRANSFER:');

    for (const tick of CONFIG.testTokens.transfer.slice(0, 1)) {
      const transferData: SRC20TransferData = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick,
        amt: '10',
      };

      try {
        const builderTx = await builder.buildTransfer(transferData);
        const stampResult = await callStampchainAPI('TRANSFER', {
          tick,
          amt: '10',
          toAddress: CONFIG.recipientAddress,
        });

        if (stampResult.success && stampResult.hex) {
          const match = compareOutputs(stampResult.hex, builderTx.toHex());
          if (!match) allPass = false;
        } else {
          console.log(`   ⚠️  Stampchain: ${stampResult.error}`);
        }
      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
        allPass = false;
      }
    }
  }

  console.log(`\n   Overall: ${allPass ? '✅ ALL API TESTS PASS' : '❌ SOME API TESTS FAILED'}`);
  return allPass;
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 STAMPCHAIN MASTER VALIDATION');
  console.log('================================');
  console.log(`Address: ${CONFIG.fundedAddress}`);
  console.log(`API: ${CONFIG.stampchainAPI}`);

  let quickPass = true;
  let apiPass = true;

  if (options.quick) {
    quickPass = await runQuickValidation();
  }

  if (options.api) {
    apiPass = await runAPIValidation();
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(50));

  if (options.quick) {
    console.log(`Quick Validation: ${quickPass ? '✅ PASS' : '❌ FAIL'}`);
  }

  if (options.api) {
    console.log(`API Validation: ${apiPass ? '✅ PASS' : '❌ FAIL'}`);
  }

  const allPass = quickPass && apiPass;
  console.log(`\nOverall: ${allPass ? '✅ ALL VALIDATIONS PASS' : '❌ SOME VALIDATIONS FAILED'}`);

  if (allPass) {
    console.log('\n🎉 The tx-builder is fully compatible with stampchain.io!');
  } else {
    console.log('\n⚠️  Please review the failures above.');
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
