#!/usr/bin/env node

/**
 * Release setup validation script for @btc-stamps/tx-builder
 * Validates that all required files and configurations are in place for releases
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

function checkFileExists(filePath, description) {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ ${description}: ${filePath}`);
    return true;
  } else {
    console.log(`❌ ${description}: ${filePath} (missing)`);
    return false;
  }
}

function checkJsonField(filePath, field, description) {
  try {
    const fullPath = path.join(PROJECT_ROOT, filePath);
    const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const value = field.split('.').reduce(
      (obj, key) => obj && obj[key],
      content,
    );

    if (value !== undefined) {
      console.log(`✅ ${description}: ${JSON.stringify(value)}`);
      return true;
    } else {
      console.log(`❌ ${description}: missing field ${field} in ${filePath}`);
      return false;
    }
  } catch (error) {
    console.log(
      `❌ ${description}: error reading ${filePath} - ${error.message}`,
    );
    return false;
  }
}

function validateReleaseSetup() {
  console.log('🔍 Validating @btc-stamps/tx-builder release setup...\n');

  let allValid = true;

  // Check required files
  console.log('📁 Required Files:');
  allValid &= checkFileExists(
    '.github/workflows/release.yml',
    'Release workflow',
  );
  allValid &= checkFileExists(
    '.github/workflows/version-check.yml',
    'Version check workflow',
  );
  allValid &= checkFileExists('scripts/sync-version.js', 'Version sync script');
  allValid &= checkFileExists('RELEASING.md', 'Release documentation');
  allValid &= checkFileExists('package.json', 'Package configuration');
  allValid &= checkFileExists('deno.json', 'Deno configuration');

  console.log('\n📦 Package.json Configuration:');
  allValid &= checkJsonField('package.json', 'name', 'Package name');
  allValid &= checkJsonField('package.json', 'version', 'Package version');
  allValid &= checkJsonField(
    'package.json',
    'publishConfig.access',
    'npm publish config',
  );
  allValid &= checkJsonField(
    'package.json',
    'scripts.sync-version',
    'Version sync script',
  );
  allValid &= checkJsonField(
    'package.json',
    'scripts.check-version',
    'Version check script',
  );
  allValid &= checkJsonField(
    'package.json',
    'scripts.prepublishOnly',
    'Prepublish script',
  );

  console.log('\n🦕 Deno.json Configuration:');
  allValid &= checkJsonField('deno.json', 'name', 'Deno package name');
  allValid &= checkJsonField('deno.json', 'version', 'Deno package version');
  allValid &= checkJsonField('deno.json', 'publish', 'JSR publish config');
  allValid &= checkJsonField(
    'deno.json',
    'publish.include',
    'JSR include patterns',
  );
  allValid &= checkJsonField(
    'deno.json',
    'publish.exclude',
    'JSR exclude patterns',
  );

  // Check version synchronization
  console.log('\n🔄 Version Synchronization:');
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'),
    );
    const denoJson = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, 'deno.json'), 'utf8'),
    );

    if (packageJson.version === denoJson.version) {
      console.log(`✅ Versions synchronized: ${packageJson.version}`);
    } else {
      console.log(
        `❌ Version mismatch - package.json: ${packageJson.version}, deno.json: ${denoJson.version}`,
      );
      allValid = false;
    }
  } catch (error) {
    console.log(`❌ Version check failed: ${error.message}`);
    allValid = false;
  }

  // Check build configuration
  console.log('\n🔨 Build Configuration:');
  allValid &= checkJsonField('package.json', 'scripts.build', 'Build script');
  allValid &= checkJsonField('package.json', 'scripts.test', 'Test script');
  allValid &= checkJsonField('package.json', 'scripts.lint', 'Lint script');
  allValid &= checkJsonField('package.json', 'main', 'Main entry point');
  allValid &= checkJsonField('package.json', 'types', 'TypeScript definitions');
  allValid &= checkJsonField('package.json', 'exports', 'Module exports');

  // Summary
  console.log('\n📋 Summary:');
  if (allValid) {
    console.log('🎉 All release configurations are valid! Ready for releases.');
    console.log('\nNext steps:');
    console.log(
      '1. Ensure GitHub secrets are configured (NPM_TOKEN, JSR_TOKEN)',
    );
    console.log(
      '2. Test with a dry run: Go to Actions → Release → Run workflow (with dry_run checked)',
    );
    console.log('3. Create your first release when ready!');
  } else {
    console.log(
      '❌ Some configurations are missing or invalid. Please fix the issues above.',
    );
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Release Setup Validation for @btc-stamps/tx-builder

Usage: node scripts/validate-release-setup.js

This script validates that all required files and configurations are in place
for automated releases to npm and JSR.

Options:
  --help, -h    Show this help message
`);
  process.exit(0);
}

validateReleaseSetup();
