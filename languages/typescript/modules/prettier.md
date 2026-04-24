---
id: prettier
display: Prettier
version: 1.0.0
updated: 2026-04-24
language: typescript
slot: formatter
requires: []
conflicts_with: [biome]
---

# Prettier Conventions

- Use Prettier as the single formatting authority and run it through repo scripts (`format:check`, `format:write`).
- Keep ignore patterns explicit via `.prettierignore` (or script-level ignores) for generated artifacts.
- Avoid encoding stylistic formatting concerns as ESLint errors when Prettier already owns them.
- Apply formatting consistently across code and docs to keep diffs reviewable and deterministic.
