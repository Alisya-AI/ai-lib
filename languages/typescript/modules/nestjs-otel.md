---
id: nestjs-otel
display: NestJS OpenTelemetry
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: observability
requires: [nestjs]
conflicts_with: []
---

# NestJS OpenTelemetry Conventions

- Treat tracing/metrics as first-class runtime behavior, not optional debug helpers.
- Propagate trace context across HTTP, queue, and async boundaries.
- Add custom spans around business operations that matter for latency/SLO analysis.
- Keep attribute cardinality bounded to avoid telemetry backend cost spikes.
- Ensure telemetry failures never break business request handling.
