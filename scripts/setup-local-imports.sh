#!/bin/bash

# Setup Local Import Maps for Development
# This script creates a local npm link so you can use @btc-stamps/tx-builder imports
# before the package is published to npm

echo "🔧 Setting up local import maps for development..."

# Build the package first
echo "📦 Building package..."
npm run build

# Create a local npm link
echo "🔗 Creating local npm link..."
npm link

echo "✅ Local import maps setup complete!"
echo ""
echo "To use in other projects:"
echo "  1. Navigate to your project directory"
echo "  2. Run: npm link @btc-stamps/tx-builder"
echo ""
echo "Now you can use imports like:"
echo "  import { TransactionBuilder } from '@btc-stamps/tx-builder';"
echo ""
echo "To unlink later:"
echo "  In your project: npm unlink @btc-stamps/tx-builder"
echo "  In this directory: npm unlink"