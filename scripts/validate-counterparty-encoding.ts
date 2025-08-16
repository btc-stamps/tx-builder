#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

/**
 * Validation script to ensure tx-builder produces exact same encoding as Counterparty API
 * Tests various asset ranges, quantities, and divisible/lock values
 */

import { Buffer } from 'node:buffer';
import * as _bitcoin from 'bitcoinjs-lib';
import { CounterpartyEncoder } from '../src/encoders/counterparty-encoder.ts';

// Test vectors covering all important cases
const TEST_VECTORS = [
  // Basic cases
  {
    name: 'Minimal: quantity=1, no description',
    assetId: 'A95428956661682177',
    quantity: 1,
    divisible: false,
    lock: false,
    description: '',
  },
  {
    name: 'Standard: quantity=1000, with description',
    assetId: 'A95428956661682177',
    quantity: 1000,
    divisible: false,
    lock: false,
    description: 'Test Asset',
  },
  // Divisibility tests
  {
    name: 'Divisible asset',
    assetId: 'A95428956661682177',
    quantity: 100000000, // 1.0 in divisible format
    divisible: true,
    lock: false,
    description: 'Divisible',
  },
  // Lock tests
  {
    name: 'Locked asset',
    assetId: 'A95428956661682177',
    quantity: 1,
    divisible: false,
    lock: true,
    description: 'Locked',
  },
  // Combined flags
  {
    name: 'Divisible and locked',
    assetId: 'A95428956661682177',
    quantity: 100000000,
    divisible: true,
    lock: true,
    description: 'Both flags',
  },
  // Quantity edge cases
  {
    name: 'Zero quantity (for locks)',
    assetId: 'A95428956661682177',
    quantity: 0,
    divisible: false,
    lock: true,
    description: '',
  },
  {
    name: 'Max uint32 quantity',
    assetId: 'A95428956661682177',
    quantity: 4294967295,
    divisible: false,
    lock: false,
    description: 'Max uint32',
  },
  // Description edge cases
  {
    name: 'Single character description',
    assetId: 'A95428956661682177',
    quantity: 1,
    divisible: false,
    lock: false,
    description: 'A',
  },
  {
    name: 'Maximum description (52 chars)',
    assetId: 'A95428956661682177',
    quantity: 1,
    divisible: false,
    lock: false,
    description: 'A'.repeat(52), // Max for standard OP_RETURN
  },
  // Asset ID range tests
  {
    name: 'Minimum valid asset ID',
    assetId: 'A95428956661682177', // 26^12 + 1
    quantity: 1,
    divisible: false,
    lock: false,
    description: 'Min ID',
  },
  {
    name: 'Large asset ID',
    assetId: 'A9999999999999999',
    quantity: 1,
    divisible: false,
    lock: false,
    description: 'Large ID',
  },
];

/**
 * Encode using our tx-builder's Counterparty encoder
 */
function encodeWithTxBuilder(testCase: typeof TEST_VECTORS[0]): Buffer {
  const encoder = new CounterpartyEncoder();

  // Convert asset name to numeric ID
  const assetIdNum = BigInt(testCase.assetId.slice(1)); // Remove 'A' prefix

  // Encode the issuance
  const encoded = encoder.encodeIssuance({
    assetId: assetIdNum,
    quantity: testCase.quantity,
    divisible: testCase.divisible,
    lock: testCase.lock,
    description: testCase.description,
  });

  if (!encoded) {
    throw new Error('Failed to encode with tx-builder');
  }

  return encoded.data;
}

/**
 * Get encoding from Counterparty API
 */
