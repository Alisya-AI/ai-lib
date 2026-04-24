---
name: architecture-decision-flow
description: Drive architecture decisions end-to-end using RFC and DACI, from problem framing to rollout review.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# architecture-decision-flow

## Purpose

- Create a repeatable architecture decision process.
- Require explicit tradeoffs, ownership, and rollout planning.
- Preserve decision history and avoid undocumented tribal choices.

## Workflow

- Confirm decision scope, urgency, and blast radius.
- Define problem statement, constraints, non-goals, and success criteria.
- Generate 2-4 viable options with pros, cons, risks, and operational impact.
- Draft an RFC with context, options, recommendation, and migration plan.
- Assign DACI roles:
  - Driver: accountable for the process and timeline.
  - Approver: final decision owner.
  - Contributors: subject-matter input providers.
  - Informed: stakeholders who need outcomes.
- Facilitate review and resolve open questions.
- Record final decision with rationale and rejected alternatives.
- Define implementation phases, rollback strategy, and validation checks.
- Schedule a decision retrospective after rollout.
