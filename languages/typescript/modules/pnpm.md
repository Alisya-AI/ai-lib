---
id: pnpm
display: pnpm (workspaces)
version: 1.0.0
updated: 2026-04-20
language: typescript
slot: package_manager
requires: []
conflicts_with: [npm, yarn, bun]
tested_with:
  - claude-code>=1.2
  - cursor>=0.45
---

# pnpm Conventions

pnpm is the package manager for this repo — npm and yarn are not supported. The repo is a pnpm workspace.

## Layout

- `pnpm-workspace.yaml` declares workspace globs (typically `packages/*` and `services/*`).
- Each package has its own `package.json` with a scoped name (`@org/<package>`).
- The root `package.json` holds only dev dependencies used across the repo (prettier, eslint config base, typescript, vitest) and top-level scripts.

## Catalog (pinned versions)

- Shared dependency versions are pinned in `pnpm-workspace.yaml` under `catalog:` and referenced as `"typescript": "catalog:"` in workspace `package.json` files.
- Adding a dependency used in more than one package? Add it to the catalog, not to individual `package.json` files.

## Running commands

- `pnpm -r <cmd>` runs a script across all packages.
- `pnpm --filter <pkg> <cmd>` scopes to one package.
- `pnpm --filter "@org/foo..." <cmd>` runs for a package and its dependencies.
- Never `cd` into a package to run a script — always use filters from the repo root so the lockfile stays consistent.

## Lockfile

- One `pnpm-lock.yaml` at the repo root. Never commit a lockfile inside a workspace package.
- `pnpm install --frozen-lockfile` in CI. Local dev uses plain `pnpm install`.
- Lockfile churn from routine installs must be committed in the same PR as the change that caused it.

## Hoisting

- Default (no hoisting). Do not add `.npmrc` entries that enable hoisting unless you've confirmed an unavoidable transitive dep requirement with the platform team.
- Use `publicHoistPattern` sparingly, and document every entry.

## Peer dependencies

- `auto-install-peers=true` in `.npmrc`. Peers must still be declared.
- If pnpm complains about missing peers, declare them — don't silence with `strict-peer-dependencies=false`.

## Anti-patterns

- `npm install` or `yarn` in a pnpm repo — this silently produces the wrong lockfile and breaks CI.
- Version strings in individual `package.json` files when a catalog entry exists.
- `pnpm install` inside a workspace subfolder — always run from root.
- Committing `node_modules`, obviously.
