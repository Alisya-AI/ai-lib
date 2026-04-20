---
id: class-validator
display: class-validator
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: dto_validation
requires: []
conflicts_with: []
---

# class-validator Conventions

- Validate DTOs at transport boundaries before invoking domain/service logic.
- Keep validation decorators focused on input constraints, not business invariants.
- Use explicit messages/codes when clients depend on machine-readable validation errors.
- Pair with transformation rules intentionally to avoid unexpected coercion.
- Keep custom validators deterministic and side-effect free.
