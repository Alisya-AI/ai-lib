# Module Catalog

This catalog is generated from `registry.json`.
Run `bun tools/generate-module-catalog.ts` after registry changes.

## Slot Catalog

- `linter` (exclusive) - Primary static analysis tool.
- `formatter` (exclusive) - Primary code formatter.
- `package_manager` (exclusive) - Dependency/package manager.
- `test_runner` (exclusive) - Main unit/integration test runner.
- `styling_system` (exclusive) - Primary CSS styling system.
- `frontend_framework` (exclusive) - Frontend web application framework.
- `backend_framework` (exclusive) - Backend application framework.
- `ui_library` (exclusive) - Primary UI component library/runtime.
- `http_adapter` (exclusive) - HTTP server/adapter runtime.
- `api_protocol` (composable) - API protocol style (REST/GraphQL/etc).
- `graphql_server` (exclusive) - GraphQL server implementation.
- `orm` (exclusive) - Database ORM/data mapper.
- `event_bus` (exclusive) - Primary event streaming/message bus client.
- `logger` (exclusive) - Structured logging integration.
- `observability` (composable) - Telemetry/tracing integration.
- `runtime_platform` (exclusive) - Compute runtime platform.
- `infra_framework` (exclusive) - Infrastructure/deployment framework.
- `bundler` (exclusive) - Code bundler/build pipeline tool.
- `schema_validation` (exclusive) - General schema validation library.
- `dto_validation` (composable) - DTO/request validation layer.
- `config_validation` (composable) - Configuration/environment validation.
- `api_docs` (composable) - API documentation generator.
- `cloud_platform` (exclusive) - Application cloud platform integration.
- `payments_provider` (exclusive) - Payments platform provider.
- `database_engine` (exclusive) - Primary database engine/service choice.
- `auth_provider` (exclusive) - Authentication/identity provider.
- `email_provider` (exclusive) - Outbound email transport provider.
- `object_storage_provider` (exclusive) - Object storage provider.

## Language Modules

### Go (`go`)

Core: `languages/go/core.md`

- No modules registered.

### Java (`java`)

Core: `languages/java/core.md`

- No modules registered.

### JavaScript (`javascript`)

Core: `languages/javascript/core.md`

- No modules registered.

### Python (`python`)

Core: `languages/python/core.md`

#### linter

- `ruff` — requires: (none); conflicts: (none)

#### formatter

- `black` — requires: (none); conflicts: ruff-format

#### package_manager

- `poetry` — requires: (none); conflicts: uv, pdm, pipenv
- `uv` — requires: (none); conflicts: poetry, pdm, pipenv

#### test_runner

- `pytest` — requires: (none); conflicts: (none)

#### backend_framework

- `fastapi` — requires: (none); conflicts: (none)

### Rust (`rust`)

Core: `languages/rust/core.md`

- No modules registered.

### TypeScript (`typescript`)

Core: `languages/typescript/core.md`

#### linter

- `biome` — requires: (none); conflicts: eslint, prettier
- `eslint` — requires: (none); conflicts: biome
- `eslint-js` — requires: eslint; conflicts: biome
- `typescript-eslint` — requires: eslint; conflicts: biome

#### formatter

- `prettier` — requires: (none); conflicts: biome

#### package_manager

- `bun` — requires: (none); conflicts: npm, pnpm, yarn
- `pnpm` — requires: (none); conflicts: npm, yarn, bun

#### test_runner

- `vitest` — requires: (none); conflicts: jest

#### styling_system

- `tailwind` — requires: (none); conflicts: (none)

#### frontend_framework

- `nextjs` — requires: react; conflicts: remix, astro, sveltekit, nuxt

#### backend_framework

- `nestjs` — requires: (none); conflicts: express-framework, koa-framework, hapi-framework

#### ui_library

- `react` — requires: (none); conflicts: preact, solid, vue

#### http_adapter

- `fastify` — requires: (none); conflicts: express, koa, hapi

#### api_protocol

- `graphql` — requires: (none); conflicts: (none)

#### graphql_server

- `apollo-server` — requires: graphql; conflicts: mercurius

#### orm

- `prisma` — requires: (none); conflicts: typeorm, sequelize, mongoose, kysely, drizzle
- `typeorm` — requires: (none); conflicts: prisma, sequelize, mongoose, kysely, drizzle

#### event_bus

- `kafkajs` — requires: (none); conflicts: amqplib, nats

#### logger

- `nestjs-pino` — requires: nestjs; conflicts: nestjs-winston

#### observability

- `nestjs-otel` — requires: nestjs; conflicts: (none)

#### runtime_platform

- `aws-lambda` — requires: (none); conflicts: cloudflare-workers, vercel-functions

#### infra_framework

- `serverless-framework` — requires: aws-lambda; conflicts: sst, cdk, sam

#### bundler

- `esbuild` — requires: (none); conflicts: webpack, rollup, tsup

#### schema_validation

- `zod` — requires: (none); conflicts: io-ts, yup, joi

#### dto_validation

- `class-validator` — requires: (none); conflicts: (none)

#### config_validation

- `joi` — requires: (none); conflicts: (none)

#### api_docs

- `nestjs-swagger` — requires: nestjs; conflicts: (none)

#### cloud_platform

- `aws-amplify` — requires: (none); conflicts: firebase, supabase

#### payments_provider

- `stripe` — requires: (none); conflicts: (none)

#### database_engine

- `dynamodb` — requires: (none); conflicts: postgres, mysql, mongodb

#### auth_provider

- `cognito` — requires: (none); conflicts: auth0, clerk, firebase-auth

#### email_provider

- `ses` — requires: (none); conflicts: sendgrid, mailgun, postmark

#### object_storage_provider

- `s3` — requires: (none); conflicts: cloudflare-r2, gcs, azure-blob

