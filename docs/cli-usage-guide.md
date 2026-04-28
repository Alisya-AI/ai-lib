# Guide: End-to-End CLI Usage

This guide covers practical `ailib` CLI workflows for single-repo and monorepo setups.

## Command reference

Core commands:

- `ailib init`
- `ailib update`
- `ailib add <module>`
- `ailib remove <module>`
- `ailib doctor`
- `ailib uninstall`
- `ailib version` (or `ailib --version`)
- `ailib slots list`
- `ailib modules list`
- `ailib modules explain <module>`
- `ailib skills list`
- `ailib skills explain <skill-id>`
- `ailib skills add <skill-id>` (supports `skills init` alias)
- `ailib skills remove <skill-id>`
- `ailib skills validate`

## Single-repo flow

### 1) Initialize

```bash
ailib init --language=typescript --modules=eslint,vitest --targets=claude-code,cursor,copilot
```

You can also run plain interactive setup:

```bash
ailib init
```

The guided flow asks for:

- optional preset selection from `.ailib/init-presets.json` (when presets exist)
- targets (multi-select)
- default language
- modules (multi-select)
- skills grouped by `skill_type` (multi-select)
- optional workspace language overrides (monorepo)

Interactive picker UX includes:

- arrow-key navigation
- space to toggle/select
- inline filter by typing (Backspace edits, Esc clears)
- `Ctrl+A` to select all and `Ctrl+U` to clear (multi-select prompts)
- `?` to toggle shortcut help

Before apply, onboarding shows a summary plus a dry-run preview of files that will be created or updated.  
No files are written until you explicitly confirm with `y` or `n` at the final apply prompt.

After confirming apply, onboarding can optionally save the chosen setup as a named preset in:

```text
.ailib/init-presets.json
```

To preselect skills directly in non-interactive mode, use `--skills`:

```bash
ailib init --language=typescript --modules=eslint --targets=claude-code,cursor --skills=task-driven-gh-flow,release-readiness
```

Expected result:

- `ailib.config.json` created at repo root
- `.ailib/` pointers and standards files generated
- target outputs generated (for example `CLAUDE.md`, `.cursor/rules/ailib.mdc`)

### 2) Update generated outputs

```bash
ailib update
```

Use this after changing config, registry inputs, or module/target selection.

### 2.1) Backup and conflict behavior for managed files

`ailib` writes a sibling backup file (`<target-file>.bak`) for managed outputs so consumers can recover prior content when needed.

When backups are created or refreshed:

- On first successful write of a managed file, `ailib` creates `<target-file>.bak` if it does not exist yet.
- When a managed file already exists and `--on-conflict=overwrite` or `--on-conflict=merge` is used, `ailib` refreshes `<target-file>.bak` from the pre-write file content.
- `--on-conflict=skip` and `--on-conflict=abort` do not modify existing files, so they do not create or refresh backups for those conflicts.

User-facing conflict mode behavior:

- `overwrite`: replace the target file with the freshly rendered managed content and keep a `.bak` snapshot for rollback.
- `merge`: preserve non-managed content and rewrite only the managed block between `<!-- ailib:start -->` and `<!-- ailib:end -->`, with a `.bak` snapshot taken first.
- `skip`: leave the existing file untouched and continue without writing this target.
- `abort`: stop with a conflict error so you can resolve manually or rerun with a different conflict mode.

How consumers can recover from backups:

1. Inspect differences between current and backup files:

```bash
diff -u path/to/file path/to/file.bak
```

2. Restore the previous version from backup when needed:

```bash
cp path/to/file.bak path/to/file
```

3. Re-run generation with your desired conflict mode:

```bash
ailib update --on-conflict=merge
```

### 3) Add/remove modules

```bash
ailib add prettier
ailib remove prettier
```

### 4) Validate workspace integrity

```bash
ailib doctor
```

`doctor` validates managed files and reports warnings/errors with actionable messages.

### 5) Uninstall managed outputs

```bash
ailib uninstall
```

