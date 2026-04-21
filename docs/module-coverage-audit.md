# Module/Slot Coverage Audit

This report is generated from `registry.json` and `languages/*/modules/*.md`.
Run `bun tools/generate-coverage-audit.ts` after registry/module documentation changes.

## Summary

- Registry modules: **37**
- Module docs: **37**
- Canonical slots: **28**

## Coverage by Language

### Go (`go`)

- Registry modules: 0
- Module docs: 0
- Missing docs: 0
- Orphan docs: 0
- Frontmatter issues: 0
- No gaps detected.

### Java (`java`)

- Registry modules: 0
- Module docs: 0
- Missing docs: 0
- Orphan docs: 0
- Frontmatter issues: 0
- No gaps detected.

### JavaScript (`javascript`)

- Registry modules: 0
- Module docs: 0
- Missing docs: 0
- Orphan docs: 0
- Frontmatter issues: 0
- No gaps detected.

### Python (`python`)

- Registry modules: 6
- Module docs: 6
- Missing docs: 0
- Orphan docs: 0
- Frontmatter issues: 0
- No gaps detected.

### Rust (`rust`)

- Registry modules: 0
- Module docs: 0
- Missing docs: 0
- Orphan docs: 0
- Frontmatter issues: 0
- No gaps detected.

### TypeScript (`typescript`)

- Registry modules: 31
- Module docs: 31
- Missing docs: 0
- Orphan docs: 0
- Frontmatter issues: 0
- No gaps detected.

## Slot Usage

- `linter`: 3 module(s)
  - `python:ruff`, `typescript:eslint`, `typescript:biome`
- `formatter`: 2 module(s)
  - `python:black`, `typescript:prettier`
- `package_manager`: 4 module(s)
  - `python:poetry`, `python:uv`, `typescript:bun`, `typescript:pnpm`
- `test_runner`: 2 module(s)
  - `python:pytest`, `typescript:vitest`
- `styling_system`: 1 module(s)
  - `typescript:tailwind`
- `frontend_framework`: 1 module(s)
  - `typescript:nextjs`
- `backend_framework`: 2 module(s)
  - `python:fastapi`, `typescript:nestjs`
- `ui_library`: 1 module(s)
  - `typescript:react`
- `http_adapter`: 1 module(s)
  - `typescript:fastify`
- `api_protocol`: 1 module(s)
  - `typescript:graphql`
- `graphql_server`: 1 module(s)
  - `typescript:apollo-server`
- `orm`: 2 module(s)
  - `typescript:prisma`, `typescript:typeorm`
- `event_bus`: 1 module(s)
  - `typescript:kafkajs`
- `logger`: 1 module(s)
  - `typescript:nestjs-pino`
- `observability`: 1 module(s)
  - `typescript:nestjs-otel`
- `runtime_platform`: 1 module(s)
  - `typescript:aws-lambda`
- `infra_framework`: 1 module(s)
  - `typescript:serverless-framework`
- `bundler`: 1 module(s)
  - `typescript:esbuild`
- `schema_validation`: 1 module(s)
  - `typescript:zod`
- `dto_validation`: 1 module(s)
  - `typescript:class-validator`
- `config_validation`: 1 module(s)
  - `typescript:joi`
- `api_docs`: 1 module(s)
  - `typescript:nestjs-swagger`
- `cloud_platform`: 1 module(s)
  - `typescript:aws-amplify`
- `payments_provider`: 1 module(s)
  - `typescript:stripe`
- `database_engine`: 1 module(s)
  - `typescript:dynamodb`
- `auth_provider`: 1 module(s)
  - `typescript:cognito`
- `email_provider`: 1 module(s)
  - `typescript:ses`
- `object_storage_provider`: 1 module(s)
  - `typescript:s3`

