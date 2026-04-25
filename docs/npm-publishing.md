# npm publishing for `@ailib/cli`

This document defines the publish + verification flow for npm releases.

## Prerequisites

- npm account with publish access to `@ailib/cli`
- npm auth already configured (`npm whoami`)
- repository on a clean release commit

## 1) Preflight release validation

Run artifact build + readiness checks:

```bash
bun run release:npm:preflight
```

This validates:

- release artifacts are generated under `dist/release/`
- target package version is not already published
- npm pack output contains required release files

## 2) Publish and verify npm install resolution

Run the publish workflow:

```bash
bun run release:npm:publish
```

The workflow performs:

1. npm authentication check (`npm whoami`)
2. `npm publish --access public`
3. version resolution check (`npm view @ailib/cli version --json`)
4. clean-directory install verification (`npm install @ailib/cli@<version>`)
5. CLI smoke test (`npx ailib --help`)

## 3) Optional dry-run publish verification

To exercise non-publish verification paths without uploading:

```bash
bun run release:npm:publish:dry-run
```

## 4) Release evidence artifact

The publish verification command writes:

- `dist/release/npm-publish-report.json`

Keep that report linked in the release task/PR for traceability.
