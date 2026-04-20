# ailib

`ailib` is a universal AI context-injection engine built around pointer-based context routing.

## Install

```bash
npm install -g @ailib/cli
```

## Commands

```bash
ailib init
ailib update
ailib add <module>
ailib remove <module>
ailib doctor
ailib uninstall
```

## Repository Layout

- `registry.json` source-of-truth mapping for languages/modules/targets
- `schema/` JSON schemas for registry and module metadata
- `core/` global behavior and architecture guidance
- `languages/` per-language core + modules
- `targets/` IDE router templates
