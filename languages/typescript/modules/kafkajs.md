---
id: kafkajs
display: KafkaJS
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: event_bus
requires: []
conflicts_with: [amqplib, nats]
---

# KafkaJS Conventions

- Make consumer handlers idempotent; duplicate delivery is expected in distributed systems.
- Commit offsets only after successful processing of the corresponding message batch.
- Keep topic naming/versioning explicit and documented to avoid schema drift.
- Use bounded retry and dead-letter patterns for poison messages.
- Separate serialization/schema concerns from business handlers.
