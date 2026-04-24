---
id: bun
display: Bun
version: 1.0.0
updated: 2026-04-24
language: typescript
slot: package_manager
requires: []
conflicts_with: [npm, pnpm, yarn]
---

# Bun Conventions

- Use Bun for script execution (`bun run`) and test workflows (`bun test`) when the repo declares Bun support.
- Keep Bun version constraints explicit in `package.json` `engines` and align local/CI versions.
- Prefer `bunx` for one-off tooling commands (for example TypeScript type checks) to avoid global tool drift.
- Do not mix package managers in one workspace; treat Bun lockfiles and install semantics as authoritative when selected.
