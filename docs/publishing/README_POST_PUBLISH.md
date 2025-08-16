# Post-Publish Updates

After publishing to npm/JSR, update examples to use the published package instead of relative imports.

## Required Updates

Update all example files to use published package imports:

### Files to Update:

- `examples/simple-bitcoin-stamps.ts`
- `examples/simple-src20-tokens.ts`
- Any other example files with relative imports

### Changes:

**Before (development):**

```typescript
import { BitcoinStampBuilder } from '../src/builders/bitcoin-stamp-builder';
import { SRC20TokenBuilder } from '../src/builders/src20-token-builder';
```

**After (published package):**

For npm users:

```typescript
import { BitcoinStampBuilder, SRC20TokenBuilder } from '@btc-stamps/tx-builder';
```

For JSR/Deno users:

```typescript
import { BitcoinStampBuilder, SRC20TokenBuilder } from 'jsr:@btc-stamps/tx-builder';
```

## Implementation

Run this after successful publish:

```bash
# Update examples to use published package
find examples -name "*.ts" -exec sed -i 's|from "\.\./src/|from "@btc-stamps/tx-builder/|g' {} \;

# Commit changes
git add examples/
git commit -m "docs: update examples to use published package"
git push origin main
```

---

_This ensures examples work for users installing the package._
