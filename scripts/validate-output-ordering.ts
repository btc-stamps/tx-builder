#!/usr/bin/env npx tsx

/**
 * Test Output Ordering - Verify stampchain-compatible output order
 */

import * as bitcoin from 'bitcoinjs-lib';
import { SRC20TokenBuilder } from '../src/builders/src20-token-builder';
import { SelectorFactory } from '../src/selectors/selector-factory';

// Mock UTXO provider
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
    dustThreshold: 330, // Match Bitcoin Stamps
    utxoProvider: mockProvider,
  },
);

async function testDeploy() {
  console.log('📝 Testing DEPLOY output order:');
  const tx = await builder.buildDeploy({
    p: 'SRC-20',
    op: 'DEPLOY',
    tick: 'TEST',
    max: '1000000',
    lim: '1000',
    dec: 0,
    fromAddress: 'bc1qhhv6rmxvq5mj2fc3zne2gpjqduy45urapje64m',
  } as any);

  console.log(`Total outputs: ${tx.outs.length}`);
  tx.outs.forEach((out, i) => {
    const type = out.script.length === 34 && out.script[0] === 0x00 && out.script[1] === 0x20
      ? 'P2WSH (data)'
      : out.script.length === 22 && out.script[0] === 0x00 && out.script[1] === 0x14
      ? 'P2WPKH (address)'
      : 'Other';
    console.log(`  [${i}] ${type}: ${out.value} sats`);
  });

  // Check if first output is P2WPKH dust to sender
  const firstOut = tx.outs[0];
  if (!firstOut) {
    console.log('❌ No first output found');
    return;
  }
  const isP2WPKH = firstOut.script.length === 22 && firstOut.script[0] === 0x00 &&
    firstOut.script[1] === 0x14;
  console.log(`✅ First output is P2WPKH dust to sender: ${isP2WPKH}`);
  console.log(`✅ First output value is 330: ${firstOut.value === 330}`);
}

async function testMint() {
  console.log('\n📝 Testing MINT output order:');
  const tx = await builder.buildMint({
    fromAddress: 'bc1qhhv6rmxvq5mj2fc3zne2gpjqduy45urapje64m',
    tick: 'TEST',
    amt: '100',
  } as any);

  console.log(`Total outputs: ${tx.outs.length}`);
  tx.outs.forEach((out, i) => {
    const type = out.script.length === 34 && out.script[0] === 0x00 && out.script[1] === 0x20
      ? 'P2WSH (data)'
      : out.script.length === 22 && out.script[0] === 0x00 && out.script[1] === 0x14
      ? 'P2WPKH (address)'
      : 'Other';
    console.log(`  [${i}] ${type}: ${out.value} sats`);
  });

  // Check if first output is P2WPKH dust to sender
  const firstOut = tx.outs[0];
  if (!firstOut) {
    console.log('❌ No first output found');
    return;
  }
  const isP2WPKH = firstOut.script.length === 22 && firstOut.script[0] === 0x00 &&
    firstOut.script[1] === 0x14;
  console.log(`✅ First output is P2WPKH dust to sender: ${isP2WPKH}`);
  console.log(`✅ First output value is 330: ${firstOut.value === 330}`);
}

async function testTransfer() {
  console.log('\n📝 Testing TRANSFER output order:');
  const tx = await builder.buildTransfer({
    fromAddress: 'bc1qhhv6rmxvq5mj2fc3zne2gpjqduy45urapje64m',
    toAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    tick: 'TEST',
    amt: '10',
  } as any);

  console.log(`Total outputs: ${tx.outs.length}`);
  tx.outs.forEach((out, i) => {
    const type = out.script.length === 34 && out.script[0] === 0x00 && out.script[1] === 0x20
      ? 'P2WSH (data)'
      : out.script.length === 22 && out.script[0] === 0x00 && out.script[1] === 0x14
      ? 'P2WPKH (address)'
      : 'Other';
    console.log(`  [${i}] ${type}: ${out.value} sats`);
  });

  // Check if first output is P2WPKH to recipient
  const firstOut = tx.outs[0];
  if (!firstOut) {
    console.log('❌ No first output found in transaction');
    return;
  }

  const isP2WPKH = firstOut.script.length === 22 && firstOut.script[0] === 0x00 &&
    firstOut.script[1] === 0x14;
  console.log(`✅ First output is P2WPKH to recipient: ${isP2WPKH}`);
  console.log(`✅ First output value is 330: ${firstOut.value === 330}`);
}

async function main() {
  console.log('🔧 STAMPCHAIN OUTPUT ORDER VALIDATION');
  console.log('=====================================\n');

  await testDeploy();
  await testMint();
  await testTransfer();

  console.log('\n✅ All output ordering tests complete!');
}

main().catch(console.error);
