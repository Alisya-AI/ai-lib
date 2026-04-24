---
name: test-strategy-design
description: Design risk-based test strategies across unit, integration, and end-to-end layers with clear coverage intent.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# test-strategy-design

## Purpose

- Align test investment with risk, critical paths, and failure impact.
- Choose the right mix of unit, integration, and end-to-end tests.
- Prevent coverage blind spots for edge cases and operational failures.

## Workflow

- Define quality goals and high-risk behaviors that must be protected.
- Map critical user and system flows, including unhappy paths and recoveries.
- Classify coverage by layer: unit for logic boundaries, integration for component contracts, and end-to-end for system confidence.
- Use a test pyramid bias, escalating to heavier tests only when lower layers cannot provide confidence.
- Identify edge cases: null/empty values, boundary limits, retries, timeouts, and ordering issues.
- Capture non-functional checks where needed (performance budgets, reliability expectations, security-sensitive paths).
- Specify fixture/data strategy to keep tests deterministic and maintainable.
- Decide pass/fail gates for CI and merge readiness based on risk level.
- Revisit strategy after incidents or regressions to close discovered coverage gaps.
