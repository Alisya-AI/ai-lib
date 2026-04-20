# Slot Standards

This document defines how module slots are modeled in `registry.json`.

## Design goals

- Keep slots predictable and low-maintenance.
- Model one decision axis per slot.
- Preserve backwards compatibility through aliases when renaming slots.

## Naming rules

- Slot names use `snake_case`.
- Slot names are capability-oriented and vendor-neutral.
- Prefer semantic suffixes when applicable:
  - `_framework`
  - `_provider`
  - `_adapter`
  - `_runner`
  - `_engine`

## Slot behavior

Each slot is defined in `slot_defs` with:

- `kind: "exclusive"`: only one module can occupy the slot.
- `kind: "composable"`: multiple modules can coexist in the slot.

All canonical slots must be listed in both:

- `slots`
- `slot_defs`

## Aliases and migrations

- Renamed legacy slots are captured in `slot_aliases`.
- `slot_aliases` map legacy names to canonical slot names.
- `slot_alias_meta` records deprecation lifecycle for each alias.
- Alias keys must not also appear in `slots`.
- Alias targets must always exist in `slots`.
- New module definitions should always use canonical slot names.

Each alias metadata entry includes:

- `replacement`: canonical slot name
- `deprecated_since`: semver string
- `remove_in`: target semver for removal

## Module constraints

- Each module definition must declare `slot`.
- Module `slot` values must map to a canonical slot.
- Module markdown frontmatter `slot` must match the registry module slot.

## Practical guidance

- Add a new slot only when introducing a genuinely new decision axis.
- Prefer adding a module under an existing slot over creating a new slot.
- Keep slot descriptions concise and implementation-agnostic.
