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
4. **Publish npm**: Publishes to npmjs.com/@btc-stamps/tx-builder
5. **Publish JSR**: Publishes to jsr.io/@btc-stamps/tx-builder (OIDC)
6. **Git**: Creates tag and pushes changes
7. **GitHub Release**: Creates release with changelog

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

---

_This document is maintained for ongoing releases. For initial setup, see archived launch documentation._
