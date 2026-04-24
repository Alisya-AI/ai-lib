---
name: release-readiness
description: Validate a change is safe to release with checklist-driven checks, rollback preparation, and post-merge verification.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# release-readiness

## Purpose

- Ensure code changes are operationally ready before release.
- Reduce release risk with explicit rollout and rollback checkpoints.
- Standardize post-merge checks so issues are detected quickly.

## Workflow

- Confirm scope, dependencies, and release window constraints are documented.
- Validate release checklist coverage: tests, migrations, config, docs, monitoring, and on-call awareness.
- Verify rollback plan: trigger criteria, rollback command/path, owner, and communication channel.
- Dry-run critical operational steps in staging when possible.
- Confirm observability readiness with metrics, logs, alerts, and dashboards tied to the change.
- Merge and monitor immediate post-merge signals for errors, latency, saturation, and user-impacting regressions.
- Execute post-merge verification checklist for key user flows and integration points.
- Record release outcome, incidents, and follow-up improvements in the team playbook.
