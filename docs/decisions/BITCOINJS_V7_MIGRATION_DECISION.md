# Architectural Decision: bitcoinjs-lib v7 and Uint8Array Migration

**Date**: August 2025\
**Status**: Decided - Stay on v6\
**Decision**: Defer migration until v7 stable and ecosystem ready

## Version Strategy and Migration Path

## Current Status (v0.1.6)

The package currently uses:

- `bitcoinjs-lib@^6.1.5` - Stable, production-ready, uses Buffer
- `ecpair@2.1.0` - Compatible with bitcoinjs-lib v6, uses Buffer
- `varuint-bitcoin@1.1.2` - Compatible version
- `@types/bitcoinjs-lib@5.0.4` - Type definitions

## Dependency Analysis

### ecpair v3 Breaking Changes

- Migrated from `Buffer` to `Uint8Array` for all cryptographic operations
- Changes the `publicKey` property type from `Buffer` to `Uint8Array`
- Incompatible with bitcoinjs-lib v6's `Signer` interface
- Uses `uint8array-tools` for array operations

### bitcoinjs-lib v7.0.0-rc.0 Status

- **Released**: September 8, 2024 (~11 months ago)
- **In Production**: Already used in stampchain.io API endpoints
- **Major Changes**:
  - Complete migration from `Buffer` to `Uint8Array`
  - Replaced `typeforce` with `valibot` for validation (lighter, modern)
  - Updated to `bip174@^3.0.0-rc.0` (PSBT improvements)
  - Updated to `bs58check@^4.0.0` (Uint8Array support)
  - Uses `uint8array-tools` instead of Buffer methods
  - Would require rewriting 242+ Buffer references in our codebase

### Key Differences Between v6 and v7

| Feature          | v6 (Current)             | v7 RC                        |
| ---------------- | ------------------------ | ---------------------------- |
| Array Type       | Buffer                   | Uint8Array                   |
| Validation       | typeforce                | valibot (smaller, faster)    |
| BIP174 (PSBT)    | v2.1.1                   | v3.0.0-rc.0                  |
| Bundle Size      | Larger (Buffer polyfill) | Smaller (native arrays)      |
| Browser Support  | Requires polyfill        | Native                       |
| Deno/Bun Support | Works with shims         | Native                       |
| Node.js Support  | Native                   | Works (Uint8Array is native) |

### PSBT Improvements in bip174 v3.0.0-rc.0

The major change in bip174 v3 is the **migration from Buffer to Uint8Array**, aligning with bitcoinjs-lib v7's approach. Key changes:

1. **Uint8Array Throughout**: All Buffer references replaced with Uint8Array
2. **Dependency Updates**:
   - Uses `uint8array-tools` for array operations
   - `varuint-bitcoin` v2 (also Uint8Array-based)
3. **Performance**: Potentially faster in browsers (no Buffer polyfill overhead)
4. **API Compatibility**: Breaking change - all PSBT data now uses Uint8Array

**Impact on PSBT Construction:**

- More efficient in browser environments
- Native TypedArray operations
- Smaller bundle size (no Buffer polyfill)
- Would require updating all our PSBT handling code to use Uint8Array

**Note**: The actual PSBT specification (BIP174) functionality remains the same - this is primarily an implementation detail change for better cross-platform support.

## Migration Options

### Option 1: Stay Current (✅ Implemented)

```json
{
  "ecpair": "2.1.0",
  "bitcoinjs-lib": "^6.1.5"
}
```

**Pros:**

- Stable, production-tested
- No breaking changes
- Works everywhere with existing tooling
- Well-documented patterns

**Cons:**

- Not future-proof
- Requires Buffer polyfill in browsers (~45KB)
- Missing performance improvements from valibot

### Option 2: Adapter Pattern

```json
{
  "ecpair": "^3.0.0",
  "bitcoinjs-lib": "^6.1.5"
}
```

Plus custom `ecpair-adapter.ts` for Uint8Array ↔ Buffer conversion

**Pros:**

- Gets ecpair v3 improvements
- Gradual migration path
- No breaking changes for most consumers

**Cons:**

- Performance overhead from conversions
- Maintenance burden of adapter
- Mixing paradigms (confusing)
- Only partial modernization

### Option 3: Full v7 Migration

```json
{
  "ecpair": "^3.0.0",
  "bitcoinjs-lib": "7.0.0-rc.0"
}
```

**Pros:**

