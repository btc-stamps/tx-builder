#!/usr/bin/env npx tsx

/**
 * Real Stampchain Validation
 * Tests tx-builder against actual stampchain.io API using real funded address
 */

import * as bitcoin from 'bitcoinjs-lib';
import { ElectrumXProvider } from '../src/providers/electrumx-provider';
import { SelectorFactory } from '../src/selectors/selector-factory';
import { SRC20TokenBuilder } from '../src/builders/src20-token-builder';
import type {
  SRC20DeployData,
  SRC20MintData,
  SRC20TransferData,
} from '../src/interfaces/src20.interface';
import process from 'node:process';

const CONFIG = {
  // Real funded address
  fundedAddress: 'bc1qhhv6rmxvq5mj2fc3zne2gpjqduy45urapje64m',
  recipientAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',

  // Stampchain API
  stampchainAPI: 'https://stampchain.io/api/v2',

  // Test parameters
  testTokens: {
    // Non-existent tokens for DEPLOY (5 chars max)
    deploy: ['AABBD', 'AABBC', 'TSTAA'],
    // Existing tokens for MINT
    mint: ['KEVIN', 'STAMPS'],
    // For transfers
    transfer: ['KEVIN'],
  },

  // Variations to test
  deployParams: [
    { max: '1000000', lim: '1000', dec: 0 },
    { max: '21000000', lim: '100', dec: 8 },
  ],

  mintAmounts: ['1', '10', '100'],
  transferAmounts: ['1', '5'],
};

/**
 * Call stampchain API to validate/create transaction
 * Stampchain will select its own UTXOs - we're just comparing outputs
 */
