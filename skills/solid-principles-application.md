---
name: solid-principles-application
description: Apply SRP, OCP, LSP, ISP, and DIP with practical design checks during implementation and refactoring.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# solid-principles-application

## Purpose

- Turn SOLID from abstract principles into concrete implementation decisions.
- Improve maintainability by reducing coupling and clarifying module responsibilities.
- Catch design risks early with a repeatable principle-by-principle review flow.

## Workflow

- Clarify scope, expected behavior, and extension points before changing structure.
- Apply SRP by splitting modules that mix business rules, orchestration, and infrastructure concerns.
- Apply OCP by introducing extension seams (interfaces, strategy objects, hooks) instead of branching core logic.
- Apply LSP by checking substitutability: derived types must preserve contract expectations, side effects, and invariants.
- Apply ISP by narrowing broad interfaces to task-focused contracts used by each consumer.
- Apply DIP by depending on abstractions and injecting concrete implementations at composition boundaries.
- Verify the design with focused tests that cover shared contracts and common substitution paths.
- Reassess complexity and coupling after each iteration; keep only abstractions that reduce change cost.
- Document trade-offs, known deviations, and follow-up refactors for unresolved principle violations.
