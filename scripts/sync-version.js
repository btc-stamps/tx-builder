#!/usr/bin/env node

/**
 * Version synchronization script for @btc-stamps/tx-builder
 * Ensures package.json and deno.json have matching versions
 */

import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');
const DENO_JSON_PATH = path.join(PROJECT_ROOT, 'deno.json');

function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error reading ${filePath}:`, error.message);
    process.exit(1);
  }
}

function writeJsonFile(filePath, data) {
  try {
    const content = JSON.stringify(data, null, 2) + '\n';
    fs.writeFileSync(filePath, content, 'utf8');
  } catch (error) {
    console.error(`❌ Error writing ${filePath}:`, error.message);
    process.exit(1);
  }
}

function main() {
  console.log(
    '🔄 Synchronizing versions between package.json and deno.json...',
  );

  // Read both files
  const packageJson = readJsonFile(PACKAGE_JSON_PATH);
  const denoJson = readJsonFile(DENO_JSON_PATH);

  const packageVersion = packageJson.version;
  const denoVersion = denoJson.version;

  console.log(`📦 package.json version: ${packageVersion}`);
  console.log(`🦕 deno.json version: ${denoVersion}`);

  // Check if versions are already synchronized
  if (packageVersion === denoVersion) {
    console.log('✅ Versions are already synchronized!');
    return;
  }

  // Determine source of truth (package.json takes precedence)
  console.log(
    `🔄 Updating deno.json version to match package.json: ${packageVersion}`,
  );

  // Update deno.json
  denoJson.version = packageVersion;
  writeJsonFile(DENO_JSON_PATH, denoJson);

  console.log('✅ Version synchronization completed!');
  console.log(`📦 package.json: ${packageVersion}`);
  console.log(`🦕 deno.json: ${packageVersion}`);

  // Verify the sync worked
  const verifyDenoJson = readJsonFile(DENO_JSON_PATH);
  if (verifyDenoJson.version !== packageVersion) {
    console.error(
      '❌ Version synchronization failed - verification check failed',
    );
    process.exit(1);
  }

  console.log('🎉 Version synchronization verified successfully!');
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Version Sync Script for @btc-stamps/tx-builder

Usage: node scripts/sync-version.js

This script synchronizes the version field between package.json and deno.json.
package.json is considered the source of truth.

Options:
  --help, -h    Show this help message
  --check, -c   Check if versions are synchronized (exit code 1 if not)

Examples:
  node scripts/sync-version.js          # Sync versions
  node scripts/sync-version.js --check  # Check sync status
`);
  process.exit(0);
}

if (process.argv.includes('--check') || process.argv.includes('-c')) {
  console.log('🔍 Checking version synchronization...');

  const packageJson = readJsonFile(PACKAGE_JSON_PATH);
  const denoJson = readJsonFile(DENO_JSON_PATH);

  if (packageJson.version === denoJson.version) {
    console.log(`✅ Versions are synchronized: ${packageJson.version}`);
    process.exit(0);
  } else {
    console.log(`❌ Version mismatch detected!`);
    console.log(`📦 package.json: ${packageJson.version}`);
    console.log(`🦕 deno.json: ${denoJson.version}`);
    console.log('💡 Run "node scripts/sync-version.js" to fix this.');
    process.exit(1);
  }
}

// Run the main function
main();