- Future-proof with Uint8Array
- Smaller bundles (no Buffer polyfill)
- Better performance with valibot
- Native support in modern runtimes
- Cleaner, more modern codebase

**Cons:**

- Still RC (not production stable)
- MAJOR breaking change for all consumers
- 242+ Buffer references to update
- Risk of undiscovered bugs in RC

## Buffer vs Uint8Array: Real Impact

### Who Benefits from Uint8Array?

- **Browser applications** - Save ~45KB from Buffer polyfill
- **Cloudflare Workers** - Native support, better performance
- **Deno 2.x users** - No compatibility shims needed
- **Bun users** - Cleaner integration
- **Performance-critical apps** - valibot is faster than typeforce

### Who's Affected by Migration?

- **All existing consumers** - Breaking API changes
- **Node.js apps** - Must update Buffer usage patterns
- **Test suites** - 70+ test references to update
- **Documentation** - All examples need updating

## Recommended Version Strategy

### Phase 1: Current (v0.1.x) - Now (August 2025)

- **Stay with Buffer-based stack**
- Focus on features and stability
- v7 RC has been in production at stampchain.io for months
- No breaking changes

### Phase 2: Evaluation (v0.2.x) - Optional

Only if specific ecpair v3 features needed:

- Consider adapter pattern for ecpair v3
- Maintain backward compatibility
- Document any migration needs

### Phase 3: Major Migration (v1.0.0) - When justified

Given v7 RC has been stable in production for ~11 months:

1. Full Uint8Array migration
2. Update all 242+ Buffer references
3. Comprehensive migration guide
4. Parallel support period (maintain 0.x and 1.x briefly)

## Migration Effort Breakdown

### Code Changes Required (242+ references)

- Transaction builders: ~50 references
- Script builders: ~30 references
- Encoders/decoders: ~40 references
- Validators: ~20 references
- Providers: ~30 references
- Tests: ~70 references

### Estimated Timeline

- Planning & Design: 1 week
- Core Migration: 2-3 weeks
- Testing & Debugging: 1-2 weeks
- Documentation: 1 week
- **Total: 5-7 weeks of effort**

## Is Migration Worth It?

### Worth It When:

- bitcoinjs-lib v7 reaches stable (not RC)
- Significant browser usage of the library
- Deno/Bun adoption increases
- Community establishes migration patterns
- Clear performance benefits demonstrated

### Not Worth It Now Because:

- RC status = production risk
- Limited immediate benefits for Node.js users
- Massive breaking change for all consumers
- Ecosystem hasn't fully adopted Uint8Array
- Current stack is stable and working

## Migration Checklist (for v1.0.0)

### Prerequisites

- [ ] bitcoinjs-lib v7 stable release
- [ ] Community adoption > 20%
- [ ] Migration patterns established
- [ ] Performance benchmarks completed

### Implementation

- [ ] Create v1.x branch
- [ ] Update dependencies
- [ ] Migrate Buffer → Uint8Array (242+ refs)
- [ ] Update all tests
- [ ] Update documentation
- [ ] Create migration guide
- [ ] Add compatibility helpers

### Testing

- [ ] Unit tests (100% coverage)
- [ ] Integration tests
- [ ] Cross-platform (Node, Deno, Bun)
- [ ] Browser testing (Chrome, Firefox, Safari)
- [ ] Performance benchmarks
- [ ] Security audit

### Release

- [ ] Beta release (v1.0.0-beta.1)
- [ ] Community testing period (4 weeks)
- [ ] Fix reported issues
- [ ] Final release (v1.0.0)
- [ ] Deprecation notice for v0.x
- [ ] Parallel support for 3 months

## Conclusion

**Current Recommendation**: Stay with v0.1.x using Buffer-based dependencies. Despite v7 RC being in production for ~11 months at stampchain.io, the migration effort (5-7 weeks) is substantial.

**Reality Check**:

- v7 RC has proven stable in production (stampchain.io uses it)
- Still labeled as RC after 11 months (concerning for a library dependency)
- Migration is a massive undertaking (242+ Buffer references)
- Current v6 stack works perfectly fine

**Decision Points**:

1. If v7 finally goes stable → Evaluate cost/benefit of migration
2. If we need browser optimization → Consider migration for bundle size
3. If security issue found in v6 → Emergency migration
4. If majority of ecosystem migrates → Follow the community

**Success Metrics for Migration**:

- Zero breaking bugs in first month
- < 5% performance regression
- 90% consumer migration within 6 months
- Positive community feedback
