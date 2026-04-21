---
id: test-standards
display: ailib Test Standards
version: 1.0.0
updated: 2026-04-21
core: true
---

# Test Standards

These standards apply to generated consumer workspaces and `ailib` contributions.

## 1) Required Test Types

- Unit tests for focused logic.
- Integration tests for command workflows and file outputs.
- Regression tests for each bug fix.
- Smoke checks for end-to-end core paths.

## 2) Coverage Targets

- `src/` and `core/` changes: 85% line coverage minimum.
- `tools/` changes: 80% line coverage minimum.
- Critical command flows (`init/update/doctor/uninstall`): strong integration coverage.

## 3) Quality Gates

- `bun run typecheck` passes.
- `bun run check` passes.
- Behavior changes include tests.

## 4) Definition of Done

- Required test types are addressed.
- Coverage targets are respected for changed areas.
- Checks pass before merge.
