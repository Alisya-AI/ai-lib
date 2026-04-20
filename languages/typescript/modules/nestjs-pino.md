---
id: nestjs-pino
display: NestJS Pino
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: logging
requires: [nestjs]
conflicts_with: [nestjs-winston]
---

# NestJS Pino Conventions

- Use structured JSON logs with stable keys rather than free-form log strings.
- Include request/trace correlation IDs in all logs that cross service boundaries.
- Keep log levels intentional: `info` for lifecycle events, `warn/error` for actionable issues.
- Avoid logging secrets or raw sensitive payloads; sanitize before logging.
- Do not place business decisions in logging interceptors/middleware.
