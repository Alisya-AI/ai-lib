---
id: development-standards
display: ailib Development Standards
version: 1.0.0
updated: 2026-04-21
core: true
---

# Development Standards

These standards apply to generated consumer workspaces and to `ailib` contribution work.

## 1) TDD Workflow

- Start with a failing test for the target behavior.
- Implement the smallest change needed to make the test pass.
- Refactor after tests pass while preserving behavior.

## 2) Clean Code Baselines

- Keep functions focused on one responsibility.
- Prefer explicit naming over ambiguous shortcuts.
- Keep side effects visible at call sites.
- Remove dead code during related changes.

## 3) SOLID Expectations (Practical)

- Use Single Responsibility for config parsing, validation, and generation concerns.
- Extend behavior through explicit module/target definitions rather than unrelated flow edits.
- Keep contracts focused and substitutable.

## 4) Change Scope Rules

- Keep one logical concern per PR.
- Prefer small PRs.
- Separate behavior-preserving refactors from feature additions when possible.

## 5) Quality Gates

- `bun run typecheck` must pass.
- `bun run check` must pass.
- Behavior changes must include/adjust tests.

## 6) Definition of Done

- Standards followed.
- Tests and checks pass.
- Relevant docs/PR checklist updated.