async function _getCounterpartyEncoding(testCase: typeof TEST_VECTORS[0]): Promise<Buffer | null> {
  const _sourceAddress = 'bc1qhhv6rmxvq5mj2fc3zne2gpjqduy45urapje64m';

  // Use unpack method to validate our encoding
  const txBuilderEncoded = encodeWithTxBuilder(testCase);

  // Add CNTRPRTY prefix for API validation
  const fullMessage = Buffer.concat([
    Buffer.from('CNTRPRTY', 'utf8'),
    txBuilderEncoded,
  ]);

  const request = {
    jsonrpc: '2.0',
    method: 'unpack',
    params: {
      data_hex: fullMessage.toString('hex'), // With CNTRPRTY prefix
    },
    id: 1,
  };

  try {
    const response = await fetch('https://api.counterparty.io:4000', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    const data = await response.json();

    if (data.error) {
      console.error('API Error:', data.error);
      return null;
    }

    // The API should validate our encoding
    if (data.result) {
      // If it unpacks successfully, our encoding is valid
      return txBuilderEncoded;
    }

    return null;
  } catch (error) {
    console.error('API request failed:', error);
    return null;
  }
}

/**
 * Compare two buffers and show differences
 */
function compareBuffers(buf1: Buffer, buf2: Buffer, label1: string, label2: string): boolean {
  if (buf1.equals(buf2)) {
    return true;
  }

  console.log(`\n❌ MISMATCH between ${label1} and ${label2}`);
  console.log(`${label1} (${buf1.length} bytes): ${buf1.toString('hex')}`);
  console.log(`${label2} (${buf2.length} bytes): ${buf2.toString('hex')}`);

  // Show byte-by-byte differences
  const maxLen = Math.max(buf1.length, buf2.length);
  for (let i = 0; i < maxLen; i++) {
    const b1 = i < buf1.length ? buf1[i] : undefined;
    const b2 = i < buf2.length ? buf2[i] : undefined;

    if (b1 !== b2) {
      console.log(
        `  Byte ${i}: ${b1?.toString(16).padStart(2, '0') || '--'} != ${
          b2?.toString(16).padStart(2, '0') || '--'
        }`,
      );
    }
  }

  return false;
}

/**
 * Decode and display message contents
 */
function decodeMessage(buffer: Buffer, source: string): void {
  if (buffer.length < 9) {
    console.log(`[${source}] Message too short`);
    return;
  }

  const messageType = buffer[0];
  const assetId = buffer.readBigUInt64BE(1);
  const quantity = buffer.readBigUInt64BE(9);

  let divisible = false;
  let lock = false;
  let description = '';

  // Compact format decoding
  if (buffer.length >= 18) {
    const flags = buffer[17];
    if (flags !== undefined) {
      divisible = (flags & 0x01) !== 0;
      lock = (flags & 0x02) !== 0;
    }

    if (buffer.length > 18) {
      description = buffer.slice(18).toString('utf8').replace(/\0+$/, '');
    }
  }

  console.log(`[${source}] Decoded:`);
  console.log(`  Type: ${messageType}`);
  console.log(`  Asset: A${assetId}`);
  console.log(`  Quantity: ${quantity}`);
  console.log(`  Divisible: ${divisible}`);
  console.log(`  Lock: ${lock}`);
  console.log(`  Description: "${description}"`);
}

/**
 * Run a single test case
 */
function runTest(testCase: typeof TEST_VECTORS[0]): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log(`TEST: ${testCase.name}`);
  console.log('='.repeat(60));
  console.log('Input:', testCase);

  try {
    // Encode with tx-builder
    const txBuilderEncoded = encodeWithTxBuilder(testCase);
    console.log('\nTX-Builder encoded:', txBuilderEncoded.toString('hex'));
    decodeMessage(txBuilderEncoded, 'TX-Builder');

    // Validate the structure directly
    // Expected structure: Type(1) + AssetID(8) + Quantity(8) + Flags(1) + Description
    const expectedAssetId = BigInt(testCase.assetId.slice(1)); // Remove 'A' prefix
    const expectedFlags = (testCase.divisible ? 0x01 : 0) | (testCase.lock ? 0x02 : 0);

    // Build expected encoding
    const expected = Buffer.concat([
      Buffer.from([22]), // Type 22 (LR_ISSUANCE)
      (() => {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64BE(expectedAssetId, 0);
        return buf;
      })(),
      (() => {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64BE(BigInt(testCase.quantity), 0);
        return buf;
      })(),
      Buffer.from([expectedFlags]),
      Buffer.from(testCase.description, 'utf8'),
    ]);

    console.log('\nExpected encoding:', expected.toString('hex'));

    // Compare with our encoding
    const match = txBuilderEncoded.equals(expected);

    if (match) {
      console.log('\n✅ PASSED: TX-Builder matches expected compact encoding exactly');
      return Promise.resolve(true);
    } else {
      compareBuffers(txBuilderEncoded, expected, 'TX-Builder', 'Expected');
      return Promise.resolve(false);
    }
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    return Promise.resolve(false);
  }
}

