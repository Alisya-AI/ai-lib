---
name: clean-code-refactoring
description: Plan and execute safe refactors with clear boundaries, SOLID checks, and behavior-preserving verification.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# clean-code-refactoring

## Purpose

- Reduce complexity while preserving externally visible behavior.
- Make refactors incremental, reviewable, and low risk.
- Improve maintainability with clear responsibilities and interfaces.

## Workflow

- Define refactor scope, non-goals, and behavior invariants that must not change.
- Baseline current behavior with focused tests and representative fixtures.
- Identify hotspots: duplication, long functions, mixed responsibilities, and tight coupling.
- Sequence small changes that can be validated independently.
- Apply SOLID checks while extracting responsibilities and simplifying interfaces.
- Prefer rename/move/extract steps before deeper logic changes.
- Keep public contracts stable unless an explicit migration plan is part of scope.
- Validate after each step with targeted tests and quick regression checks.
- Document refactor outcomes, remaining debt, and follow-up candidates.
