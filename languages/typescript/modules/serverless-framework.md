---
id: serverless-framework
display: Serverless Framework
version: 1.0.0
updated: 2026-04-20
language: typescript
slot: infra_framework
requires: [aws-lambda]
conflicts_with: [sst, cdk, sam]
tested_with:
  - claude-code>=1.2
  - cursor>=0.45
  - windsurf>=1.0
---

# Serverless Framework Conventions

This service deploys to AWS Lambda via the Serverless Framework. All infrastructure is expressed in `serverless.yml` (or split TypeScript config via `serverless.ts`). When you generate or modify infra code, follow these rules.

## Structure

- One `serverless.yml` per service package. No mega-service that deploys unrelated functions together.
- `functions:` entries live in the same file as the handler they point at, unless the file grows past ~200 lines — then split into `serverless/functions/*.yml` and include with `${file(...)}`.
- `provider:` block pins `runtime` (Node 20+), `region`, `stage`, `memorySize`, and `timeout` defaults. Per-function overrides are explicit.
- IAM permissions are declared per-function, not globally. `provider.iam.role.statements` is an anti-pattern for this codebase — use `iamRoleStatements` under each function.

## Stages and environments

- Stages: `dev`, `staging`, `prod`. The `stage` is `${opt:stage, 'dev'}`.
- Never hardcode account IDs, ARNs, or environment-specific values. Pull from SSM Parameter Store or Secrets Manager via `${ssm:/service/${self:provider.stage}/…}`.
- `serverless-dotenv-plugin` is used for local dev only — never commit `.env.{stage}` files.

## Plugins

The canonical plugin set is:

- `serverless-esbuild` — TypeScript bundling (see `esbuild.md`).
- `serverless-offline` — local dev.
- `serverless-iam-roles-per-function` — per-function IAM scoping.

Adding new plugins requires a PR comment explaining why the existing set is insufficient.

## Deployment

- `pnpm sls deploy --stage <stage>` — never deploy manually to prod. Prod goes through CI only.
- `pnpm sls deploy function -f <name>` for hot-patching a single function in non-prod.
- `pnpm sls remove` is destructive — requires explicit confirmation.

## When writing Lambda handlers

See `aws-lambda.md` for handler shape, error envelopes, and logging. This module governs infra; that one governs runtime code.

## Anti-patterns

- Do **not** use `serverless-webpack` — we standardised on esbuild.
- Do **not** put environment variables directly in `serverless.yml` — use SSM/Secrets Manager references.
- Do **not** share one Lambda across unrelated HTTP routes. One route, one handler (API Gateway or Function URL level).
- Do **not** add API Gateway REST APIs for new work — use HTTP API (`httpApi:`) unless there's a documented reason REST is required.
