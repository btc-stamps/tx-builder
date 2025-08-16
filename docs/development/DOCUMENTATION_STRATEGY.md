# 📚 Documentation Strategy for @btc-stamps/tx-builder

## Current Documentation Structure

### What We Have

1. **Main Documentation**
   - `/README.md` - Primary documentation (included in package)
   - `/docs/README.md` - Extended documentation (gitignored)
   - `/docs/archive/` - Development notes (gitignored)

2. **Examples**
   - `/examples/` - 14+ working examples (included in package)
   - `/examples/README.md` - Examples guide

3. **Reference Docs**
   - TypeScript definitions provide API documentation
   - JSDoc comments in source code

## Documentation Hosting Options

### Option 1: GitHub Pages from Examples (Recommended)

**Advantages:**

- Examples directory is already comprehensive
- Working code examples are the best documentation
- Automatically deployed with GitHub Actions
- Free hosting at `btc-stamps.github.io/tx-builder`
- Examples remain in the npm/JSR package

**Implementation:**

```yaml
# .github/workflows/docs.yml
name: Deploy Documentation

on:
  push:
    branches: [main]
    paths:
      - 'examples/**'
      - 'README.md'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Build documentation site
        run: |
          # Copy README as index
          cp README.md examples/index.md

          # Generate HTML from examples
          npx @mdx-js/mdx examples/*.md -o site/

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./site
```

### Option 2: Dedicated Docs Site

**Create `/docs-site/` directory (not gitignored):**

```
docs-site/
├── index.html
├── getting-started.md
├── api-reference.md
├── examples.md (link to examples/)
└── _config.yml (Jekyll config)
```

**Advantages:**

- Separate documentation from code
- More control over presentation
- Can use Jekyll themes

**Disadvantages:**

- Duplicates content from examples
- More maintenance overhead

### Option 3: Use README as Primary (Current)

**Advantages:**

- Single source of truth
- Shows on npm/JSR/GitHub
- No extra maintenance

**Disadvantages:**

- Limited formatting options
- Can become too long

## Platform-Specific Documentation

### npm Documentation

**Displayed on npmjs.com:**

1. README.md (automatically)
2. Package metadata from package.json
3. Links to:
   - Homepage: `https://github.com/btc-stamps/tx-builder`
   - Repository: GitHub repo
   - Documentation: `https://btc-stamps.github.io/tx-builder`

**package.json configuration:**

```json
{
  "homepage": "https://btc-stamps.github.io/tx-builder",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/btc-stamps/tx-builder.git"
  },
  "bugs": {
    "url": "https://github.com/btc-stamps/tx-builder/issues"
  },
  "keywords": [
    "bitcoin",
    "stamps",
    "src20",
    "transaction",
    "builder",
    "ordinals",
    "protection"
  ]
}
```

### JSR Documentation

**Displayed on jsr.io:**

1. README.md (automatically)
2. TypeScript API docs (auto-generated)
3. Examples included in package

**deno.json configuration:**

```json
{
  "name": "@btc-stamps/tx-builder",
  "version": "0.1.0",
  "exports": "./src/index.ts",
  "publish": {
    "include": [
      "src/**/*.ts",
      "README.md",
      "LICENSE",
      "examples/**/*.ts"
    ],
    "exclude": [
      "**/*.test.ts",
      "**/*.spec.ts",
      "docs/**"
    ]
  }
}
```

## Recommended Documentation Strategy

### 1. Primary Documentation Structure

```
Repository Root/
├── README.md                 # Main docs (npm/JSR/GitHub)
├── examples/                  # Working examples (included)
│   ├── README.md             # Examples guide
│   ├── *.ts                  # Example files
│   └── index.html            # GitHub Pages index
├── docs/                     # Extended docs (gitignored)
│   └── README.md            # Development notes
└── API.md                   # API reference (generated)
```

### 2. GitHub Pages Setup

**Enable GitHub Pages:**

1. Repository Settings → Pages
2. Source: Deploy from branch
3. Branch: `gh-pages` or `main`
4. Folder: `/examples` or `/docs-site`

**Create landing page in `/examples/index.html`:**

