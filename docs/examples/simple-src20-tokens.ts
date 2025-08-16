/**
 * Simple SRC-20 Token Examples
 *
 * This example demonstrates basic SRC-20 encoding without complex builders.
 * Perfect for understanding how SRC-20 protocol works and how to encode
 * different operations (DEPLOY, MINT, TRANSFER) for Bitcoin Stamps.
 *
 * SRC-20 Protocol Overview:
 * - DEPLOY: Create a new token with supply and limits
 * - MINT: Mint tokens from an existing deployment
 * - TRANSFER: Transfer tokens between addresses
 *
 * Each operation produces Bitcoin transaction outputs that embed the
 * SRC-20 data using P2WSH scripts, following the Bitcoin Stamps protocol.
 *
 * @author Bitcoin Stamps Team
 * @version 1.0.0
 * @since 2024
 */

import * as bitcoin from 'bitcoinjs-lib';
import { SRC20Encoder } from '../src/encoders/src20-encoder';
import type {
  SRC20DeployData,
  SRC20MintData,
  SRC20TransferData,
} from '../src/interfaces/src20.interface';

/**
 * Example 1: Encode SRC-20 DEPLOY operation
 *
 * This function demonstrates how to create a new SRC-20 token deployment.
 * DEPLOY operations define the token properties: ticker, max supply,
 * mint limit per transaction, and decimal places.
 *
 * @returns {void} Logs the encoding results to console
 * @example
 * // Creates a token with:
 * // - Ticker: "TEST" (max 5 characters)
 * // - Max supply: 1,000,000 tokens
 * // - Mint limit: 1,000 tokens per mint transaction
 * // - Decimals: 8 (like Bitcoin)
 */
