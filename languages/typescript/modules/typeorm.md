---
id: typeorm
display: TypeORM
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: orm
requires: []
conflicts_with: [prisma, sequelize, mongoose, kysely, drizzle]
---

# TypeORM Conventions

- Keep entity definitions stable and avoid overloading them with business logic.
- Use repository/query-builder patterns intentionally; avoid hidden lazy-loading surprises.
- Scope transactions explicitly for workflows that require atomicity.
- Keep migration files deterministic and reviewed; do not rely on ad-hoc production sync.
- Prefer explicit relation loading over broad eager-loading in hot paths.
