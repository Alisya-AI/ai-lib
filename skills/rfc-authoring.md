---
name: rfc-authoring
description: Write concise RFCs with context, options, tradeoffs, recommendation, and rollout planning.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# rfc-authoring

## Purpose

- Produce RFCs that are concise, decision-oriented, and reviewable.
- Make assumptions, constraints, and risks explicit before implementation.
- Help reviewers focus on unresolved decisions instead of rediscovering context.

## Workflow

- Capture context, problem statement, and non-goals.
- Define success metrics and acceptance criteria.
- Describe current state and pain points.
- Present options with technical, operational, and migration tradeoffs.
- Recommend one option with rationale and known limitations.
- Provide rollout plan, migration path, rollback strategy, and validation checks.
- Include unresolved questions and decisions needed from reviewers.
- Finalize RFC with clear status (`draft`, `review`, `approved`, `rejected`, or `superseded`).
