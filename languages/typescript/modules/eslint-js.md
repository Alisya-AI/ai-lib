---
id: eslint-js
display: '@eslint/js'
version: 1.0.0
updated: 2026-04-24
language: typescript
slot: linter
requires: [eslint]
conflicts_with: [biome]
---

# @eslint/js Conventions

- Use `@eslint/js` as the base ruleset for JavaScript defaults in flat config.
- Import as `js` and apply `js.configs.recommended` before TypeScript-specific layers.
- Treat this module as foundational ESLint config, not a standalone lint workflow.
- Keep project overrides minimal; prefer upstream defaults unless the repo has a clear exception.
