# Releasing @btc-stamps/tx-builder

This document provides instructions for releasing new versions of @btc-stamps/tx-builder to npm and JSR.

## Prerequisites

### Required Access

- **GitHub**: Write access to btc-stamps/tx-builder repository
- **npm**: Member of @btc-stamps organization with publish rights
- **JSR**: Member of @btc-stamps scope with publish permissions

### Required Secrets

GitHub repository secrets (Settings → Secrets and variables → Actions):

| Secret      | Description                         | Required      |
| ----------- | ----------------------------------- | ------------- |
| `NPM_TOKEN` | npm automation token                | ✅ Required   |
| JSR Token   | ❌ Not needed (OIDC authentication) | ❌ Not needed |

#### Getting npm Token

1. Visit [npmjs.com](https://npmjs.com) → Sign in
2. Profile → Access Tokens → Generate New Token
3. Choose "Automation" type for CI/CD
4. Copy token and add as `NPM_TOKEN` in GitHub Secrets

## Pre-Release Checklist

Before initiating any release:

```bash
# 1. Test with Node.js
npm test
npm run build
npm run lint
npm run typecheck

# 2. Test with Bun (build compatibility)
bun install
bun run build
bun run typecheck
bun run test  # Uses Vitest, not Bun's test runner

# 3. Verify version sync
node scripts/sync-version.js --check

# 4. Run validation scripts (if applicable to changes)
npm run validate:all              # Run all validation scripts
npm run validate:release-setup    # Validate release configuration
npm run validate:import-maps      # Validate import maps
npm run validate:counterparty     # Validate Counterparty encoding
npm run validate:production       # Validate production endpoints

# Individual validation scripts:
# - scripts/validate-all.ts
# - scripts/validate-release-setup.js
# - scripts/validate-import-maps.ts
# - scripts/validate-counterparty-encoding.ts
# - scripts/validate-production-endpoints.ts
# - scripts/validate-stampchain-master.ts
# - scripts/validate-electrumx-reliability.ts

# 5. Dry run the release locally
npm version patch --no-git-tag-version
node scripts/sync-version.js
git status  # Check what would change
git checkout -- .  # Revert changes

# 6. Run CI workflows manually before release
gh workflow run ci.yml --ref main
gh workflow run bun-test.yml --ref main

# 7. Do a dry run of release
gh workflow run release.yml \
  --field version_bump=patch \
  --field dry_run=true
```

## Release Process

### Automated Release (Recommended)

The project uses GitHub Actions for automated releases to both npm and JSR.

#### Steps:

1. **Ensure main branch is ready**:
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Trigger release workflow**:
   - Go to repository → Actions → "Release" workflow
   - Click "Run workflow"
   - Select version bump type:
     - `patch`: Bug fixes (0.1.0 → 0.1.1)
     - `minor`: New features (0.1.0 → 0.2.0)
     - `major`: Breaking changes (0.1.0 → 1.0.0)
   - For first-time testing, enable "Dry run"

3. **Monitor workflow**:
   - Workflow runs tests, builds, and publishes
   - Check Actions tab for progress
   - Verify packages appear on npm and JSR

#### What the Workflow Does:

1. **Tests & Build**: Runs full CI pipeline
2. **Version Bump**: Updates package.json and deno.json
3. **Build**: Creates distribution files
4. **Create Git Tag**: Automatically tags the release
5. **Publish npm**: Publishes to npmjs.com/@btc-stamps/tx-builder
6. **Publish JSR**: Publishes to jsr.io/@btc-stamps/tx-builder (OIDC)
7. **Create PR**: Creates PR for version changes
8. **GitHub Release**: Creates release with changelog
9. **Trigger Sync**: Post-release sync workflow syncs dev with main

### Manual Release (Fallback)

If automated release fails, use manual process:

```bash
# 1. Version bump
npm version patch  # or minor/major

# 2. Sync deno.json version
npm run sync-version

# 3. Build
npm run build

# 4. Test
npm test

# 5. Publish npm
npm publish

# 6. Publish JSR
deno publish

# 7. Push changes
git push origin main --tags
```

## Post-Release

### Verification

1. **npm**: Check [npmjs.com/package/@btc-stamps/tx-builder](https://npmjs.com/package/@btc-stamps/tx-builder)
2. **JSR**: Check [jsr.io/@btc-stamps/tx-builder](https://jsr.io/@btc-stamps/tx-builder)
3. **GitHub**: Verify release created with proper changelog

### Update Examples (After First Release)

After initial publish, update examples to use published package:

```typescript
// Change from:
import { BitcoinStampBuilder } from '../src/builders/bitcoin-stamp-builder';

// To:
import { BitcoinStampBuilder } from '@btc-stamps/tx-builder';
```

## Troubleshooting

### Common Issues

**npm publish fails**:

- Verify `NPM_TOKEN` is correct
- Ensure you're member of @btc-stamps organization
- Check version number isn't already published

**JSR publish fails**:

- Verify you're member of @btc-stamps scope on jsr.io
- Check repository has OIDC permissions (id-token: write)
- Ensure deno.json format is valid

**Version mismatch**:

```bash
npm run sync-version
```

**CI fails**:

- Check all tests pass locally: `npm test`
- Verify build works: `npm run build`
- Ensure TypeScript compiles: `npm run typecheck`
- Run linting: `npm run lint`

## Version Strategy

Follow [Semantic Versioning](https://semver.org):

- **PATCH** (0.1.1): Bug fixes, no breaking changes
- **MINOR** (0.2.0): New features, backward compatible
- **MAJOR** (1.0.0): Breaking changes

Use conventional commits for automatic changelog generation:

```
feat: add new feature
fix: resolve bug
docs: update documentation
BREAKING CHANGE: description (triggers major version)
```

## Runtime Compatibility Notes

### Bun Support

Bun is fully supported for **using** the package but has test runner limitations:

**What Works with Bun:**
- ✅ Installing dependencies (`bun install`)
- ✅ Building the package (`bun run build`)
- ✅ TypeScript compilation (`bun run typecheck`)
- ✅ Running the package in production
- ✅ Using as a dependency in Bun projects

**Test Runner Incompatibility:**
- ❌ `bun test` uses Bun's test runner (incompatible with Vitest mocks)
- ✅ `bun run test` uses Vitest (fully compatible)

**CI Configuration:**
The Bun CI workflow uses `bun run test` to run Vitest tests through Bun.

### Deno Support

Partial support via npm compatibility layer. See [Deno Usage Guide](../DENO_USAGE.md) for details.

## Automation Details

### Post-Release Sync

The `post-release-sync.yml` workflow automatically syncs the dev branch with main after any release PR is merged. This eliminates the manual sync step.

### Version Synchronization

The `scripts/sync-version.js` script ensures package.json and deno.json versions stay in sync. This runs automatically during the release workflow.

---

_This document is maintained for ongoing releases. For initial setup, see archived launch documentation._
