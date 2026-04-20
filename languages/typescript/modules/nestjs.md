---
id: nestjs
display: NestJS
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: backend_framework
requires: []
conflicts_with: [express-framework, koa-framework, hapi-framework]
---

# NestJS Conventions

- Organize by feature modules; keep controllers/resolvers thin and delegate business logic to services.
- Treat Nest dependency injection as a composition tool, not a place to hide global state.
- Keep providers focused and testable with explicit constructor dependencies.
- Validate inbound payloads at boundaries with DTO/schema validation before business logic runs.
- Keep transport concerns (HTTP, GraphQL, queues) separate from domain rules.
- Use framework lifecycle hooks only for infra setup/cleanup, not feature logic.