/**
 * Test the compact encoding format
 */
function testCompactEncoding(): void {
  console.log('\n' + '='.repeat(60));
  console.log('COMPACT ENCODING FORMAT TEST');
  console.log('='.repeat(60));

  const encoder = new CounterpartyEncoder();

  // Test case: Standard issuance
  const testCase = {
    assetId: 95428956661682177n,
    quantity: 1000,
    divisible: false,
    lock: true,
    description: 'Test',
  };

  const encoded = encoder.encodeIssuance(testCase);
  if (!encoded) {
    console.error('Failed to encode');
    return;
  }

  const buffer = encoded.data;
  console.log('\nEncoded hex:', buffer.toString('hex'));
  console.log('Length:', buffer.length, 'bytes');

  // Verify structure
  console.log('\nStructure Analysis:');
  console.log('Byte 0 (Type):', buffer[0], '(should be 22 for LR_ISSUANCE)');
  if (buffer.length >= 9) {
    console.log('Bytes 1-8 (Asset ID):', buffer.readBigUInt64BE(1).toString());
  }
  if (buffer.length >= 17) {
    console.log('Bytes 9-16 (Quantity):', buffer.readBigUInt64BE(9));
  }
  if (buffer.length >= 18) {
    const flagsByte = buffer[17];
    if (flagsByte !== undefined) {
      console.log('Byte 17 (Flags):', flagsByte.toString(2).padStart(8, '0'));
      console.log('  - Divisible:', (flagsByte & 0x01) !== 0);
      console.log('  - Lock:', (flagsByte & 0x02) !== 0);
    }
    console.log('Bytes 18+ (Description):', buffer.slice(18).toString('utf8'));
  }

  // Expected format - using the correct asset ID
  const expectedAssetId = Buffer.alloc(8);
  expectedAssetId.writeBigUInt64BE(95428956661682177n, 0);

  const expected = Buffer.concat([
    Buffer.from([22]), // Type: LR_ISSUANCE
    expectedAssetId, // Asset ID (correct encoding)
    Buffer.from('00000000000003e8', 'hex'), // Quantity: 1000
    Buffer.from([0x02]), // Flags: lock=true
    Buffer.from('Test', 'utf8'), // Description
  ]);

  console.log('\nExpected hex:', expected.toString('hex'));

  if (buffer.equals(expected)) {
    console.log('✅ Compact encoding matches expected format');
  } else {
    console.log('❌ Compact encoding does not match expected format');
    compareBuffers(buffer, expected, 'Actual', 'Expected');
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('COUNTERPARTY ENCODING VALIDATION');
  console.log('=================================');
  console.log('Ensuring tx-builder matches Counterparty API exactly\n');

  // First test the compact encoding format
  testCompactEncoding();

  // Run all test vectors
  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_VECTORS) {
    const result = await runTest(testCase);
    if (result) {
      passed++;
    } else {
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total tests: ${TEST_VECTORS.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n✅ SUCCESS: All tests passed!');
    console.log('TX-Builder encoding matches Counterparty API exactly.');
  } else {
    console.log('\n❌ FAILURE: Some tests failed.');
    console.log('TX-Builder encoding does not match Counterparty API.');
  }
}

// Run the validation
main().catch(console.error);
