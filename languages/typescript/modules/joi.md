---
id: joi
display: Joi
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: config_validation
requires: []
conflicts_with: []
---

# Joi Conventions

- Use Joi schemas for runtime config/environment validation during startup.
- Fail fast when required config is missing or invalid; do not defer config errors to runtime paths.
- Keep defaults explicit in schemas and avoid hidden implicit values.
- Separate configuration schema concerns from request payload validation concerns.
- Centralize config schema composition so all services inherit consistent rules.
