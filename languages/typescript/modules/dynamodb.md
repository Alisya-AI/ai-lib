---
id: dynamodb
display: DynamoDB
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: database
requires: []
conflicts_with: [postgres, mysql, mongodb]
---

# DynamoDB Conventions

- Model access patterns first, then design keys/indexes; avoid table scans in hot paths.
- Keep item shapes typed and validated at boundaries before writes.
- Use conditional writes/updates where correctness depends on item state.
- Centralize key construction helpers to avoid drift in PK/SK formats.
- Apply retry/backoff for throughput and transient AWS errors.
- Do not place business logic directly in repository adapters; keep persistence concerns isolated.
