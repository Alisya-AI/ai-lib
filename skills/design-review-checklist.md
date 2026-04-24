---
name: design-review-checklist
description: Run consistent technical design reviews for correctness, operability, security, and maintainability.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# design-review-checklist

## Purpose

- Standardize design quality gates before implementation.
- Catch high-cost issues early in the architecture and design stage.
- Produce review outcomes that are concrete enough to unblock delivery.

## Workflow

- Verify scope, non-goals, and interface boundaries are explicit.
- Review data model impacts and migration implications.
- Check performance assumptions, expected load, and scaling limits.
- Validate failure modes, retries, timeouts, and fallback behavior.
- Review security, privacy, and compliance implications.
- Confirm observability plan: logs, metrics, traces, dashboards, and alerts.
- Validate test strategy: unit, integration, end-to-end, migration, and rollback verification.
- Document operational runbook requirements.
- Record open risks and assign an owner for each unresolved item.
