/**
 * Simple Bitcoin Stamps Examples
 *
 * This example demonstrates basic Bitcoin Stamps encoding using the
 * BitcoinStampsEncoder. Perfect for understanding how to embed different
 * types of data (images, text, binary) into Bitcoin transactions.
 *
 * Bitcoin Stamps Protocol Overview:
 * - Embeds data directly in P2WSH outputs (32 bytes per output)
 * - Uses OP_RETURN for metadata and indexing
 * - Supports automatic chunking for large data
 * - Provides format detection and compression options
 *
 * Each example shows different data types and encoding strategies,
 * demonstrating the flexibility of the Bitcoin Stamps protocol.
 *
 * @author Bitcoin Stamps Team
 * @version 1.0.0
 * @since 2024
 */

import * as bitcoin from 'bitcoinjs-lib';
import { BitcoinStampsEncoder } from '../src/encoders/bitcoin-stamps-encoder';
import type { BitcoinStampData } from '../src/interfaces/encoders/stamps.interface';
import { Buffer } from 'node:buffer';

/**
 * Example 1: Basic Stamp Encoding
 *
 * This function demonstrates encoding a small PNG image as a Bitcoin Stamp.
 * Shows the basic encoding process: data chunking, P2WSH output creation,
 * and metadata generation. Uses a minimal 1x1 PNG for demonstration.
 *
 * @returns {Promise<void>} Logs the encoding results to console
 * @example
 * // Encodes a tiny PNG image (70 bytes)
 * // Creates P2WSH outputs for data storage
 * // Adds OP_RETURN output for metadata
 */
