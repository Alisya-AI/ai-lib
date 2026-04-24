---
name: observability-design
description: Design observability across logs, metrics, traces, alerts, and dashboards to detect and diagnose production issues quickly.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# observability-design

## Purpose

- Define observability signals that expose service health and user-impacting failures.
- Make incident detection fast with actionable alerts and dashboard coverage.
- Shorten diagnosis time with correlated logs, metrics, and traces.

## Workflow

- Identify critical user journeys and backend operations that require monitoring coverage.
- Define service objectives and key indicators (availability, latency, error rate, throughput).
- Design structured logging fields (request id, tenant, user, operation, error code) and redaction rules.
- Specify metric taxonomy, labels, and cardinality limits to prevent noisy or expensive telemetry.
- Instrument distributed traces at ingress, async boundaries, and external dependencies.
- Map alert rules to symptoms and burn-rate/SLO conditions with clear severity routing.
- Build dashboards for executives, on-call triage, and deep-dive diagnosis views.
- Document runbook links and expected responder actions inside alerts and dashboards.
- Review telemetry during load tests and incident retrospectives to close blind spots.
