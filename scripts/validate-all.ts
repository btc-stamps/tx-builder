#!/usr/bin/env npx tsx

/**
 * Master validation script for tx-builder
 * Runs all core validation tests against real Stampchain API
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import process from 'node:process';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'error';
  message?: string;
  time?: number;
}

const VALIDATION_SCRIPTS = [
  {
    name: 'Output Ordering',
    script: 'validate-output-ordering.ts',
    description: 'Validates P2WPKH output ordering for DEPLOY/MINT/TRANSFER',
  },
  {
    name: 'Stampchain Parity',
    script: 'validate-stampchain-parity.ts',
    description: 'Ensures tx-builder matches stampchain.io encoding',
  },
  {
    name: 'KEVIN Transfer',
    script: 'validate-kevin-transfer.ts',
    description: 'Validates SRC20 transfer encoding',
  },
  {
    name: 'Counterparty Encoding',
    script: 'validate-counterparty-encoding.ts',
    description: 'Validates Counterparty protocol encoding',
  },
  {
    name: 'Production Endpoints',
    script: 'validate-production-endpoints.ts',
    description: 'Comprehensive validation against real Counterparty and Stampchain endpoints',
  },
  {
    name: 'Import Maps',
    script: 'validate-import-maps.ts',
    description: 'Validates Deno import map configuration',
  },
];

function runValidation(script: typeof VALIDATION_SCRIPTS[0]): Promise<TestResult> {
  const startTime = Date.now();
  const scriptPath = path.join(__dirname, script.script);

  try {
    console.log(`\n🔧 Running: ${script.name}`);
    console.log(`   ${script.description}`);

    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
      return Promise.resolve({
        name: script.name,
        status: 'error',
        message: 'Script file not found',
      });
    }

    // Run the validation script
    const output = execSync(`npx tsx ${scriptPath}`, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 60000, // 1 minute timeout
    });

    // Check for real failures vs just mentioning the word
    const lines = output.split('\n');
    const lastLines = lines.slice(-10).join('\n').toLowerCase();

    // Look for actual failure indicators in summary/final output
    const hasRealError = lastLines.includes('failed:') && !lastLines.includes('failed: 0');
    const hasSuccess = lastLines.includes('success') ||
      lastLines.includes('all tests passed') ||
      lastLines.includes('status: pass') ||
      (lastLines.includes('✅') && !lastLines.includes('❌'));

    const elapsedTime = Date.now() - startTime;

    if (hasSuccess || (!hasRealError && output.includes('✅'))) {
      console.log(`   ✅ PASSED (${elapsedTime}ms)`);
      return Promise.resolve({
        name: script.name,
        status: 'pass',
        time: elapsedTime,
      });
    } else {
      console.log(`   ❌ FAILED`);
      console.log(`   Output: ${output.substring(0, 200)}...`);
      return Promise.resolve({
        name: script.name,
        status: 'fail',
        message: 'Validation failed',
        time: elapsedTime,
      });
    }
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    console.log(`   ❌ ERROR: ${error.message}`);

    return Promise.resolve({
      name: script.name,
      status: 'error',
      message: error.message,
      time: elapsedTime,
    });
  }
}

async function runAllValidations() {
  console.log('🚀 TX-BUILDER COMPREHENSIVE VALIDATION');
  console.log('=====================================');
  console.log(`Running ${VALIDATION_SCRIPTS.length} validation scripts\n`);

  const results: TestResult[] = [];

  for (const script of VALIDATION_SCRIPTS) {
    const result = await runValidation(script);
    results.push(result);
  }

  // Summary
  console.log('\n📊 VALIDATION SUMMARY');
  console.log('====================');

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log(`Total: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Errors: ${errors}`);

  // Detailed results
  console.log('\nDetailed Results:');
  console.log('-----------------');
  for (const result of results) {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
    const time = result.time ? ` (${result.time}ms)` : '';
    console.log(`${icon} ${result.name}${time}`);
    if (result.message) {
      console.log(`   └─ ${result.message}`);
    }
  }

  // Overall status
  const allPassed = passed === results.length;
  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log('✅ ALL VALIDATIONS PASSED!');
    console.log('tx-builder is fully compatible with Stampchain API');
  } else {
    console.log('⚠️  SOME VALIDATIONS FAILED');
    console.log('Please review the failures above');
  }
  console.log('='.repeat(50));

  // Exit code
  process.exit(allPassed ? 0 : 1);
}

// Run validations
runAllValidations().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
