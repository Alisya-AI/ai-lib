---
id: graphql
display: GraphQL
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: api_protocol
requires: []
conflicts_with: []
---

# GraphQL Conventions

- Keep schema design domain-first and version-safe; avoid leaking database shapes directly.
- Resolve fields efficiently to prevent N+1 behavior (batching/caching where needed).
- Make nullability intentional and consistent with real runtime guarantees.
- Keep resolver methods thin and move business rules to service/domain layers.
- Validate authorization per field/operation, not just at transport entry points.