async function encodeBasicStamp(): Promise<void> {
  console.log('🎯 Basic Stamp Encoding Example\n');

  const network: bitcoin.networks.Network = bitcoin.networks.bitcoin;
  const encoder: BitcoinStampsEncoder = new BitcoinStampsEncoder(network);

  // Small test image (1x1 PNG)
  const testImageBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  const imageBuffer = Buffer.from(testImageBase64, 'base64');

  console.log('📸 Image Details:');
  console.log(`   Size: ${imageBuffer.length} bytes`);
  console.log(`   Format: PNG\n`);

  try {
    const stampData: BitcoinStampData = {
      imageData: imageBuffer,
      title: 'Test Stamp',
      description: 'A simple test stamp',
      filename: 'test.png',
    };

    const encoded = await encoder.encode(stampData);

    console.log('✅ Stamp Encoded Successfully:');
    console.log(`   Total Size: ${encoded.p2wshOutputs.length + 1} outputs`);
    console.log(`   P2WSH Outputs: ${encoded.p2wshOutputs.length}`);
    console.log(`   Compression Used: ${encoded.compressionUsed}`);
    console.log(`   Image Format: ${encoded.metadata.imageFormat}`);

    // Show outputs
    console.log('\n📦 Output Details:');
    encoded.p2wshOutputs.forEach((output, i) => {
      console.log(`   [${i}] P2WSH: ${output.value} sats - ${output.script.length} bytes`);
    });
    console.log(
      `   [${encoded.p2wshOutputs.length}] OP_RETURN: ${encoded.opReturnOutput.value} sats - ${encoded.opReturnOutput.script.length} bytes`,
    );
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 2: Stamp with Text Data
 *
 * This function shows how to encode text data as a Bitcoin Stamp.
 * Text stamps are useful for messages, metadata, or small documents.
 * Demonstrates UTF-8 encoding and format detection.
 *
 * @returns {Promise<void>} Logs the encoding results to console
 * @example
 * // Encodes a text message: "Hello, Bitcoin Stamps!"
 * // Shows how text is handled vs binary data
 * // Demonstrates format detection (TEXT vs PNG)
 */
async function encodeTextStamp(): Promise<void> {
  console.log('\n📝 Text Stamp Encoding Example\n');

  const network: bitcoin.networks.Network = bitcoin.networks.bitcoin;
  const encoder: BitcoinStampsEncoder = new BitcoinStampsEncoder(network);

  // Text data
  const textData = Buffer.from('Hello, Bitcoin Stamps!', 'utf-8');

  console.log('📄 Text Details:');
  console.log(`   Content: "Hello, Bitcoin Stamps!"`);
  console.log(`   Size: ${textData.length} bytes\n`);

  try {
    const stampData: BitcoinStampData = {
      imageData: textData,
      title: 'Text Stamp',
      description: 'A text-based stamp',
      filename: 'text.txt',
    };

    const encoded = await encoder.encode(stampData);

    console.log('✅ Text Stamp Encoded:');
    console.log(`   P2WSH Outputs: ${encoded.p2wshOutputs.length}`);
    console.log(`   Compression Used: ${encoded.compressionUsed}`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 3: Large Data Encoding (with chunking)
 *
 * This function demonstrates how the encoder handles large data by
 * automatically chunking it into multiple P2WSH outputs. Each output
 * can hold 32 bytes of data, so larger files are split efficiently.
 *
 * @returns {Promise<void>} Logs the encoding results and chunking statistics
 * @example
 * // Encodes 1KB of data (1000 bytes)
 * // Shows automatic chunking into ~32 P2WSH outputs
 * // Demonstrates efficiency calculations
 */
async function encodeLargeStamp(): Promise<void> {
  console.log('\n📦 Large Data Encoding Example\n');

  const network: bitcoin.networks.Network = bitcoin.networks.bitcoin;
  const encoder: BitcoinStampsEncoder = new BitcoinStampsEncoder(network);

  // Create larger test data
  const largeData = Buffer.alloc(1000, 'A'); // 1KB of 'A' characters

  console.log('📊 Large Data Details:');
  console.log(`   Size: ${largeData.length} bytes`);
  console.log(`   Content: ${largeData.length} 'A' characters\n`);

  try {
    const stampData: BitcoinStampData = {
      imageData: largeData,
      title: 'Large Stamp',
      description: 'A large data stamp for testing chunking',
      filename: 'large.bin',
    };

    const encoded = await encoder.encode(stampData);

    console.log('✅ Large Stamp Encoded:');
    console.log(`   P2WSH Outputs: ${encoded.p2wshOutputs.length}`);
    console.log(`   Original Size: ${largeData.length} bytes`);
    console.log(`   Compression: ${encoded.compressionUsed ? 'YES' : 'NO'}`);

    // Calculate efficiency (based on number of outputs needed)
    const dataPerOutput = Math.ceil(largeData.length / encoded.p2wshOutputs.length);
    console.log(`   Data per output: ~${dataPerOutput} bytes`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 4: Compare Compression
 *
 * This function tests compression effectiveness on different data types.
 * Shows how compression performance varies with data patterns and helps
 * determine when compression is beneficial for reducing transaction costs.
 *
 * @returns {Promise<void>} Logs compression results for different data types
 * @example
 * // Tests compression on:
 * // - Repeated text (highly compressible)
 * // - Random data (not compressible)
 * // - JSON data (moderately compressible)
 */
async function compareCompression(): Promise<void> {
  console.log('\n🔄 Compression Comparison Example\n');

  const network: bitcoin.networks.Network = bitcoin.networks.bitcoin;
  const encoder: BitcoinStampsEncoder = new BitcoinStampsEncoder(network);

  // Test different types of data
  const testData = [
    { name: 'Repeated Text', data: Buffer.from('A'.repeat(500), 'utf-8') },
    {
      name: 'Random Data',
      data: Buffer.from(Array.from({ length: 500 }, () => Math.floor(Math.random() * 256))),
    },
    {
      name: 'JSON Data',
      data: Buffer.from(
        JSON.stringify({ test: 'data', array: [1, 2, 3, 4, 5] }).repeat(20),
        'utf-8',
      ),
    },
  ];

  for (const test of testData) {
    console.log(`📋 Testing ${test.name}:`);
    console.log(`   Original Size: ${test.data.length} bytes`);

    try {
      const stampData: BitcoinStampData = {
        imageData: test.data,
        title: `${test.name} Stamp`,
        description: `Testing ${test.name.toLowerCase()}`,
        filename: `${test.name.toLowerCase().replace(' ', '-')}.bin`,
      };

      const encoded = await encoder.encode(stampData);

      console.log(`   P2WSH Outputs: ${encoded.p2wshOutputs.length}`);
      console.log(`   Compression: ${encoded.compressionUsed ? 'YES' : 'NO'}`);
      console.log(`   Format Detected: ${encoded.metadata.imageFormat}\n`);
    } catch (error) {
      console.log(`   ❌ Failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

/**
 * Main execution function
 *
 * Runs all Bitcoin Stamps encoding examples in sequence, demonstrating
 * the complete functionality of the BitcoinStampsEncoder. Shows progression
 * from simple to complex encoding scenarios.
 *
 * @returns {Promise<void>} Executes all examples and logs results
 * @example
 * // Run all examples:
 * // npm run examples:stamps
 * // or: npx tsx examples/simple-bitcoin-stamps.ts
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log(' SIMPLE BITCOIN STAMPS EXAMPLES');
  console.log('='.repeat(60));

  try {
    // Run examples with individual error handling
    console.log('Running Bitcoin Stamps encoding examples...\n');

    await encodeBasicStamp();
    await encodeTextStamp();
    await encodeLargeStamp();
    await compareCompression();

    console.log('\n💡 Key Takeaways:');
    console.log('   - Images are automatically detected (PNG, JPEG, etc.)');
    console.log('   - Text data is encoded as UTF-8');
    console.log('   - Large data is automatically chunked into P2WSH outputs');
    console.log('   - Each P2WSH output holds up to 32 bytes of data');
    console.log('   - Compression effectiveness varies by data type');
    console.log('   - OP_RETURN output provides metadata for indexing');
  } catch (error) {
    console.error('\n❌ Fatal error:', error instanceof Error ? error.message : String(error));
    console.error('This is likely a system-level issue. Please check:');
    console.error('- Node.js version compatibility');
    console.error('- All dependencies are installed');
    console.error('- Buffer handling for binary data');
  }

  console.log('\n' + '='.repeat(60));
  console.log(' Examples completed!');
  console.log('='.repeat(60));
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { compareCompression, encodeBasicStamp, encodeLargeStamp, encodeTextStamp };
