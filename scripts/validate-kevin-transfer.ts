import { SRC20Encoder } from '../src/encoders/src20-encoder';
import * as bitcoin from 'bitcoinjs-lib';
import process from 'node:process';

const encoder = new SRC20Encoder(bitcoin.networks.bitcoin);

// KEVIN transfer data from test
const transferData = {
  p: 'SRC-20' as const,
  op: 'TRANSFER' as const,
  tick: 'kevin',
  amt: '100000.000000000000000000',
};

console.log('Input:', JSON.stringify(transferData));

const result = encoder.encode(transferData);

console.log('\nEncoder Results:');
console.log('- JSON Data:', result.jsonData);
console.log('- Total Size:', result.totalSize);
console.log('- Data Size:', result.dataSize);
console.log('- Outputs:', result.outputs.length);
console.log('- Compression:', result.compressionUsed);

// Check what the normalized data looks like
const normalized = {
  p: 'src-20',
  op: 'transfer',
  tick: 'KEVIN',
  amt: 100000,
};

const normalizedJson = JSON.stringify(normalized);
console.log('\nExpected normalized:', normalizedJson);
console.log('Expected length:', normalizedJson.length);

// With stamp prefix
const withPrefix = ' >stamp:' + normalizedJson;
console.log('\nWith prefix:', withPrefix);
console.log('With prefix length:', withPrefix.length);

// The fixture expects 64 bytes
console.log('\nFixture expects: 64 bytes');
console.log('We are producing:', result.totalSize, 'bytes');

// Validation result
if (result.totalSize === 64) {
  console.log('\n✅ SUCCESS: KEVIN transfer encoding matches expected size');
} else {
  console.log('\n❌ FAILED: Size mismatch');
  process.exit(1);
}
