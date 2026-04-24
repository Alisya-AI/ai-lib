---
id: biome
display: Biome
version: 1.0.0
updated: 2026-04-24
language: typescript
slot: linter
requires: []
conflicts_with: [eslint, prettier]
---

# Biome Conventions

- Use Biome as an all-in-one lint+format tool only when it is the selected linter stack for the repo.
- Do not mix Biome linting with ESLint in the same project unless a migration phase is explicitly documented.
- Keep configuration centralized in `biome.json` and avoid per-package drift in monorepos.
- Prefer Biome defaults first; add custom rules only for clear, repeated repository needs.
