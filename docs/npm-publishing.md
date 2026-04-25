# npm publishing for `@ailib/cli`

This document defines the publish + verification flow for npm releases.

## Prerequisites

- npm account with publish access to `@ailib/cli`
- npm auth already configured (`npm whoami`)
- repository on a clean release commit
- for GitHub Actions publishing: repository secret `NPM_TOKEN` with npm automation token

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

## 4) Generate release record

After publish verification, generate a markdown release record with release notes linkage:

```bash
bun run release:npm:record -- --release-notes-url=https://github.com/Alisya-AI/ai-lib/releases/tag/vX.Y.Z
```

This writes:

- `dist/release/npm-release-record.md`

## 5) Release evidence artifacts

The publish verification command writes:

- `dist/release/npm-publish-report.json`
- `dist/release/npm-preflight-report.json`
- `dist/release/npm-release-record.md`

Keep these artifacts linked in the release task/PR for traceability.

## 6) GitHub Actions release workflow

This repository includes a manual publish workflow:

- Workflow: `.github/workflows/npm-publish.yml`
- Trigger: `workflow_dispatch`
- Inputs:
  - `release_notes_url` (required)
  - `ref` (optional, default `main`)

The workflow runs:

1. `bun run release:npm:publish`
2. `bun run release:npm:record -- --release-notes-url=<input>`
3. Uploads `dist/release/` as `npm-release-evidence` artifact

### Secret configuration

Set `NPM_TOKEN` in repository secrets:

- npm type: Automation token (recommended for CI publish)
- scope: minimal publish permissions for `@ailib/cli`

### Optional hardening: npm trusted publishing

You can migrate from `NPM_TOKEN` to npm Trusted Publishing (OIDC) later.
That removes long-lived token storage and uses GitHub-issued identity.
