# Built-In Skills Catalog

This catalog documents the built-in skills available in `ailib`.
Source of truth: `registry.json` (`skills` section).

Use these commands to inspect available skills from the CLI:

```bash
ailib skills list
ailib skills explain <skill-id>
```

To activate skills in a workspace, add skill IDs to `skills` in `ailib.config.json`, then run:

```bash
ailib update
ailib doctor
```

## Compatibility baseline

All built-in skills currently declare compatibility with:

- Languages: `typescript`, `python`, `go`, `java`, `rust`, `javascript`
- Targets: `cursor`, `claude-code`, `copilot`, `openai`, `gemini`, `windsurf`, `jetbrains`

## Built-in skill catalog

### `architecture-decision-flow`

- Purpose: Drive architecture decisions end-to-end using RFC and DACI, from problem framing to rollout review.
- Dependency notes: no required skills; foundation for `rfc-authoring` and `daci-facilitation`.
- Recommended usage: default for cross-team or high-impact changes that need explicit tradeoffs, ownership, and rollout planning.

### `clean-code-refactoring`

- Purpose: Plan and execute safe refactors with clear boundaries, SOLID checks, and behavior-preserving verification.
- Dependency notes: no required skills.
- Recommended usage: use during structural cleanup work where maintainability needs improvement without changing behavior.

### `code-review-rigor`

- Purpose: Run bug-risk-first code reviews that prioritize behavioral regressions, test gaps, and unsafe assumptions.
- Dependency notes: no required skills.
- Recommended usage: apply before opening a PR and during review rounds to catch regressions and missing coverage early.

### `daci-facilitation`

- Purpose: Establish DACI ownership and run efficient decision reviews with clear accountability.
- Dependency notes: requires `architecture-decision-flow`.
- Recommended usage: add when decision-making roles and review process clarity are the main risks in architecture work.

### `delivery-flow-refinement`

- Purpose: Improve software delivery flow by reducing bottlenecks across planning, implementation, review, and release.
- Dependency notes: no required skills.
- Recommended usage: use when cycle time, handoff friction, or rollout sequencing is slowing delivery.

### `release-readiness`

- Purpose: Validate a change is safe to release with checklist-driven checks, rollback preparation, and post-merge verification.
- Dependency notes: no required skills.
- Recommended usage: apply near merge windows or rollout cutovers where operational confidence and fallback discipline matter most.

### `observability-design`

- Purpose: Design observability across logs, metrics, traces, alerts, and dashboards to detect and diagnose production issues quickly.
- Dependency notes: no required skills.
- Recommended usage: add when a change introduces new failure modes or service boundaries that need better runtime visibility.

### `incident-review`

- Purpose: Run a structured incident review with timeline reconstruction, contributing-factor analysis, action planning, and clear ownership.
- Dependency notes: no required skills.
- Recommended usage: use after reliability events to convert learnings into prioritized remediation and prevention actions.

### `migration-planning`

- Purpose: Plan data and API migrations with phased rollouts, compatibility safeguards, and tested fallback paths.
- Dependency notes: no required skills.
- Recommended usage: add when schema contracts, data movement, or client compatibility risks need explicit sequencing.

### `design-review-checklist`

- Purpose: Run consistent technical design reviews for correctness, operability, security, and maintainability.
- Dependency notes: no required skills.
- Recommended usage: pair with architecture and implementation planning when teams need a repeatable quality gate before coding.

### `rfc-authoring`

- Purpose: Write concise RFCs with context, options, tradeoffs, recommendation, and rollout planning.
- Dependency notes: requires `architecture-decision-flow`.
- Recommended usage: add when the task requires a formal decision record with clear alternatives and migration plan.

## Starter skill bundles

Starter bundles provide default skill combinations by workflow. Treat these as practical baselines and refine per workspace using `ailib.local.json`.

### Architecture workflow bundle

- Include: `architecture-decision-flow`, `rfc-authoring`, `daci-facilitation`, `design-review-checklist`
- Best for: cross-team changes that need clear tradeoff documentation, decision ownership, and design quality gates.

```json
{
  "skills": ["architecture-decision-flow", "rfc-authoring", "daci-facilitation", "design-review-checklist"]
}
```

### Delivery workflow bundle

- Include: `delivery-flow-refinement`, `release-readiness`, `migration-planning`
- Best for: execution-heavy initiatives focused on sequencing, safe rollout steps, and fallback planning.

```json
{
  "skills": ["delivery-flow-refinement", "release-readiness", "migration-planning"]
}
```

### Quality workflow bundle

- Include: `clean-code-refactoring`, `code-review-rigor`, `design-review-checklist`
- Best for: implementation and review loops where maintainability, regression prevention, and technical quality checks are the priority.

```json
{
  "skills": ["clean-code-refactoring", "code-review-rigor", "design-review-checklist"]
}
```

### Operations workflow bundle

- Include: `release-readiness`, `observability-design`, `incident-review`
- Best for: production-facing reliability work that needs release safety checks, stronger telemetry coverage, and incident follow-through.

```json
{
  "skills": ["release-readiness", "observability-design", "incident-review"]
}
```

After selecting a bundle in `ailib.config.json`, run:

```bash
ailib update
ailib doctor
```