Use `--all` to remove root and service-level generated artifacts in monorepos.

## Monorepo flow

### 1) Initialize at repository root

```bash
ailib init --language=typescript --modules=eslint,vitest --targets=claude-code,copilot --workspaces=apps/*,services/*
```

This creates a root config and enables workspace discovery.

With plain `ailib init`, the guided flow can optionally configure per-workspace language overrides for detected workspace directories. It writes workspace `ailib.config.json` files only for workspaces where you choose a language different from the root default.

### 2) Initialize service workspace with inheritance

From inside a service directory:

```bash
ailib init --language=typescript --modules=fastify
```

This creates a service config extending the nearest root config unless `--no-inherit` is used.

### 3) Update specific workspace

```bash
ailib update --workspace=apps/api
```

### 4) Add/remove module in specific workspace

```bash
ailib add joi --workspace=services/auth
ailib remove joi --workspace=services/auth
```

### 5) Validate specific workspace

```bash
ailib doctor --workspace=services/auth
```

## Discovery commands

List canonical slots:

```bash
ailib slots list
```

List modules for a language:

```bash
ailib modules list --language=typescript
```

Explain one module:

```bash
ailib modules explain prisma --language=typescript
```

List available skills:

```bash
ailib skills list
```

If the list is empty, no skills are currently registered in your project registry yet.

Explain one skill:

```bash
ailib skills explain architecture-decision-flow
```

## Skills workflow (select, override, author)

### 0) Pick a starter workflow bundle

Choose one of these starter bundles as your baseline, then tune per workspace with `ailib.local.json`.

- Architecture workflow:
  - `architecture-decision-flow`
  - `rfc-authoring`
  - `daci-facilitation`
  - `design-review-checklist`
- Delivery workflow:
  - `delivery-flow-refinement`
  - `release-readiness`
  - `migration-planning`
- Quality workflow:
  - `clean-code-refactoring`
  - `code-review-rigor`
  - `design-review-checklist`
- Operations workflow:
  - `release-readiness`
  - `observability-design`
  - `incident-review`

Example starter bundle in `ailib.config.json`:

```json
{
  "language": "typescript",
  "modules": ["eslint", "vitest"],
  "targets": ["claude-code", "cursor", "copilot"],
  "skills": ["delivery-flow-refinement", "release-readiness", "migration-planning"]
}
```

Then apply and verify:

```bash
ailib update
ailib doctor
```

