#!/usr/bin/env node

/**
 * Fix TypeScript imports for Deno compatibility
 * Adds .ts extensions to all relative imports
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.join(__dirname, '..', 'src');

// Patterns to match imports that need fixing
const IMPORT_PATTERNS = [
  // Standard relative imports without extension
  /from\s+['"](\.[^'"]+?)(?<!\.ts)(?<!\.js)(?<!\.json)['"]/g,
  // Import type statements
  /import\s+type\s+.*?\s+from\s+['"](\.[^'"]+?)(?<!\.ts)(?<!\.js)(?<!\.json)['"]/g,
];

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  IMPORT_PATTERNS.forEach(pattern => {
    content = content.replace(pattern, (match, importPath) => {
      // Check if it's a directory import (needs /index.ts)
      const resolvedPath = path.resolve(path.dirname(filePath), importPath);
      
      // Try to determine if it's a directory
      let newImportPath = importPath;
      try {
        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
          // Directory import - add /index.ts
          newImportPath = importPath + '/index.ts';
        } else if (fs.existsSync(resolvedPath + '.ts')) {
          // File import - add .ts
          newImportPath = importPath + '.ts';
        } else if (fs.existsSync(resolvedPath + '/index.ts')) {
          // Directory with index.ts
          newImportPath = importPath + '/index.ts';
        }
      } catch {
        // If we can't resolve, just add .ts
        newImportPath = importPath + '.ts';
      }
      
      if (newImportPath !== importPath) {
        modified = true;
        return match.replace(importPath, newImportPath);
      }
      return match;
    });
  });
  
  // Also fix any .js extensions to .ts
  content = content.replace(/from\s+['"]([^'"]+?)\.js['"]/g, 'from \'$1.ts\'');
  
  if (modified || content.includes('.js\'') || content.includes('.js"')) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

function walkDirectory(dir) {
  const files = fs.readdirSync(dir);
  let fixedCount = 0;
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      fixedCount += walkDirectory(filePath);
    } else if (file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.spec.ts')) {
      if (fixImportsInFile(filePath)) {
        console.log(`✅ Fixed imports in: ${path.relative(SRC_DIR, filePath)}`);
        fixedCount++;
      }
    }
  });
  
  return fixedCount;
}

console.log('🔧 Fixing TypeScript imports for Deno compatibility...\n');
const fixedCount = walkDirectory(SRC_DIR);
console.log(`\n✨ Fixed imports in ${fixedCount} files!`);

// Also check if we need to update package.json for module type
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

if (!packageJson.type) {
  packageJson.type = 'module';
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log('✅ Added "type": "module" to package.json');
}