function encodeSRC20Deploy(): void {
  console.log('🚀 SRC-20 DEPLOY Encoding Example\n');

  const network: bitcoin.networks.Network = bitcoin.networks.bitcoin;
  const encoder: SRC20Encoder = new SRC20Encoder(network);

  // Deploy parameters
  const deployData: SRC20DeployData = {
    p: 'SRC-20',
    op: 'DEPLOY',
    tick: 'TEST', // Token symbol (max 5 chars)
    max: '1000000', // Max supply
    lim: '1000', // Mint limit per transaction
    dec: 8, // Decimal places
  };

  console.log('🪙 Token Parameters:');
  console.log(`   Ticker: ${deployData.tick}`);
  console.log(`   Max Supply: ${deployData.max}`);
  console.log(`   Mint Limit: ${deployData.lim}`);
  console.log(`   Decimals: ${deployData.dec}\n`);

  try {
    const encoded = encoder.encode(deployData);

    console.log('✅ DEPLOY Encoded Successfully:');
    console.log(`   JSON Data: ${encoded.jsonData}`);
    console.log(`   Total Size: ${encoded.totalSize} bytes`);
    console.log(`   Data Size: ${encoded.dataSize} bytes`);
    console.log(`   Outputs: ${encoded.outputs.length}`);
    console.log(`   Compression: ${encoded.compressionUsed ? 'YES' : 'NO'}`);

    // Show output values
    console.log('\n📦 Output Structure:');
    encoded.outputs.forEach((output, i) => {
      console.log(`   [${i}] ${output.value} sats`);
    });
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 2: Encode SRC-20 MINT operation
 *
 * This function shows how to mint tokens from an existing deployment.
 * MINT operations must reference an existing token ticker and specify
 * the amount to mint (limited by the deployment's mint limit).
 *
 * @returns {void} Logs the encoding results to console
 * @example
 * // Mints 100 tokens of the "TEST" token
 * // Must not exceed the deployment's mint limit (1,000 in this case)
 */
function encodeSRC20Mint(): void {
  console.log('\n💎 SRC-20 MINT Encoding Example\n');

  const network: bitcoin.networks.Network = bitcoin.networks.bitcoin;
  const encoder: SRC20Encoder = new SRC20Encoder(network);

  // Mint parameters
  const mintData: SRC20MintData = {
    p: 'SRC-20',
    op: 'MINT',
    tick: 'TEST', // Existing token to mint
    amt: '100', // Amount to mint
  };

  console.log('💰 Mint Parameters:');
  console.log(`   Token: ${mintData.tick}`);
  console.log(`   Amount: ${mintData.amt}\n`);

  try {
    const encoded = encoder.encode(mintData);

    console.log('✅ MINT Encoded Successfully:');
    console.log(`   JSON Data: ${encoded.jsonData}`);
    console.log(`   Total Size: ${encoded.totalSize} bytes`);
    console.log(`   Outputs: ${encoded.outputs.length}`);
  } catch (error) {
    console.error('❌ MINT Error:', error instanceof Error ? error.message : String(error));
    console.error('   This could happen if:');
    console.error("   - The token ticker doesn't exist");
    console.error('   - The amount exceeds the mint limit');
    console.error('   - Invalid amount format');
  }
}

/**
 * Example 3: Encode SRC-20 TRANSFER operation
 *
 * This function demonstrates how to transfer tokens between addresses.
 * TRANSFER operations move tokens from the sender's balance to create
 * transferable token inscriptions that can be sent to recipients.
 *
 * @returns {void} Logs the encoding results to console
 * @example
 * // Transfers 50 tokens of the "TEST" token
 * // Creates a transferable inscription that can be sent
 */
function encodeSRC20Transfer(): void {
  console.log('\n💸 SRC-20 TRANSFER Encoding Example\n');

  const network: bitcoin.networks.Network = bitcoin.networks.bitcoin;
  const encoder: SRC20Encoder = new SRC20Encoder(network);

  // Transfer parameters
  const transferData: SRC20TransferData = {
    p: 'SRC-20',
    op: 'TRANSFER',
    tick: 'TEST', // Token to transfer
    amt: '50', // Amount to transfer
  };

  console.log('📤 Transfer Parameters:');
  console.log(`   Token: ${transferData.tick}`);
  console.log(`   Amount: ${transferData.amt}\n`);

  try {
    const encoded = encoder.encode(transferData);

    console.log('✅ TRANSFER Encoded Successfully:');
    console.log(`   JSON Data: ${encoded.jsonData}`);
    console.log(`   Total Size: ${encoded.totalSize} bytes`);
    console.log(`   Outputs: ${encoded.outputs.length}`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 4: Different Token Configurations
 *
 * This function showcases various token deployment configurations,
 * demonstrating different use cases and parameter combinations.
 * Shows validation in action - some configs will fail intentionally.
 *
 * @returns {void} Logs the encoding results for each configuration
 * @example
 * // Tests various token types:
 * // - Meme tokens (large supply, low decimals)
 * // - High precision tokens (many decimals)
 * // - Simple tokens (small supply)
 */
function encodeVariousTokens(): void {
  console.log('\n🎨 Various Token Configurations\n');

  const network: bitcoin.networks.Network = bitcoin.networks.bitcoin;
  const encoder: SRC20Encoder = new SRC20Encoder(network);

  // Different token configurations
  const tokens = [
    {
      name: 'Meme Token',
      data: {
        p: 'SRC-20' as const,
        op: 'DEPLOY' as const,
        tick: 'MEME',
        max: '69000000',
        lim: '420',
        dec: 0,
      },
    },
    {
      name: 'High Precision Token',
      data: {
        p: 'SRC-20' as const,
        op: 'DEPLOY' as const,
        tick: 'PRECISE',
        max: '21000000',
        lim: '1',
        dec: 18,
      },
    },
    {
      name: 'Simple Token',
      data: {
        p: 'SRC-20' as const,
        op: 'DEPLOY' as const,
        tick: 'SIMPLE',
        max: '1000',
        lim: '10',
        dec: 2,
      },
    },
  ];

  for (const token of tokens) {
    console.log(`📝 ${token.name}:`);
    console.log(`   ${JSON.stringify(token.data)}`);

    try {
      const encoded = encoder.encode(token.data);
      console.log(`   ✅ Size: ${encoded.totalSize} bytes, Outputs: ${encoded.outputs.length}\n`);
    } catch (error) {
      console.log(`   ❌ Failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

/**
 * Example 5: Large Amount Transfer
 *
 * This function demonstrates how the encoder handles large numerical values
 * and floating-point precision. Shows how amounts are normalized in the
 * final JSON output to maintain compatibility with the SRC-20 protocol.
 *
 * @returns {void} Logs the encoding results and normalized amounts
 * @example
 * // Transfers a large decimal amount: 999,999,999.123456789
 * // Shows how precision is handled in JSON serialization
 */
function encodeLargeTransfer(): void {
  console.log('\n💼 Large Amount Transfer Example\n');

  const network: bitcoin.networks.Network = bitcoin.networks.bitcoin;
  const encoder: SRC20Encoder = new SRC20Encoder(network);

  // Large number transfer
  const largeTransfer: SRC20TransferData = {
    p: 'SRC-20',
    op: 'TRANSFER',
    tick: 'BIG',
    amt: '999999999.123456789', // Large decimal amount
  };

  console.log('🔢 Large Transfer:');
  console.log(`   Token: ${largeTransfer.tick}`);
  console.log(`   Amount: ${largeTransfer.amt}\n`);

  try {
    const encoded = encoder.encode(largeTransfer);

    console.log('✅ Large Transfer Encoded:');
    console.log(`   JSON Data: ${encoded.jsonData}`);
    console.log(`   Size: ${encoded.totalSize} bytes`);

    // Check normalized amount in JSON
    const jsonObj = JSON.parse(encoded.jsonData);
    console.log(`   Normalized Amount: ${jsonObj.amt}`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 6: Edge Cases and Validation
 *
 * This function tests various edge cases and validation rules for SRC-20 tokens.
 * Demonstrates the encoder's validation capabilities and error handling.
 * Some cases will intentionally fail to show validation in action.
 *
 * @returns {void} Logs validation results for each test case
 * @example
 * // Tests edge cases like:
 * // - Minimum ticker length (1 character)
 * // - Maximum ticker length (5 characters)
 * // - Zero decimal places
 * // - Zero transfer amounts (should fail)
 */
function testEdgeCases(): void {
  console.log('\n🧪 Edge Cases and Validation\n');

  const network: bitcoin.networks.Network = bitcoin.networks.bitcoin;
  const encoder: SRC20Encoder = new SRC20Encoder(network);

  // Test various edge cases
  const testCases = [
    {
      name: 'Minimum Ticker',
      data: { p: 'SRC-20' as const, op: 'DEPLOY' as const, tick: 'A', max: '1', lim: '1', dec: 0 },
    },
    {
      name: 'Maximum Ticker',
      data: {
        p: 'SRC-20' as const,
        op: 'DEPLOY' as const,
        tick: 'ABCDE',
        max: '1000000000',
        lim: '100000',
        dec: 18,
      },
    },
    {
      name: 'Zero Decimals',
      data: {
        p: 'SRC-20' as const,
        op: 'DEPLOY' as const,
        tick: 'ZERO',
        max: '100',
        lim: '1',
        dec: 0,
      },
    },
    {
      name: 'Transfer Zero',
      data: { p: 'SRC-20' as const, op: 'TRANSFER' as const, tick: 'TEST', amt: '0' },
    },
  ];

  for (const testCase of testCases) {
    console.log(`🔍 Testing ${testCase.name}:`);

    try {
      const encoded = encoder.encode(testCase.data);
      console.log(`   ✅ Valid - Size: ${encoded.totalSize} bytes`);
    } catch (error) {
      console.log(`   ❌ Invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log();
  }
}

/**
 * Example 7: Output Size Comparison
 *
 * This function compares the transaction sizes of different SRC-20 operations.
 * Useful for understanding fee implications and optimization strategies.
 * Shows how different operations have different on-chain footprints.
 *
 * @returns {void} Logs a formatted table comparing operation sizes
 * @example
 * // Compares:
 * // - DEPLOY (most complex, largest size)
 * // - MINT (medium complexity)
 * // - TRANSFER (simplest, smallest size)
 */
function compareOutputSizes(): void {
  console.log('\n📊 Output Size Comparison\n');

  const network: bitcoin.networks.Network = bitcoin.networks.bitcoin;
  const encoder: SRC20Encoder = new SRC20Encoder(network);

  // Compare sizes of different operations
  const operations = [
    {
      name: 'DEPLOY',
      data: {
        p: 'SRC-20' as const,
        op: 'DEPLOY' as const,
        tick: 'TEST',
        max: '1000000',
        lim: '1000',
        dec: 8,
      },
    },
    { name: 'MINT', data: { p: 'SRC-20' as const, op: 'MINT' as const, tick: 'TEST', amt: '100' } },
    {
      name: 'TRANSFER',
      data: { p: 'SRC-20' as const, op: 'TRANSFER' as const, tick: 'TEST', amt: '50' },
    },
  ];

  console.log('Operation     | Size | Outputs | JSON');
  console.log('-'.repeat(45));

  for (const op of operations) {
    try {
      const encoded = encoder.encode(op.data);
      const jsonLength = encoded.jsonData.length;

      console.log(
        `${op.name.padEnd(12)} | ${encoded.totalSize.toString().padStart(4)} | ${
          encoded.outputs.length.toString().padStart(7)
        } | ${jsonLength}`,
      );
    } catch {
      console.log(`${op.name.padEnd(12)} | ERROR`);
    }
  }
}

/**
 * Main execution function
 *
 * Runs all SRC-20 encoding examples in sequence, demonstrating the
 * complete functionality of the SRC20Encoder. Each example builds
 * upon the previous ones to show progressively more complex scenarios.
 *
 * @returns {void} Executes all examples and logs results
 * @example
 * // Run all examples:
 * // npm run examples:src20
 * // or: npx tsx examples/simple-src20-tokens.ts
 */
function main(): void {
  console.log('='.repeat(60));
  console.log(' SIMPLE SRC-20 TOKEN EXAMPLES');
  console.log('='.repeat(60));

  try {
    // Run examples with individual error handling
    console.log('Running SRC-20 encoding examples...\n');

    encodeSRC20Deploy();
    encodeSRC20Mint();
    encodeSRC20Transfer();
    encodeVariousTokens();
    encodeLargeTransfer();
    testEdgeCases();
    compareOutputSizes();

    console.log('\n💡 Key Takeaways:');
    console.log('   - DEPLOY creates the token with supply and limits');
    console.log("   - MINT operations are limited by the deployment's lim parameter");
    console.log('   - TRANSFER operations create transferable inscriptions');
    console.log('   - All operations are embedded in P2WSH outputs as Bitcoin Stamps');
    console.log('   - Validation ensures protocol compliance');
  } catch (error) {
    console.error('\n❌ Fatal error:', error instanceof Error ? error.message : String(error));
    console.error('This is likely a system-level issue. Please check:');
    console.error('- Node.js version compatibility');
    console.error('- All dependencies are installed');
    console.error('- Bitcoin network configuration');
  }

  console.log('\n' + '='.repeat(60));
  console.log(' Examples completed!');
  console.log('='.repeat(60));
}

// Run if executed directly
if (require.main === module) {
  main();
}

export {
  compareOutputSizes,
  encodeLargeTransfer,
  encodeSRC20Deploy,
  encodeSRC20Mint,
  encodeSRC20Transfer,
  encodeVariousTokens,
  testEdgeCases,
};
