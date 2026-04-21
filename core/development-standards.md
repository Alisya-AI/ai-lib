---
id: development-standards
display: ailib Development Standards
version: 1.0.0
updated: 2026-04-21
core: true
---

# Development Standards

- Use TDD where behavior changes: red -> green -> refactor.
- Keep PR scope to one logical concern.
- Favor explicit naming, small focused functions, and clear side effects.
- Apply SOLID pragmatically in shared CLI and generation flows.
- Require passing `bun run typecheck` and `bun run check` before merge.
