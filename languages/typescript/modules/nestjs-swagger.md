---
id: nestjs-swagger
display: NestJS Swagger
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: api_docs
requires: [nestjs]
conflicts_with: []
---

# NestJS Swagger Conventions

- Keep OpenAPI documentation generated from source decorators and DTO metadata.
- Ensure request/response models in docs reflect real runtime behavior.
- Group endpoints by domain module for predictable API discoverability.
- Keep auth/security schemes explicit and aligned with runtime guards.
- Treat docs generation drift as a quality issue; update contracts with feature changes.
