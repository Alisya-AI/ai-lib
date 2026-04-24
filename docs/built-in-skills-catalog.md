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

### `design-review-checklist`

- Purpose: Run consistent technical design reviews for correctness, operability, security, and maintainability.
- Dependency notes: no required skills.
- Recommended usage: pair with architecture and implementation planning when teams need a repeatable quality gate before coding.

### `rfc-authoring`

- Purpose: Write concise RFCs with context, options, tradeoffs, recommendation, and rollout planning.
- Dependency notes: requires `architecture-decision-flow`.
- Recommended usage: add when the task requires a formal decision record with clear alternatives and migration plan.
