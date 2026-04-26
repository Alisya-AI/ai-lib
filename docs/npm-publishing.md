# npm publishing for `@alisya.ai/ailib`

This document defines the publish + verification flow for npm releases.

## Prerequisites

- npm account with publish access to `@alisya.ai/ailib`
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
- npm pack output excludes `.ts` source files

## 2) Publish and verify npm install resolution

Run the publish workflow:

```bash
bun run release:npm:publish
```

The workflow performs:

1. npm authentication check (`npm whoami`)
2. `npm publish --access public`
3. version resolution check (`npm view @alisya.ai/ailib version --json`)
4. published tarball reachability check (`npm view @alisya.ai/ailib@<version> dist.tarball --json` + HTTP probe)
5. clean-directory install verification (`npm install @alisya.ai/ailib@<version>`)
6. CLI smoke test (`npx ailib --help`)

The publish verification step automatically retries npm version resolution when the registry
returns transient `404` responses or a stale previous version immediately after publish.

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

This repository supports both automatic and manual publishing:

- Automatic trigger: push to `main` when README or code paths change
- Manual trigger: `workflow_dispatch`

- Workflow: `.github/workflows/npm-publish.yml`
- Trigger:
  - `push` on `main` for release-relevant paths
  - `workflow_dispatch` for operators
- Inputs:
  - `release_notes_url` (required)
  - `ref` (optional, default `main`)

The workflow runs:

1. (auto mode) bump patch version and push release commit to `main`
2. `bun run release:npm:publish`
3. sync in-repo `Formula/ailib.rb` to the published npm tarball URL + SHA256
4. create/update Homebrew tap formula PR in `Alisya-AI/homebrew-ailib` (when `HOMEBREW_TAP_TOKEN` is configured)
5. `bun run release:npm:record -- --release-notes-url=<input-or-generated>`
6. Uploads `dist/release/` as `npm-release-evidence` artifact
7. on failed `push` runs where npm metadata updated but tarball remains unreachable, performs one automatic recovery bump + redispatch

### Auto-release path filter

Auto-publish on `main` only runs when changes include release-relevant paths:

- `README.md`
- `src/**`, `core/**`, `languages/**`, `targets/**`, `registry/**`
- `scripts/**`, `tools/**`, `bin/**`, `schema/**`

Version-bump commits only touch `package.json`, so they do not re-trigger auto release.
Recovery commits are redispatched through `workflow_dispatch` automatically by the same workflow.

### Manual workflow_dispatch

For manual runs, provide:

- `release_notes_url`
- optional `ref`

Manual mode does not auto-bump version; publish should target the version already set in `package.json`.

### Secret configuration

Set `NPM_TOKEN` in repository secrets:

- npm type: Automation token (recommended for CI publish)
- scope: minimal publish permissions for `@alisya.ai/ailib`

Set `HOMEBREW_TAP_TOKEN` in repository secrets to enable tap PR automation:

- token type: fine-grained PAT (recommended)
- repository access: `Alisya-AI/homebrew-ailib` (contents + pull requests write)

### Optional hardening: npm trusted publishing

You can migrate from `NPM_TOKEN` to npm Trusted Publishing (OIDC) later.
That removes long-lived token storage and uses GitHub-issued identity.

### Legacy flow reference

The direct manual command sequence remains valid for local release operators:

1. `bun run release:npm:publish`
2. `bun run release:npm:record -- --release-notes-url=<input>`
