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

Each override block supports three scopes:

- `targets`
- `modules`
- `slots`

`targets` and `modules` support:

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
