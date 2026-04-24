---
name: migration-planning
description: Plan data and API migrations with phased rollouts, compatibility safeguards, and tested fallback paths.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# migration-planning

## Purpose

- Create safe, repeatable migration plans for data models and APIs.
- Preserve backward compatibility while clients and services transition.
- Reduce migration risk through phased rollout and explicit fallback strategy.

## Workflow

- Define migration scope, dependencies, and affected systems.
- Inventory schema, contract, and behavior changes across producers and consumers.
- Define compatibility strategy:
  - Backward compatibility window and deprecation timeline.
  - Versioning or dual-read/dual-write approach where needed.
  - Data validation and reconciliation checks during transition.
- Design phased rollout:
  - Pre-migration preparation and guardrails.
  - Incremental rollout stages with clear entry and exit criteria.
  - Post-migration hardening and cleanup milestones.
- Define fallback plan:
  - Rollback triggers and decision owners.
  - Safe revert steps for schema, data, and API traffic.
  - Communication plan for incidents and stakeholder updates.
- Specify observability and success metrics for each phase.
- Document execution runbook, dry-run plan, and sign-off checklist.
