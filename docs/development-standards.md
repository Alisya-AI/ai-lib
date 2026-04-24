# Development Standards

This guide defines the minimum implementation standards for `ailib` changes.

## 1) TDD Workflow

- Start with a failing test that captures the behavior you want.
- Implement the smallest production change required to pass the test.
- Refactor only after tests pass; keep behavior unchanged.
- Keep tests deterministic and local to the changed behavior.

Expected loop:

1. Red: write/adjust tests and confirm failure.
2. Green: implement minimal code to pass.
3. Refactor: improve readability/structure without changing behavior.

## 2) Clean Code Baselines

- Functions should have one clear responsibility.
- Prefer explicit names over comments that restate obvious code.
- Keep side effects isolated and visible at call sites.
- Remove dead code during the same change where it becomes obsolete.
- Avoid broad "catch-all" utilities when a narrow helper is clearer.
- Avoid explicit `any` typing in `src/`, `tools/`, and `test/`; use explicit interfaces/type aliases instead.

## 3) SOLID Expectations (Practical)

- **Single Responsibility:** separate config parsing, validation, and output generation concerns.
- **Open/Closed:** extend behavior through clear module/target definitions instead of editing unrelated flows.
- **Liskov Substitution:** keep replacement behaviors compatible with existing command expectations.
- **Interface Segregation:** keep type contracts focused; avoid oversized interfaces.
- **Dependency Inversion:** depend on explicit abstractions (typed boundaries) for cross-cutting logic.

## 4) Change Scope Rules

- One logical concern per PR.
- Prefer small PRs over large multi-goal changes.
- Keep behavior-preserving refactors separate from feature additions when possible.
- When touching generated artifacts, include the generation/check command used.

## 5) Quality Gates for PRs

- `bun run standards:check` must pass.
- `bun run lint` (ESLint) must pass.
- `bun run format:check` (Prettier) must pass.
- `bun run typecheck` must pass.
- `bun run check` must pass.
- New behavior should include/adjust tests.
- PR description must include TDD evidence (Red/Green/Refactor) or explicit no-behavior-change rationale.
- Docs must be updated when user-facing behavior or contribution flow changes.

## 6) Definition of Done

A change is done when:

- implementation follows this guide,
- relevant tests are in place and passing,
- required docs are updated,
- and the PR checklist is fully completed.
