---
name: tdd-cycle-workflow
description: Drive implementation with red-green-refactor loops and seam-first testability for safe, incremental delivery.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# tdd-cycle-workflow

## Purpose

- Deliver behavior in short, test-first red-green-refactor cycles.
- Reduce implementation risk by introducing seams before changing tightly coupled code.
- Keep tests focused, fast, and expressive enough to guide design decisions.

## Workflow

- Define one observable behavior slice and encode it as a failing test first (red).
- Start with the narrowest deterministic test that fails for the intended reason.
- If code is hard to test, apply seam-first changes (extract function/interface, isolate side effects, inject dependencies) before behavior changes.
- Implement the smallest production change needed to make the test pass (green).
- Run relevant fast tests after each cycle to keep feedback tight.
- Refactor production and test code while tests stay green, improving naming, duplication, and boundaries.
- Repeat in small slices and extend coverage to edge cases and failure paths as confidence grows.
- Finish with broader validation (`bun run check`) and capture non-critical follow-up refactors outside scope.
