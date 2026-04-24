---
id: eslint
display: ESLint
version: 1.0.0
updated: 2026-04-24
language: typescript
slot: linter
requires: []
conflicts_with: [biome]
---

# ESLint Conventions

- Define lint rules in `eslint.config.js` (flat config) and keep it as the single source of truth.
- Keep base linting in `js.configs.recommended`, then layer TypeScript-specific rules with `typescript-eslint`.
- Favor autofixable rules and enforce `--max-warnings=0` in CI to prevent warning drift.
- Scope rule exceptions with file globs instead of broad global disables.
- Keep lint rules focused on correctness/readability; leave formatting concerns to `prettier` or `biome`.