```html
<!DOCTYPE html>
<html>
  <head>
    <title>@btc-stamps/tx-builder Documentation</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 900px;
        margin: 0 auto;
        padding: 2rem;
      }
      .examples-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1rem;
      }
    </style>
  </head>
  <body>
    <h1>@btc-stamps/tx-builder</h1>
    <p>Bitcoin transaction builder with native Stamps and SRC-20 support</p>

    <h2>Quick Links</h2>
    <ul>
      <li><a href="https://github.com/btc-stamps/tx-builder">GitHub Repository</a></li>
      <li><a href="https://npmjs.com/package/@btc-stamps/tx-builder">npm Package</a></li>
      <li><a href="https://jsr.io/@btc-stamps/tx-builder">JSR Package</a></li>
    </ul>

    <h2>Examples</h2>
    <div class="examples-grid">
      <div>
        <h3>Bitcoin Stamps</h3>
        <a href="bitcoin-stamps.ts">View Example</a>
      </div>
      <div>
        <h3>SRC-20 Tokens</h3>
        <a href="src20-tokens.ts">View Example</a>
      </div>
      <!-- Add more examples -->
    </div>
  </body>
</html>
```

### 3. Documentation Links

**Update package.json:**

```json
{
  "homepage": "https://btc-stamps.github.io/tx-builder",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/btc-stamps/tx-builder.git",
    "directory": "/"
  },
  "bugs": {
    "url": "https://github.com/btc-stamps/tx-builder/issues"
  }
}
```

### 4. API Documentation Generation

**Add script to generate API docs:**

```json
{
  "scripts": {
    "docs:api": "typedoc --out docs-api src/index.ts",
    "docs:serve": "npx http-server examples",
    "docs:build": "npm run docs:api && cp README.md examples/"
  }
}
```

## Implementation Plan

### Phase 1: Basic GitHub Pages (Day 1)

1. ✅ Examples directory already comprehensive
2. Add `examples/index.html` landing page
3. Enable GitHub Pages on `main` branch `/examples` folder
4. Update package.json with homepage URL

### Phase 2: Enhanced Documentation (Week 1)

1. Add TypeDoc for API generation
2. Create examples navigation
3. Add search functionality
4. Improve mobile responsiveness

### Phase 3: Advanced Features (Month 1)

1. Interactive examples with CodePen/StackBlitz
2. Version-specific documentation
3. Tutorial walkthroughs
4. Video demonstrations

## Decision Matrix

| Approach              | Complexity | Maintenance | User Experience | SEO       | Cost |
| --------------------- | ---------- | ----------- | --------------- | --------- | ---- |
| README only           | Low        | Low         | Good            | Good      | Free |
| Examples + GH Pages   | Low        | Low         | Excellent       | Excellent | Free |
| Dedicated docs site   | High       | High        | Excellent       | Excellent | Free |
| External (Docusaurus) | High       | High        | Premium         | Premium   | Free |

## Recommendation

**Use Examples + GitHub Pages approach:**

1. **Immediate**: Enable GitHub Pages from `/examples` folder
2. **Add**: Simple `index.html` in examples for navigation
3. **Link**: Update package.json homepage to GitHub Pages URL
4. **Future**: Enhance with API docs and better styling

This provides:

- ✅ Working code examples as documentation
- ✅ Free hosting with custom domain support
- ✅ Automatic deployment on push
- ✅ Good SEO for package discovery
- ✅ Low maintenance overhead

## Quick Setup Commands

```bash
# 1. Create index file for GitHub Pages
cat > examples/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>@btc-stamps/tx-builder - Documentation</title>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=https://github.com/btc-stamps/tx-builder/tree/main/examples">
</head>
<body>
  <p>Redirecting to examples...</p>
</body>
</html>
EOF

# 2. Update package.json
npm pkg set homepage="https://btc-stamps.github.io/tx-builder"

# 3. Commit changes
git add examples/index.html package.json
git commit -m "docs: add GitHub Pages documentation"

# 4. After pushing to GitHub, enable Pages:
# Settings → Pages → Source: Deploy from branch → main → /examples
```

This approach leverages your excellent examples directory as living documentation!
