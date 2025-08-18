# Architectural Decision Records

This directory contains architectural decisions for the @btc-stamps/tx-builder project.

## Decisions

### [bitcoinjs-lib v7 Migration](./BITCOINJS_V7_MIGRATION_DECISION.md)

**Status**: Decided - Stay on v6\
**Date**: August 2025\
**Summary**: Defer migration to bitcoinjs-lib v7 (Uint8Array) until stable release and ecosystem adoption. The 5-7 week migration effort is not justified while v7 remains in RC status.

### [Deno Support Scope](./DENO_SUPPORT_ANALYSIS.md)

**Status**: Decided - Partial support only\
**Date**: August 2025\
**Summary**: Provide partial Deno support via npm compatibility. Full native support would require 2-6 weeks of work including TCP provider rewrites. Core features work, TCP providers don't.

## About ADRs

Architectural Decision Records capture important decisions about the architecture and design of the project. They help future maintainers understand not just what was decided, but WHY it was decided.

Each ADR should include:

- Date of decision
- Status (proposed, decided, deprecated)
- Context and problem statement
- Options considered
- Decision and rationale
- Consequences
