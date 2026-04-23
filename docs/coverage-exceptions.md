# Coverage Exceptions and Rationale

This document tracks why `src/cli.ts` is not yet at 100% line coverage and which paths are intentionally deferred.

Current baseline after Task #72 pass 2:

- `src/cli.ts` line coverage: **91.25%**
- Full-suite threshold gate (enforced via `bun run coverage:check`):
  - lines: **80%**
  - functions: **80%**
  - branches: **70%**

## High-value uncovered clusters

- **Workspace and filesystem edge conditions**
  - Deep filesystem traversal branches (`walkForWorkspaceConfigs`, symlink/permission guards).
  - Branches that require specific broken filesystem states to trigger reliably.
  - Reason deferred: high setup complexity and potential flakiness in cross-platform CI.

- **Conflict-mode and managed-file merge paths**
  - `writeManagedFile` conflict behaviors (`skip`, `abort`, and merge backup handling).
  - Reason deferred: requires brittle fixture orchestration for low-frequency safety branches.

- **Context and discovery fallbacks**
  - Project root detection and monorepo/workspace discovery fallback combinations.
  - Reason deferred: requires synthetic directory trees that add maintenance burden.

## Coverage strategy

- Continue adding deterministic regression tests first for real defects and command-facing behavior.
- Prioritize branches with user-visible errors before deeply internal fallback paths.
- Add fixture helpers only when they reduce maintenance cost for multiple remaining branches.

## Definition of feasible 100%

100% is considered feasible only when additional tests are:

- deterministic across local and CI environments,
- not dependent on fragile filesystem race conditions, and
- maintainable without obscuring behavior intent.

If those constraints cannot be met for a branch, document the rationale here and keep coverage progress incremental.
