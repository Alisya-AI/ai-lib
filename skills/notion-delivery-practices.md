---
name: notion-delivery-practices
description: Apply Notion documentation best practices to keep software development context, decisions, and delivery playbooks current.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# notion-delivery-practices

## Purpose

- Keep engineering documentation usable during planning, implementation, and operations.
- Ensure decisions, runbooks, and release notes stay current alongside code changes.
- Reduce handoff friction with consistent templates and ownership for knowledge artifacts.

## Workflow

- Start each initiative with a Notion page linking scope, constraints, owners, and delivery milestones.
- Capture design and decision records in structured sections (context, options, decision, consequences).
- Link Jira tickets and PRs into the page timeline so documentation and execution remain synchronized.
- Maintain concise implementation notes that explain non-obvious tradeoffs and rollout concerns.
- Before release, verify playbooks include validation steps, rollback actions, and support contacts.
- After release, append outcomes, incidents, and follow-up actions to keep team knowledge trustworthy.
