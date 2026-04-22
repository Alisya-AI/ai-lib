# Guide: Add Modules and Slots

This guide explains how to add or update modules and slots in `ailib` while staying aligned with registry governance rules.

## Overview

Module and slot data is split across:

- `registry/core.json` (canonical slot model + target definitions)
- `registry/languages/<language>.json` (language module definitions)
- `languages/<language>/modules/<module>.md` (module docs + frontmatter)

`registry.json` is generated from split sources and must stay in sync.

## Add a new module

1. Choose language file:
   - `registry/languages/<language>.json`

2. Add module entry under `modules`:

```json
"my-module": {
  "display": "My Module",
  "slot": "schema_validation",
  "requires": ["existing-module"],
  "conflicts_with": []
}
```

Module field expectations:

- `display`: user-facing module label
- `slot`: canonical slot (not alias)
- `requires`: module IDs in same language (optional)
- `conflicts_with`: module IDs in same language (optional)

3. Add module doc file:
   - `languages/<language>/modules/my-module.md`

Required frontmatter:

```yaml
---
id: my-module
language: <language>
slot: schema_validation
display: My Module
version: 1.0.0
updated: 2026-04-22
---
```

## Add a new slot (only when needed)

Add a new slot only when introducing a genuinely new decision axis.

1. Add canonical slot name to `slots` in `registry/core.json`.
2. Add matching `slot_defs` entry with:
   - `kind`: `exclusive` or `composable`
   - `description`: concise, capability-oriented description
3. If renaming from legacy slot naming, add:
   - `slot_aliases` mapping old -> new
   - `slot_alias_meta` entry (`replacement`, `deprecated_since`, `remove_in`)
4. Ensure at least one module uses the slot (required by governance checks).

## Canonical naming rules

- Use `snake_case`
- Prefer capability-oriented, vendor-neutral names
- Use canonical names in module definitions
- Do not use alias slot names in new module entries

See: `docs/slot-standards.md`

## Validation workflow

Run these commands before opening a PR:

```bash
bun run registry:build
bun run registry:check
bun run catalog:build
bun run catalog:check
bun run coverage-audit:build
bun run coverage-audit:check
bun run check
```

## Common errors and fixes

- `Unknown canonical slot`:
  - module `slot` does not exist in `registry/core.json` `slots`.

- `uses alias slot ... use canonical`:
  - module used alias name; replace with canonical slot.

- `Registry/docs module mismatch`:
  - missing module doc file or orphan module doc in language folder.

- `Frontmatter ... mismatch`:
  - align doc frontmatter fields (`id`, `language`, `slot`) with registry entry.

- `Every canonical slot should be represented`:
  - new slot added but not used by any module; add at least one module mapping.

## PR checklist

- registry changes are scoped to one logical module/slot concern
- module docs/frontmatter added or updated
- governance and sync checks pass (`bun run check`)
- PR links task issue with `Refs #<issue>`
