# Workflow Security Hardening

This document defines hardened defaults for GitHub Actions workflows in `ai-lib`.

## Default rules

- Use `pull_request` instead of `pull_request_target` for untrusted contributions.
- Keep top-level permissions minimal (`contents: read` by default).
- Set job-level elevated permissions only when required.
- Use `actions/checkout` with `persist-credentials: false`.
- Add `concurrency` groups to avoid stale runs.
- Add `timeout-minutes` to prevent unbounded execution.

## External PR handling

- External/fork PRs must run with least privilege.
- Jobs requiring repository secrets must be guarded to avoid running on forked PRs.
- Trusted-only jobs should use explicit `if` conditions to limit execution context.

## Current implementation in this repository

- `quality-gates.yml` uses minimal permissions and non-persistent checkout credentials.
- `security-scans.yml` runs dependency audit for all contexts, but restricts secret-dependent scans for fork PRs.
- Secret scan and CodeQL jobs are gated to trusted contexts while preserving coverage on push/main and schedule.
