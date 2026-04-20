---
id: fastify
display: Fastify
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: http_server
requires: []
conflicts_with: [express, koa, hapi]
---

# Fastify Conventions

- Prefer Fastify adapters/plugins over Express middleware compatibility layers.
- Keep route hooks lightweight and deterministic; avoid heavy async work in global hooks.
- Use JSON schema validation/serialization where possible for predictable request handling.
- Register plugins in explicit dependency order and keep encapsulation boundaries clear.
- Favor immutable request context enrichment over mutating shared objects.