For bundle rationale and expanded examples, see [Built-In Skills Catalog](./built-in-skills-catalog.md#starter-skill-bundles).

### 1) Select skills in workspace config

Add `skills` to `ailib.config.json`:

```json
{
  "language": "typescript",
  "modules": ["eslint"],
  "targets": ["claude-code", "cursor"],
  "skills": ["architecture-decision-flow"]
}
```

Apply and validate:

```bash
ailib update
ailib doctor
```

### 1.1) Choose umbrella vs focused architecture skills

Use `architecture-decision-flow` as the umbrella skill when your team needs an end-to-end decision workflow that spans framing, RFC drafting, DACI alignment, rollout planning, and retrospective follow-up.

Use focused skills when you only need one part of that flow:

- `rfc-authoring`: writing or reviewing RFC content and tradeoffs.
- `daci-facilitation`: decision role alignment and review facilitation.
- `design-review-checklist`: design quality/risk checks before implementation.
- `delivery-flow-refinement`: implementation sequencing, rollout safety, and verification loops.

Practical default:

- Start with `architecture-decision-flow` for cross-team or high-impact changes.
- Add focused skills for deep dives in specific steps (for example RFC-heavy or review-heavy work).

### 1.2) Architecture skill bundle examples

Default architecture bundle in `ailib.config.json`:

```json
{
  "language": "typescript",
  "modules": ["eslint", "vitest"],
  "targets": ["claude-code", "cursor", "copilot"],
  "skills": ["architecture-decision-flow", "design-review-checklist"]
}
```

Use this when teams want a strong default architecture workflow with routine design quality checks.

Workspace-local refinement in `ailib.local.json`:

```json
{
  "version": "1.0.0",
  "workspace_overrides": {
    "apps/api": {
      "skills": {
        "add": ["rfc-authoring", "daci-facilitation"]
      }
    },
    "apps/web": {
      "skills": {
        "add": ["delivery-flow-refinement"],
        "remove": ["daci-facilitation"]
      }
    }
  }
}
```

Use this when backend architecture work needs heavier decision artifacts, while frontend delivery work needs rollout-focused guidance.

### 1.3) Time quality skills by delivery stage

Use quality skills based on where work currently sits in the delivery flow:

- Planning and test design: use `test-strategy-design` to define risk-based coverage, edge cases, and test-layer choices before coding.
- Active implementation and refactors: use `clean-code-refactoring` when simplifying complexity without changing external behavior.
- Pre-PR self-check: use `code-review-rigor` to sanity-check regressions, failure paths, and missing tests before opening a review.
- PR review and merge readiness: use `code-review-rigor` as the default reviewer lens, and cross-check with `test-strategy-design` when coverage looks shallow.

Practical quality-skill bundle:

- Start features with `test-strategy-design` when risk or domain complexity is high.
- Add `clean-code-refactoring` whenever implementation requires structural cleanup to stay maintainable.
- Keep `code-review-rigor` active for final review gates, especially on user-impacting or high-blast-radius changes.

### 1.4) Select release-readiness for rollout confidence

Use `release-readiness` when work is close to merge or release and you need explicit checks for rollout safety, rollback ownership, and post-merge verification.

Practical selection examples:

- Pair `delivery-flow-refinement` + `release-readiness` when implementation sequencing is done and the next risk is safe rollout execution.
- Use `release-readiness` alone for low-code operational changes (for example config toggles) where checklist discipline matters more than architecture planning.
- Add `release-readiness` alongside `code-review-rigor` on reliability-critical changes that need both code-level scrutiny and operational go-live gates.

Release-focused workspace override in `ailib.local.json`:

```json
{
  "version": "1.0.0",
  "workspace_overrides": {
    "apps/api": {
      "skills": {
        "add": ["release-readiness"],
        "remove": ["daci-facilitation"]
      }
    }
  }
}
```

Use this when API changes are implementation-complete and the main concern shifts to release window checks, rollback paths, and early production monitoring.

### 1.5) Bundle defaults plus workspace overrides

Use `ailib.config.json` for baseline bundle intent, then refine by workspace in `ailib.local.json`.

Baseline bundle in `ailib.config.json`:

```json
{
  "language": "typescript",
  "modules": ["eslint", "vitest"],
  "targets": ["claude-code", "cursor", "copilot"],
  "skills": [
    "architecture-decision-flow",
    "design-review-checklist",
    "test-strategy-design",
    "release-readiness",
    "observability-design"
  ]
}
```

Workspace overrides in `ailib.local.json`:

```json
{
  "version": "1.0.0",
  "workspace_overrides": {
    "apps/api": {
      "skills": {
        "add": ["migration-planning", "incident-review"]
      }
    },
    "apps/web": {
      "skills": {
        "add": ["delivery-flow-refinement"],
        "remove": ["migration-planning"]
      }
    }
  }
}
```

Use this when you need one cross-repo default bundle but different operational emphasis per workspace.

### 1.6) TDD and SOLID starter bundle examples

Use this bundle when your primary adoption goal is tight red/green/refactor loops plus SOLID-oriented cleanup.

Default TDD + SOLID bundle in `ailib.config.json`:

```json
{
  "language": "typescript",
  "modules": ["eslint", "vitest"],
  "targets": ["claude-code", "cursor", "copilot"],
  "skills": ["test-strategy-design", "clean-code-refactoring", "code-review-rigor"]
}
```

Use this as the default when most workspaces share the same test-first delivery expectations and refactoring standards.

Workspace overrides in `ailib.local.json`:

```json
{
  "version": "1.0.0",
  "workspace_overrides": {
    "apps/api": {
      "skills": {
        "add": ["release-readiness"]
      }
    },
    "apps/web": {
      "skills": {
        "add": ["delivery-flow-refinement"],
        "remove": ["release-readiness"]
      }
    }
  }
}
```

Use workspace overrides when one team needs extra rollout controls or delivery sequencing on top of the default TDD + SOLID baseline.

### 2) Override skill selection locally

Use `ailib.local.json` to add/remove/set skills without changing managed config:

```json
{
  "version": "1.0.0",
  "default_override": {
    "skills": {
      "add": ["task-driven-gh-flow"]
    }
  },
  "workspace_overrides": {
    "apps/web": {
      "skills": {
        "remove": ["task-driven-gh-flow"]
      }
    }
  }
}
```

Then regenerate:

```bash
ailib update
```

### 3) Author a new skill scaffold

Create a new skill file:

```bash
ailib skills add release-manager --workspace=apps/web --description="Release orchestration workflow"
```

This writes a scaffold to `.cursor/skills/release-manager/SKILL.md` in the target workspace (or a custom path when `--path` is provided).  
By default, scaffolds use the Cursor-style skill format (`## When to Use` + `## Instructions`).
When the `skill-id` matches a built-in skill (for example `solid-principles-application`), `skills add` seeds the file with built-in content and maps it to the selected format.
If the target file already exists, built-in seeding will not overwrite that local skill file.
`skills init` remains available as a compatibility alias for `skills add`.

Use Claude-oriented scaffold layout when needed:

```bash
ailib skills add release-manager --path=.claude/skills/release-manager/SKILL.md --format=claude-code
```

Remove a local skill scaffold:

```bash
ailib skills remove release-manager --workspace=apps/web
```

### 4) Validate authored skills

Validate all skill files in the target workspace:

```bash
ailib skills validate --workspace=apps/web
```

Validate a single skill file:

```bash
ailib skills validate --path=.cursor/skills/release-manager/SKILL.md
```

Validation checks include:

- Required frontmatter keys (`name`, `description`)
- Required sections (`## Purpose`, `## Workflow`)
- Compatibility declaration shape (`compatible_languages`, `compatible_modules`, `compatible_targets`, `compatible_llms`)

## Local override workflow

Use `ailib.local.json` to customize local targets/modules/slots without changing managed `ailib.config.json`.

1. Define overrides at root:

```bash
touch ailib.local.json
```

2. Apply updates:

```bash
ailib update
```

3. Verify local override integrity:

```bash
ailib doctor
```

Behavior:

- Invalid overrides fail `ailib update` immediately.
- `ailib doctor` reports override validation problems with actionable messages.
- Valid overrides survive regeneration and future `ailib update` runs.

Reference model and schema:

- [docs/local-override-model.md](local-override-model.md)
- [schema/override.schema.json](../schema/override.schema.json)

## Troubleshooting

- `Unknown command`:
  - run `ailib` with no args to print command help and expected syntax.

- `Unsupported language`:
  - check available languages in `registry.json` and use `--language=<id>`.

- `Unknown module` / `Unknown module for <language>`:
  - run `ailib modules list --language=<lang>` and use exact module id.

- `Unknown skill`:
  - run `ailib skills list` and use an exact skill id.

- `Missing ailib.config.json` in workspace:
  - run `ailib init` in that workspace (or root for monorepo-first flow).

- target file missing after config changes:
  - run `ailib update`; verify target is included in config `targets`.

- `doctor` reports missing pointer or frontmatter mismatch:
  - re-run `ailib update`, then re-check with `ailib doctor`.

- `Invalid ailib.local.json`:
  - fix invalid keys or unknown references reported by error output
  - re-run `ailib update`, then `ailib doctor`.

- `skills validate failed`:
  - fix the reported frontmatter/section issues in each listed `SKILL.md`
  - re-run `ailib skills validate` until it passes.

## Recommended validation loop

After any configuration or module/target change:

```bash
ailib update
ailib doctor
```

For repository checks:

```bash
bun run check
```
