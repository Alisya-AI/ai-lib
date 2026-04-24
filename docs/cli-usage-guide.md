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
- `ailib slots list`
- `ailib modules list`
- `ailib modules explain <module>`
- `ailib skills list`
- `ailib skills explain <skill-id>`
- `ailib skills init <skill-id>`
- `ailib skills validate`

## Single-repo flow

### 1) Initialize

```bash
ailib init --language=typescript --modules=eslint,vitest --targets=claude-code,cursor,copilot
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
ailib skills explain <skill-id>
```

## Skills workflow (select, override, author)

### 1) Select skills in workspace config

Add `skills` to `ailib.config.json`:

```json
{
  "language": "typescript",
  "modules": ["eslint"],
  "targets": ["claude-code", "cursor"],
  "skills": ["<skill-id-from-registry>"]
}
```

Apply and validate:

```bash
ailib update
ailib doctor
```

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
ailib skills init release-manager --workspace=apps/web --description="Release orchestration workflow"
```

This writes a scaffold to `.cursor/skills/release-manager/SKILL.md` in the target workspace (or a custom path when `--path` is provided).

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
