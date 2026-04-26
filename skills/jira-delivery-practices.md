---
name: jira-delivery-practices
description: Apply Jira workflow best practices to keep software delivery planning, execution, and release traceability aligned.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# jira-delivery-practices

## Purpose

- Keep execution traceable from ticket scope to PR merge and release outcomes.
- Improve sprint flow with clear ticket states, ownership, and dependency visibility.
- Reduce work-in-progress churn by enforcing actionable acceptance criteria.

## Workflow

- Use one Jira ticket as the implementation source of truth per delivery unit.
- Define explicit acceptance criteria, dependencies, risk notes, and owner before moving to in-progress.
- Keep status transitions strict (`Todo -> In Progress -> In Review -> Done`) and block transitions without required artifacts.
- Link branch names and PRs back to ticket IDs for direct traceability.
- Validate pull requests against ticket scope, acceptance criteria, and test evidence during review.
- On merge, update ticket release fields and capture rollout outcomes/issues for follow-up work.
