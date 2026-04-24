---
id: typescript-eslint
display: typescript-eslint
version: 1.0.0
updated: 2026-04-24
language: typescript
slot: linter
requires: [eslint]
conflicts_with: [biome]
---

# typescript-eslint Conventions

- Use `typescript-eslint` with ESLint flat config (`eslint.config.js`) and keep parser/plugin setup in a single shared config.
- Start from `...tseslint.configs.recommended` and add only repo-specific rule overrides.
- Prefer strict but actionable TS rules (`@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-explicit-any`) over redundant JS-only lint checks.
- Scope test-specific relaxations by glob (`**/*.test.ts`) instead of disabling rules globally.
- Keep linting type-aware only when needed for signal quality to avoid unnecessary CI/runtime cost.
