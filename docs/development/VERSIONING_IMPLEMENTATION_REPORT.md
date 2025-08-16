# Versioning System Implementation Report for @btc-stamps/tx-builder

## Executive Summary

This report analyzes the current state of the tx-builder project and provides
recommendations for implementing a world-class versioning and release system for
publishing to both JSR (Deno) and npm repositories. The goal is to establish a
simple, maintainable, and automated versioning workflow that follows industry
best practices without unnecessary complexity.

## Current State Analysis

### Project Configuration

- **Version**: Currently at 0.1.0 (pre-release)
- **Package Name**: @btc-stamps/tx-builder
- **Dual Runtime Support**: Both Node.js (via npm) and Deno (planned for JSR)
- **Build System**: tsup for Node.js builds, native Deno support
- **CI/CD**: GitHub Actions workflow exists but lacks release automation

### Identified Gaps

1. **No Release Workflow**: The CI/CD pipeline only handles testing and
   building, not releases
2. **No Git Tags**: No version tags in the repository history
3. **Manual Version Management**: Version bumping appears to be manual
4. **No JSR Configuration**: While deno.json exists, JSR publishing isn't
   configured
5. **Missing Release Automation**: No automated changelog generation or version
   bumping
6. **No Branch Protection**: Release process doesn't enforce main-branch-only
   releases

## Recommended Implementation

### 1. Versioning Strategy

**Semantic Versioning (SemVer)**: Strict adherence to MAJOR.MINOR.PATCH

- **MAJOR**: Breaking API changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, backward compatible

**Version Source of Truth**: package.json (synchronized to deno.json)

### 2. Release Workflow Architecture

```yaml
Release Pipeline:
  Trigger: Manual workflow dispatch or push to main with specific commit message
  Steps:
    1. Version Bump (automated based on commit messages)
    2. Update Changelogs
    3. Build & Test
    4. Publish to npm
    5. Publish to JSR
    6. Create GitHub Release
    7. Git Tag Creation
```

### 3. Implementation Components

#### A. GitHub Actions Release Workflow

**File**: `.github/workflows/release.yml`

Key Features:

- **Manual Trigger**: Workflow dispatch with version bump type selection
- **Automated Trigger**: Conventional commits on main branch
- **Main Branch Only**: Enforced through workflow conditions
- **Atomic Operations**: All-or-nothing release process

#### B. Version Management Tools

**Recommended Stack**:

1. **Changesets** or **semantic-release** for automated versioning
2. **Conventional Commits** for standardized commit messages
3. **GitHub Release Notes** for automatic changelog generation

**Simpler Alternative** (Recommended for initial implementation):

- npm version scripts with manual bump selection
- GitHub's automatic release notes generation
- Simple bash scripts for version synchronization

#### C. Publishing Configuration

**NPM Publishing**:

```json
{
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
```

**JSR Publishing**:

```json
// deno.json additions
{
  "publish": {
    "include": ["src/**/*.ts", "README.md", "LICENSE"],
    "exclude": ["tests/**", "examples/**", "*.test.ts"]
  }
}
```

### 4. Minimal Implementation Plan

#### Phase 1: Foundation (Week 1)

1. Add npm and JSR authentication to GitHub Secrets
2. Create `.github/workflows/release.yml` with manual trigger
3. Add version sync script between package.json and deno.json
4. Test dry-run releases

#### Phase 2: Automation (Week 2)

1. Implement conventional commits validation
2. Add automated version bumping based on commit types
3. Configure automatic changelog generation
4. Set up branch protection rules for main

#### Phase 3: Polish (Week 3)

1. Add release candidate (RC) support for pre-releases
2. Implement rollback procedures
3. Add release notifications (Discord/Slack webhook)
4. Documentation updates

### 5. Best Practices Alignment

✅ **Industry Standards Met**:

- Semantic Versioning
- Automated release notes
- Immutable releases (no overwriting)
- Git tags for every release
- Protected main branch
- Reproducible builds

✅ **Simplicity Maintained**:

- Single workflow file
- No complex tooling dependencies
- Clear manual override options
- Minimal configuration files
- Standard npm/deno commands

### 6. Sample Release Workflow

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version bump type'
        required: true
        type: choice
        options:
          - patch
          - minor
          - major
          - prepatch
          - preminor
          - premajor

jobs:
  release:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Setup Deno
        uses: denoland/setup-deno@v1
        with:
          deno-version: v2.x

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Bump version
        run: |
          npm version ${{ github.event.inputs.version }} --no-git-tag-version
          VERSION=$(node -p "require('./package.json').version")
          echo "VERSION=$VERSION" >> $GITHUB_ENV

      - name: Sync Deno version
        run: |
          deno eval "
            const config = JSON.parse(Deno.readTextFileSync('deno.json'));
            config.version = '${{ env.VERSION }}';
            Deno.writeTextFileSync('deno.json', JSON.stringify(config, null, 2) + '\\n');
          "

      - name: Build package
        run: npm run build

      - name: Publish to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish to JSR
        run: deno publish

      - name: Commit version bump
        run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          git add package.json package-lock.json deno.json
          git commit -m "chore(release): v${{ env.VERSION }}"
          git tag -a "v${{ env.VERSION }}" -m "Release v${{ env.VERSION }}"
          git push origin main --tags

      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: v${{ env.VERSION }}
          release_name: v${{ env.VERSION }}
          generate_release_notes: true
          prerelease: ${{ contains(env.VERSION, '-') }}
```

### 7. Risk Mitigation

**Potential Issues & Solutions**:

1. **Failed Partial Releases**
   - Solution: Implement rollback tags and procedures
   - Use atomic release process with pre-flight checks

2. **Version Desync**
   - Solution: Single source of truth (package.json)
   - Automated sync scripts with validation

3. **Accidental Releases**
   - Solution: Main branch protection
   - Manual approval for major versions
   - Dry-run mode for testing

4. **Breaking Changes**
   - Solution: Conventional commits enforcement
   - Clear BREAKING CHANGE indicators
   - Pre-release testing cycle

### 8. Complexity Assessment

**Low Complexity Elements** ✅:

- Single workflow file
- Standard versioning (SemVer)
- Native GitHub features (releases, tags)
- Minimal external dependencies

**Avoided Complexities** ❌:

- Multi-stage pipelines
- Complex versioning schemes
- External release management tools
- Monorepo versioning strategies
- Custom versioning logic

### 9. Success Metrics

Post-implementation, measure:

- Time from commit to release: < 5 minutes
- Failed release rate: < 1%
- Version conflicts: 0
- Manual intervention required: Only for major versions

## Conclusion

The recommended implementation provides a robust, simple, and maintainable
versioning system that:

1. **Aligns with best practices** without over-engineering
2. **Supports dual publishing** to npm and JSR
3. **Maintains simplicity** with a single workflow file
4. **Ensures safety** through main-branch-only releases
5. **Provides flexibility** with manual overrides when needed

The total implementation requires approximately 150 lines of YAML configuration
and minimal changes to existing configuration files, making it a lightweight
addition to the project while providing enterprise-grade release management.

## Next Steps

1. Review and approve the implementation plan
2. Create required secrets in GitHub (NPM_TOKEN, JSR credentials)
3. Implement the release.yml workflow
4. Test with a pre-release version (0.1.1-rc.0)
5. Document the release process in CONTRIBUTING.md
6. Train team members on the new workflow

This approach ensures the tx-builder project can be reliably published and
versioned for the broader developer community while maintaining the simplicity
required for long-term maintenance.
