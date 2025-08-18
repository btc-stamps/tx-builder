# Current GitHub Workflows

## Active Workflows

### 1. CI Pipeline (`ci.yml`)

- **Triggers**: Push to main/develop, Pull requests
- **Jobs**:
  - Lint & Format (Deno)
  - Type Check (TypeScript)
  - Test on Node.js 18, 20, 21
  - Coverage upload to Codecov
  - Build verification
  - Example validation

### 2. Coverage Analysis (`coverage.yml`)

- **Triggers**: Push to main, Pull requests, Manual
- **Purpose**: Comprehensive test coverage analysis
- **Coverage thresholds**: Configured in codecov.yml

### 3. GitHub Pages Deployment (`pages.yml`)

- **Triggers**: Push to main, Manual (workflow_dispatch)
- **Deploys**: Documentation from `/docs` directory to https://btc-stamps.github.io/tx-builder
- **Note**: Root README.md is NOT included (only /docs content is served)

### 4. Release Workflow (`release.yml`)

- **Triggers**: Manual (workflow_dispatch)
- **Actions**:
  - Version bump (patch/minor/major)
  - npm publish
  - JSR publish (requires token)
  - GitHub release creation
  - Dry run option available

### 5. Version Check (`version-check.yml`)

- **Triggers**: Push, Pull requests
- **Purpose**: Ensures package.json and deno.json versions are synchronized

## Configuration Files

- `codecov.yml` - Codecov configuration (60% coverage target)
- `.codecovignore` - Files to exclude from coverage
- `tsconfig.json` - TypeScript configuration
- `vitest.config.mts` - Test runner configuration

## Publishing Targets

1. **npm**: @btc-stamps/tx-builder
2. **JSR**: @btc-stamps/tx-builder (manual via workflow)
3. **GitHub Releases**: Tagged versions with release notes

## Current Status

- ✅ CI/CD fully operational
- ✅ npm publishing automated
- ⚠️ JSR publishing requires manual token
- ⚠️ Codecov badge showing "unknown" (pending data processing)
- ✅ GitHub Pages deployed successfully
