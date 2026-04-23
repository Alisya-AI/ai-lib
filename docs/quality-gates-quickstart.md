# Quality Gates Quickstart

Use these commands before opening a PR:

1. `bun run standards:check`
2. `bun run lint`
3. `bun run format:check`
4. `bun run typecheck`
5. `bun run test`
6. `bun run coverage:check`

Run the full gate in one command:

```bash
bun run check
```

If formatting issues are reported, apply fixes with:

```bash
bun run format:write
```

If lint issues are reported, auto-fix what is safe with:

```bash
bun run lint:fix
```
