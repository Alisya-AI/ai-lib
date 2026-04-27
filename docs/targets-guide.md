# Guide: Add a New Target

This guide explains how to add a new output target to `ailib` (for example, a new IDE/tool instruction format).

## What a target is

A target is a registry entry that tells `ailib`:

- where to write generated output (`output`, optionally `root_output`)
- which template to render (`template`)
- optional behavior flags (`mode`, `frontmatter`)

Target definitions live in `registry/core.json` under `targets`.
Target templates live in `targets/`.

## Target definition shape

Minimal target entry:

```json
"my-target": {
  "display": "My Target",
  "output": "MY_TARGET.md",
  "template": "targets/my-target.md.tmpl"
}
```

Optional fields:

- `root_output`: additional output written at root workspace only (used by `windsurf`)
- `mode`: special renderer mode (`copilot`)
- `frontmatter`: object with `root`/`workspace` frontmatter variants (used by `cursor`)
- `skill_profile`: target contract for skill rendering conventions (`format`, `required_sections`, `section_mapping`)

`skill_profile` shape:

```json
"skill_profile": {
  "format": "cursor",
  "required_sections": ["When to Use", "Instructions"],
  "section_mapping": {
    "Purpose": "When to Use",
    "Workflow": "Instructions"
  }
}
```

Profile guidance:

- use `format: "cursor"` when skills should follow `When to Use` + `Instructions` sections.
- use `format: "claude-code"` when skills should follow `Purpose` + `Workflow` sections.
- use `section_mapping` to map canonical section names into target-facing section names.

Use existing targets as references:

- basic markdown target: `openai`
- target with custom mode: `copilot`
- target with conditional frontmatter: `cursor`

## Step-by-step: add target

1. Add target template file:
   - create `targets/<target-id>.md.tmpl` (or `.mdc.tmpl` if needed).
   - include placeholders used by the renderer:
     - `{{LANGUAGE}}`
     - `{{MODULES}}`
     - `{{POINTERS}}`

2. Register target in `registry/core.json`:
   - add a unique key under `targets`.
   - set `display`, `output`, and `template`.
   - add optional fields only if required by behavior.

3. Build and validate registry artifacts:

```bash
bun run registry:build
bun run registry:check
```

4. Validate generated docs/catalog consistency:

```bash
bun run catalog:build
bun run catalog:check
bun run coverage-audit:check
```

5. Validate full project checks:

```bash
bun run check
```

6. Smoke test target output:
   - in a sample workspace run:
     - `ailib init --targets=<target-id>`
     - `ailib update`
   - verify generated file path/content matches target definition.

## Troubleshooting

- `Unknown target`:
  - confirm the target key exists in `registry/core.json` and rebuild registry.

- output file not generated:
  - verify target is included in workspace `ailib.config.json` `targets`.
  - run `ailib update`.

- template not found:
  - verify `template` path is correct and file exists in `targets/`.

- check fails with registry/catalog mismatch:
  - run build commands (`registry:build`, `catalog:build`) and commit resulting updates.

## PR checklist for target additions

- target definition added in `registry/core.json`
- target template added in `targets/`
- `bun run check` passes
- smoke test confirms output generation
- PR links task issue with `Refs #<issue>`
