#!/usr/bin/env node

/**
 * Fix TypeScript type issues for Deno compatibility
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.join(__dirname, '..', 'src');

// Fix timer types in electrumx-connection-pool.ts
function fixTimerTypes() {
  const poolFile = path.join(SRC_DIR, 'providers', 'electrumx-connection-pool.ts');
  let content = fs.readFileSync(poolFile, 'utf8');
  
  // Replace NodeJS.Timeout casts with number casts for Deno
  content = content.replace(/as unknown as NodeJS\.Timeout/g, 'as unknown as number');
  
  // Fix timer variable types
  content = content.replace(
    /private healthCheckTimer\?: NodeJS\.Timeout;/g,
    'private healthCheckTimer?: number;'
  );
  content = content.replace(
    /private heartbeatTimer\?: NodeJS\.Timeout;/g,
    'private heartbeatTimer?: number;'
  );
  content = content.replace(
    /timeout: NodeJS\.Timeout;/g,
    'timeout: number;'
  );
  
  fs.writeFileSync(poolFile, content, 'utf8');
  console.log('✅ Fixed timer types in electrumx-connection-pool.ts');
  
  // Fix metrics file
  const metricsFile = path.join(SRC_DIR, 'providers', 'electrumx-metrics.ts');
  if (fs.existsSync(metricsFile)) {
    content = fs.readFileSync(metricsFile, 'utf8');
    content = content.replace(/private metricsTimer\?: TimerId;/g, 'private metricsTimer?: number;');
    fs.writeFileSync(metricsFile, content, 'utf8');
    console.log('✅ Fixed timer types in electrumx-metrics.ts');
  }
}

// Add override modifiers where needed
function addOverrideModifiers() {
  const files = [
    {
      path: 'selectors/branch-and-bound.ts',
      replacements: [
        { from: '  estimateFee(', to: '  override estimateFee(' },
        { from: '  protected calculateWaste(', to: '  protected override calculateWaste(' }
      ]
    },
    {
      path: 'selectors/consolidation-selector.ts',
      replacements: [
        { from: '  public estimateTransactionSize(', to: '  public override estimateTransactionSize(' }
      ]
    },
    {
      path: 'selectors/knapsack-selector.ts',
      replacements: [
        { from: 'class ImprovedKnapsackSelector extends KnapsackSelector {\n  getName()', to: 'class ImprovedKnapsackSelector extends KnapsackSelector {\n  override getName()' }
      ]
    },
    {
      path: 'selectors/selector-factory.ts',
      replacements: [
        { from: 'class DefaultSelector extends AccumulativeSelector {\n  getName()', to: 'class DefaultSelector extends AccumulativeSelector {\n  override getName()' },
        { from: '  select(utxos: UTXO[]', to: '  override select(utxos: UTXO[]' }
      ]
    }
  ];
  
  files.forEach(({ path: filePath, replacements }) => {
    const fullPath = path.join(SRC_DIR, filePath);
    if (fs.existsSync(fullPath)) {
      let content = fs.readFileSync(fullPath, 'utf8');
      replacements.forEach(({ from, to }) => {
        content = content.replace(from, to);
      });
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`✅ Added override modifiers in ${filePath}`);
    }
  });
}

console.log('🔧 Fixing TypeScript types for Deno compatibility...\n');
fixTimerTypes();
addOverrideModifiers();
console.log('\n✨ Type fixes complete!');