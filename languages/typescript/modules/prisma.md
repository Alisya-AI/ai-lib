---
id: prisma
display: Prisma
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: orm
requires: []
conflicts_with: [typeorm, sequelize, mongoose, kysely, drizzle]
---

# Prisma Conventions

- Treat Prisma schema as the contract for persistence and review migrations as code.
- Keep Prisma access behind repository/service boundaries for testability and portability.
- Use explicit transaction scopes for multi-step writes that must remain consistent.
- Select only needed fields on read paths to control query cost and response payload size.
- Handle known database error codes with deterministic application-level error mapping.