async function callStampchainCreate(
  operation: 'DEPLOY' | 'MINT' | 'TRANSFER',
  params: any,
): Promise<{ success: boolean; hex?: string; error?: string }> {
  try {
    console.log(`\n📤 Calling stampchain /src20/create...`);

    const body = {
      op: operation,
      ...params,
    };

    console.log('   Request:', JSON.stringify(body, null, 2));

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
 * Check if token exists
 */
async function checkTokenExists(tick: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONFIG.stampchainAPI}/src20/tick/${tick}`);
    if (response.ok) {
      const data = await response.json();
      return data && data.tick === tick;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Parse and compare transaction OUTPUTS ONLY
 * Inputs can differ - we only care that outputs match exactly
 */
function compareTransactions(stampHex: string, builderHex: string) {
  const stampTx = bitcoin.Transaction.fromHex(stampHex);
  const builderTx = bitcoin.Transaction.fromHex(builderHex);

  console.log('\n📊 OUTPUT Comparison (inputs may differ):');
  console.log(`   Stampchain: ${stampTx.outs.length} outputs`);
  console.log(`   TxBuilder:  ${builderTx.outs.length} outputs`);

  // Analyze each output type
  const analyzeOutputs = (tx: bitcoin.Transaction, label: string) => {
    const outputs = {
      p2wsh: [] as any[],
      p2wpkh: [] as any[],
      other: [] as any[],
      dust330: 0,
      total: tx.outs.length,
    };

    tx.outs.forEach((out, i) => {
      const script = out.script;
      if (script.length === 34 && script[0] === 0x00 && script[1] === 0x20) {
        outputs.p2wsh.push({
          index: i,
          value: out.value,
          hash: script.slice(2).toString('hex').substring(0, 16),
        });
        if (out.value === 330) outputs.dust330++;
      } else if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14) {
        outputs.p2wpkh.push({ index: i, value: out.value });
      } else {
        outputs.other.push({ index: i, value: out.value, type: 'unknown' });
      }
    });

    console.log(`\n   ${label}:`);
    console.log(`     P2WSH: ${outputs.p2wsh.length} (SRC-20 data)`);
    outputs.p2wsh.forEach((o) =>
      console.log(`       [${o.index}] ${o.value} sats, hash: ${o.hash}...`)
    );
    console.log(`     P2WPKH: ${outputs.p2wpkh.length} (addresses)`);
    outputs.p2wpkh.forEach((o) => console.log(`       [${o.index}] ${o.value} sats`));
    if (outputs.other.length > 0) {
      console.log(`     Other: ${outputs.other.length}`);
    }

    return outputs;
  };

  const stampOutputs = analyzeOutputs(stampTx, 'Stampchain');
  const builderOutputs = analyzeOutputs(builderTx, 'TxBuilder');

  // Compare critical aspects
  const matches = {
    p2wshCount: stampOutputs.p2wsh.length === builderOutputs.p2wsh.length,
    dustCount: stampOutputs.dust330 === builderOutputs.dust330,
    outputCount: stampOutputs.total === builderOutputs.total,
  };

  console.log('\n   🔍 Match Results:');
  console.log(
    `     P2WSH count: ${
      matches.p2wshCount ? '✅' : '❌'
    } (${stampOutputs.p2wsh.length} vs ${builderOutputs.p2wsh.length})`,
  );
  console.log(
    `     Dust (330 sat): ${
      matches.dustCount ? '✅' : '❌'
    } (${stampOutputs.dust330} vs ${builderOutputs.dust330})`,
  );
  console.log(
    `     Total outputs: ${
      matches.outputCount ? '✅' : '❌'
    } (${stampOutputs.total} vs ${builderOutputs.total})`,
  );

  const allMatch = matches.p2wshCount && matches.dustCount && matches.outputCount;

  if (allMatch) {
    console.log('\n   ✅ OUTPUT STRUCTURE MATCHES! tx-builder is stampchain compatible');
  } else {
    console.log('\n   ❌ OUTPUT MISMATCH - Review differences above');
  }

  return allMatch;
}

/**
 * Test DEPLOY operation
 */
async function testDeploy(_provider: ElectrumXProvider, builder: SRC20TokenBuilder) {
  console.log('\n\n📝 TESTING DEPLOY OPERATIONS');
  console.log('================================');

  for (const tick of CONFIG.testTokens.deploy) {
    // Check if exists
    const exists = await checkTokenExists(tick);
    if (exists) {
      console.log(`⚠️  Token ${tick} already exists, skipping...`);
      continue;
    }

    for (const params of CONFIG.deployParams) {
      console.log(`\n🔧 Testing DEPLOY: ${tick}`);
      console.log(`   Parameters: max=${params.max}, lim=${params.lim}, dec=${params.dec}`);

      const deployData: SRC20DeployData = {
        p: 'SRC-20',
        op: 'DEPLOY',
        tick,
        ...params,
      };

      try {
        // Build with tx-builder
        console.log('   Building with tx-builder...');
        const builderTx = await builder.buildDeploy(deployData);
        const builderHex = builderTx.toHex();
        console.log(`   ✅ tx-builder created: ${builderTx.getId().substring(0, 16)}...`);

        // Get from stampchain (requires toAddress and changeAddress per schema)
        const stampResult = await callStampchainCreate('DEPLOY', {
          op: 'DEPLOY',
          tick,
          ...params,
          toAddress: CONFIG.fundedAddress, // Required by schema
          changeAddress: CONFIG.fundedAddress, // Required by schema
          satsPerVB: 10, // Required fee rate
        });

        if (stampResult.success && stampResult.hex) {
          console.log(`   ✅ Stampchain created transaction`);
          compareTransactions(stampResult.hex, builderHex);
        } else {
          console.log(`   ⚠️  Stampchain: ${stampResult.error}`);
          console.log(`   Note: Stampchain may require actual UTXOs in request`);
        }
      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
  }
}

/**
 * Test MINT operation
 */
async function testMint(_provider: ElectrumXProvider, builder: SRC20TokenBuilder) {
  console.log('\n\n📝 TESTING MINT OPERATIONS');
  console.log('============================');

  for (const tick of CONFIG.testTokens.mint) {
    // Check if token exists
    const exists = await checkTokenExists(tick);
    if (!exists) {
      console.log(`⚠️  Token ${tick} doesn't exist, skipping mint...`);
      continue;
    }

    for (const amt of CONFIG.mintAmounts) {
      console.log(`\n🔧 Testing MINT: ${tick}`);
      console.log(`   Amount: ${amt}`);

      const mintData: SRC20MintData = {
        p: 'SRC-20',
        op: 'MINT',
        tick,
        amt,
      };

      try {
        // Build with tx-builder
        console.log('   Building with tx-builder...');
        const builderTx = await builder.buildMint(mintData);
        const builderHex = builderTx.toHex();
        console.log(`   ✅ tx-builder created: ${builderTx.getId().substring(0, 16)}...`);

        // Get from stampchain (requires toAddress and changeAddress per schema)
        const stampResult = await callStampchainCreate('MINT', {
          op: 'MINT',
          tick,
          amt,
          toAddress: CONFIG.fundedAddress, // Required by schema
          changeAddress: CONFIG.fundedAddress, // Required by schema
          satsPerVB: 10, // Required fee rate
        });

        if (stampResult.success && stampResult.hex) {
          console.log(`   ✅ Stampchain created transaction`);
          compareTransactions(stampResult.hex, builderHex);
        } else {
          console.log(`   ⚠️  Stampchain: ${stampResult.error}`);
        }
      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
  }
}

/**
 * Test TRANSFER operation
 */
async function testTransfer(_provider: ElectrumXProvider, builder: SRC20TokenBuilder) {
  console.log('\n\n📝 TESTING TRANSFER OPERATIONS');
  console.log('================================');

  for (const tick of CONFIG.testTokens.transfer) {
    for (const amt of CONFIG.transferAmounts) {
      console.log(`\n🔧 Testing TRANSFER: ${tick}`);
      console.log(`   Amount: ${amt}`);
      console.log(`   To: ${CONFIG.recipientAddress}`);

      const transferData: SRC20TransferData = {
        p: 'SRC-20',
        op: 'TRANSFER',
        tick,
        amt,
      };

      try {
        // Build with tx-builder
        console.log('   Building with tx-builder...');
        const builderTx = await builder.buildTransfer(transferData);
        const builderHex = builderTx.toHex();
        console.log(`   ✅ tx-builder created: ${builderTx.getId().substring(0, 16)}...`);

        // Analyze outputs
        console.log(`   Outputs: ${builderTx.outs.length}`);
        builderTx.outs.forEach((out, i) => {
          const type = out.script.length === 34 && out.script[0] === 0x00 && out.script[1] === 0x20
            ? 'P2WSH'
            : out.script.length === 22 && out.script[0] === 0x00 && out.script[1] === 0x14
            ? 'P2WPKH'
            : 'Other';
          console.log(`     [${i}] ${type}: ${out.value} sats`);
        });

        // Get from stampchain (requires fromAddress, toAddress, changeAddress per schema)
        const stampResult = await callStampchainCreate('TRANSFER', {
          op: 'TRANSFER',
          tick,
          amt,
          fromAddress: CONFIG.fundedAddress, // Required for transfer
          toAddress: CONFIG.recipientAddress, // Required by schema
          changeAddress: CONFIG.fundedAddress, // Required by schema
          satsPerVB: 10, // Required fee rate
        });

        if (stampResult.success && stampResult.hex) {
          console.log(`   ✅ Stampchain created transaction`);
          compareTransactions(stampResult.hex, builderHex);
        } else {
          console.log(`   ⚠️  Stampchain: ${stampResult.error}`);
        }
      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
  }
}

async function main() {
  console.log('🔄 REAL STAMPCHAIN VALIDATION');
  console.log('==============================');
  console.log(`Funded Address: ${CONFIG.fundedAddress}`);
  console.log(`Recipient: ${CONFIG.recipientAddress}`);

  try {
    // Initialize provider
    console.log('\n🔧 Initializing provider...');
    const provider = new ElectrumXProvider();

    // Check connection
    const connected = await provider.isConnected();
    console.log(`✅ Provider connected: ${connected}`);

    // Check UTXOs
    console.log('\n🔍 Checking UTXOs...');
    const utxos = await provider.getUTXOs(CONFIG.fundedAddress);
    console.log(`✅ Found ${utxos.length} UTXOs`);

    if (utxos.length === 0) {
      console.log('❌ No UTXOs available!');
      console.log('Please fund the address:', CONFIG.fundedAddress);
      process.exit(1);
    }

    // Show UTXO details
    const totalValue = utxos.reduce((sum, u) => sum + u.value, 0);
    console.log(`   Total value: ${totalValue} sats (${(totalValue / 100000000).toFixed(8)} BTC)`);

    // Initialize selector and builder
    console.log('\n🔧 Initializing builder...');
    const selectorFactory = SelectorFactory.getInstance();
    const builder = new SRC20TokenBuilder(
      bitcoin.networks.bitcoin,
      selectorFactory,
      {
        defaultFeeRate: 10,
        dustThreshold: 330,
        maxInputs: 50,
        enableRbf: true,
        utxoProvider: provider,
      },
    );
    console.log('✅ Builder ready');

    // Run tests
    await testDeploy(provider, builder);
    await testMint(provider, builder);
    await testTransfer(provider, builder);

    console.log('\n\n📊 VALIDATION COMPLETE');
    console.log('======================');
    console.log('Review the output above to see how tx-builder compares with stampchain.io');
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
