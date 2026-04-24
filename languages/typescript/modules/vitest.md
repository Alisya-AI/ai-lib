---
id: vitest
display: Vitest
version: 1.0.0
updated: 2026-04-24
language: typescript
slot: test_runner
requires: []
conflicts_with: [jest]
---

# Vitest Conventions

- Co-locate tests as `*.test.ts` near source modules unless a package-level `test/` structure is required.
- Keep test suites deterministic: no hidden network/time dependencies and no cross-test shared mutable state.
- Use table-driven tests for validation-heavy logic and prefer explicit assertions over snapshot-only coverage.
- Keep mock boundaries at infrastructure edges; avoid mocking the unit under test's internal behavior.
- Run the full suite with coverage in CI and treat regressions in branch/function coverage as review blockers.
