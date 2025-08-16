#!/usr/bin/env tsx

/**
 * Import Map Validation Script
 *
 * Validates that Deno and npm import maps are aligned and all referenced
 * files exist. Ensures consistency between deno.json imports and
 * package.json exports.
 */

import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import process from 'node:process';

interface DenoConfig {
  imports?: Record<string, string>;
  exports?: Record<string, string>;
}

interface PackageConfig {
  exports?: Record<string, any>;
}

interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

class ImportMapValidator {
  private readonly rootDir: string;
  private readonly denoConfig: DenoConfig;
  private readonly packageConfig: PackageConfig;

  constructor() {
    this.rootDir = process.cwd();

    // Load configurations
    try {
      const denoPath = join(this.rootDir, 'deno.json');
      const packagePath = join(this.rootDir, 'package.json');

      this.denoConfig = JSON.parse(readFileSync(denoPath, 'utf-8'));
      this.packageConfig = JSON.parse(readFileSync(packagePath, 'utf-8'));
    } catch (error) {
      throw new Error(`Failed to load configuration files: ${error}`);
    }
  }

  /**
   * Validate all import maps
   */
  public validate(): ValidationResult {
    const result: ValidationResult = {
      success: true,
      errors: [],
      warnings: [],
    };

    console.log('🔍 Validating import maps...\n');

    // Validate Deno imports
    this.validateDenoImports(result);

    // Validate package exports
    this.validatePackageExports(result);

    // Cross-validate alignment
    this.validateAlignment(result);

    // Validate file existence
    this.validateFileExistence(result);

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * Validate Deno import map entries
   */
  private validateDenoImports(result: ValidationResult): void {
    console.log('📦 Validating Deno imports...');

    const imports = this.denoConfig.imports || {};
    const txBuilderImports = Object.entries(imports)
      .filter(([key]) => key.startsWith('@btc-stamps/tx-builder'));

    if (txBuilderImports.length === 0) {
      result.warnings.push(
        'No @btc-stamps/tx-builder imports found in deno.json',
      );
      return;
    }

    for (const [importPath, filePath] of txBuilderImports) {
      // Skip the base import and trailing slash import
      if (
        importPath === '@btc-stamps/tx-builder' ||
        importPath === '@btc-stamps/tx-builder/'
      ) {
        continue;
      }

      // Extract module name (not currently used in validation)
      // const moduleName = importPath.replace("@btc-stamps/tx-builder/", "");

      // Check if file exists
      const fullPath = resolve(this.rootDir, filePath);
      if (!existsSync(fullPath)) {
        result.errors.push(
          `Deno import "${importPath}" points to non-existent file: ${filePath}`,
        );
      } else {
        console.log(`  ✅ ${importPath} → ${filePath}`);
      }
    }

    console.log('');
  }

  /**
   * Validate package.json exports
   */
  private validatePackageExports(_result: ValidationResult): void {
    console.log('📦 Validating npm exports...');

    const exports = this.packageConfig.exports || {};

    for (const [exportPath, exportConfig] of Object.entries(exports)) {
      if (exportPath === '.') continue; // Skip main export

      if (typeof exportConfig === 'object' && exportConfig !== null) {
        // Check types file
        const typesPath = (exportConfig as any).types;
        if (typesPath) {
          // Note: dist files may not exist during development
          console.log(`  📄 ${exportPath} → ${typesPath} (build artifact)`);
        }
      }
    }

    console.log('');
  }

  /**
   * Validate alignment between Deno and npm configurations
   */
  private validateAlignment(result: ValidationResult): void {
    console.log('🔄 Validating Deno/npm alignment...');

    const denoImports = this.denoConfig.imports || {};
    const packageExports = this.packageConfig.exports || {};

    // Get module names from Deno imports
    const denoModules = Object.keys(denoImports)
      .filter((key) => key.startsWith('@btc-stamps/tx-builder/') && !key.endsWith('/'))
      .map((key) => key.replace('@btc-stamps/tx-builder/', ''));

    // Get module names from package exports
    const packageModules = Object.keys(packageExports)
      .filter((key) => key !== '.' && key.startsWith('./'))
      .map((key) => key.replace('./', ''));

    // Check for missing modules
    for (const module of denoModules) {
      if (!packageModules.includes(module)) {
        result.errors.push(
          `Module "${module}" exists in Deno imports but missing from package exports`,
        );
      } else {
        console.log(`  ✅ ${module} (aligned)`);
      }
    }

    for (const module of packageModules) {
      if (!denoModules.includes(module)) {
        result.warnings.push(
          `Module "${module}" exists in package exports but missing from Deno imports`,
        );
      }
    }

    console.log('');
  }

  /**
   * Validate that referenced source files exist
   */
  private validateFileExistence(result: ValidationResult): void {
    console.log('📁 Validating source file existence...');

    const imports = this.denoConfig.imports || {};

    for (const [, filePath] of Object.entries(imports)) {
      // Skip external imports
      if (
        filePath.startsWith('npm:') || filePath.startsWith('https://') ||
        filePath.startsWith('../')
      ) {
        continue;
      }

      const fullPath = resolve(this.rootDir, filePath);
      if (!existsSync(fullPath)) {
        result.errors.push(`Source file does not exist: ${filePath}`);
      } else {
        console.log(`  ✅ ${filePath}`);
      }
    }

    console.log('');
  }

  /**
   * Generate suggested fixes for common issues
   */
  public generateFixes(result: ValidationResult): string[] {
    const fixes: string[] = [];

    // Suggest creating missing index files
    const missingIndexErrors = result.errors.filter((err) =>
      err.includes('index.ts') && err.includes('non-existent file')
    );

    for (const error of missingIndexErrors) {
      const match = error.match(/src\/([^\/]+)\/index\.ts/);
      if (match) {
        const module = match[1];
        fixes.push(
          `Create missing index file: echo 'export * from "./${module}";' > src/${module}/index.ts`,
        );
      }
    }

    return fixes;
  }
}

/**
 * Main execution
 */
function main(): void {
  try {
    const validator = new ImportMapValidator();
    const result = validator.validate();

    console.log('📊 Validation Results:\n');

    if (result.success) {
      console.log('✅ All import maps are valid and aligned!\n');
    } else {
      console.log('❌ Import map validation failed\n');

      if (result.errors.length > 0) {
        console.log('🚨 Errors:');
        result.errors.forEach((error) => console.log(`  • ${error}`));
        console.log('');
      }
    }

    if (result.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      result.warnings.forEach((warning) => console.log(`  • ${warning}`));
      console.log('');
    }

    // Generate suggested fixes
    const fixes = validator.generateFixes(result);
    if (fixes.length > 0) {
      console.log('🔧 Suggested fixes:');
      fixes.forEach((fix) => console.log(`  • ${fix}`));
      console.log('');
    }

    // Summary
    console.log('📈 Summary:');
    console.log(`  • Errors: ${result.errors.length}`);
    console.log(`  • Warnings: ${result.warnings.length}`);
    console.log(`  • Status: ${result.success ? 'PASS' : 'FAIL'}`);

    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Validation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
