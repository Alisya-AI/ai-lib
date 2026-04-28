# Local Override Config Model

This document defines the proposed model for consumer-local customization in `ailib`.

## Goal

Allow teams to customize targets/modules/slots locally without forking generated files or losing custom behavior on `ailib` upgrades.

## File and versioning

- File name: `ailib.local.json`
- Scope: repository-local (recommended in `.gitignore` unless intentionally shared)
- Schema: `schema/override.schema.json`
- Version field: required (`version`)

Example root:

```json
{
  "version": "1.0.0",
  "default_override": {},
  "workspace_overrides": {}
}
```

## Override scopes

Each override block supports four scopes:

- `targets`
- `modules`
- `skills`
- `slots`

`targets`, `modules`, and `skills` support:

- `add: []`
- `remove: []`
- `set: []` (full replacement)

`slots` supports per-slot rules:

- `<slot>.set: "<moduleId>"` (force module for slot)
- `<slot>.remove: true` (unset local slot override)

## Workspace resolution

- `default_override`: fallback for all workspaces
- `workspace_overrides`: keyed by workspace path
  - use `"."` for root workspace
  - use relative workspace path (for example `apps/api`) for service-specific rules

## Precedence rules

Highest precedence first:

1. `workspace_overrides[<workspace>]`
2. `default_override`
3. managed config from `ailib.config.json` / inherited config
4. registry defaults

Within each scope:

1. apply `set` if present
2. apply `add`
3. apply `remove`
4. apply slot-level rules (`slots`)

## Compatibility guarantees

- Unknown keys must be rejected by schema validation.
- Unknown module/target/slot references must be reported by validation/doctor checks.
- New `ailib` versions must preserve valid local override files.
- Future model changes must increment `version` and define migration behavior.

## Authoring workflow

1. Create `ailib.local.json` at repository root.
2. Start with `version`, then add `default_override` and/or `workspace_overrides`.
3. Run `ailib update` to apply overrides to generated outputs.
4. Run `ailib doctor` to verify override + generated state consistency.

Recommended loop:

```bash
ailib update
ailib doctor
```

## Validation and failure behavior

- `ailib update` fails fast when `ailib.local.json` is invalid.
- `ailib doctor` surfaces override validation errors before pointer-file checks.
- Validation covers:
  - JSON structure and allowed keys
  - known workspace keys
  - known targets/modules/skills/slots
  - slot-to-module compatibility (`slots.<slot>.set` must match slot ownership)

Example failure patterns:

- `Invalid ailib.local.json: missing required string 'version'`
- `Invalid ailib.local.json: unknown workspace override key 'apps/missing'`
- `Invalid ailib.local.json: default_override.targets.add contains unknown target 'foo'`

## Upgrade guarantees

- `ailib update` never rewrites `ailib.local.json`.
- Valid overrides continue to apply after registry or CLI upgrades.
- Incompatibilities are explicit and blocking (fail-fast), never silent partial apply.
- Future breaking model changes require a `version` bump and migration guidance.

## Troubleshooting and recovery

- `Invalid ailib.local.json` during `update`:
  - run `ailib doctor` for full diagnostics
  - fix reported key/reference mismatch
  - rerun `ailib update`

- Override references module not available in workspace language:
  - switch module to one supported by the workspace language
  - or remove that override and rely on base config

- Workspace-specific override not taking effect:
  - confirm key matches workspace relative path exactly (`.` for root)
  - rerun `ailib doctor --workspace=<path>` to validate scope

## Example

```json
{
  "version": "1.0.0",
  "default_override": {
    "targets": {
      "add": ["openai"]
    }
  },
  "workspace_overrides": {
    ".": {
      "modules": {
        "add": ["prettier"]
      },
      "skills": {
        "add": ["task-driven-gh-flow"]
      }
    },
    "apps/api": {
      "slots": {
        "logger": {
          "set": "nestjs-pino"
        }
      }
    }
  }
}
```
