---
id: tailwind
display: Tailwind CSS
version: 1.3.0
updated: 2026-04-24
language: typescript
slot: styling_system
requires: []
conflicts_with: [styled-components, emotion]
tested_with:
  - cursor>=0.45
  - claude-code>=1.2
  - windsurf>=1.0
---

# Tailwind CSS Conventions

- Keep design tokens centralized in Tailwind theme configuration and avoid ad-hoc values when token equivalents exist.
- Prefer utility-first composition in components and extract repeated class sets into reusable primitives when duplication appears.
- Keep `content` paths accurate so purge/tree-shaking can remove unused styles in production builds.
- Resolve conditional classes with deterministic helpers (for example `clsx`/`cn`) rather than manual string concatenation.
