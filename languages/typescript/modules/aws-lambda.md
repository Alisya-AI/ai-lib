---
id: aws-lambda
display: AWS Lambda (Node.js)
version: 1.0.0
updated: 2026-04-20
language: typescript
slot: runtime_platform
requires: []
conflicts_with: [cloudflare-workers, vercel-functions]
tested_with:
  - claude-code>=1.2
  - cursor>=0.45
---

# AWS Lambda Handler Conventions

All runtime code for Lambda follows these rules, regardless of deployment tool.

## Handler shape

Handlers are default exports named `handler`:

```ts
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  // …
};
```

Use the **v2** types (`APIGatewayProxyHandlerV2`, `APIGatewayProxyEventV2`) — HTTP API, not REST API. SQS, SNS, DynamoDB Streams, EventBridge, and S3 each have their own typed handler imports from `aws-lambda`.

## Responsibilities of a handler

A handler does four things, in order:

1. **Parse and validate** input (body, path params, query) with Zod — see `zod.md`.
2. **Delegate** to a pure domain function that knows nothing about Lambda or HTTP.
3. **Map the domain result** to an HTTP response.
4. **Log** before returning (success or error).

Business logic never lives in the handler file. Handlers are ~30–60 lines. If a handler exceeds that, the domain logic has leaked in.

## Error handling

- Every handler wraps its body in a single try/catch at the top level.
- Known domain errors are mapped to 4xx responses with a stable error envelope:

  ```json
  { "error": { "code": "ACCOUNT_NOT_FOUND", "message": "…", "requestId": "…" } }
  ```

- Unexpected errors are logged with full context and return a generic 500 — never leak stack traces or internal messages to callers.
- Never `throw` out of a handler unless you specifically want Lambda's built-in retry/DLQ behaviour (event-driven invocations only, not HTTP).

## Logging

- Use the service's structured logger (JSON to stdout). No `console.log` in production code.
- Every log line includes `requestId` (from `context.awsRequestId`) and `route` / `handler` identity.
- Log **on entry** (with sanitised inputs) and **on exit** (with latency). No per-step debug noise at info level.

## Cold start discipline

- Top-level imports matter. Use dynamic `import()` for large deps used only in one branch.
- Initialise AWS SDK clients at module scope, not inside the handler.
- Prefer specific `@aws-sdk/client-*` packages over the v2 monolithic `aws-sdk` — v2 is banned in this codebase.
- No top-level `await` for expensive I/O. Defer secret fetches to first handler invocation, cached in a module-level variable.

## Middleware

Middy is optional. When used, keep the chain short and documented at the top of the handler file. Common middleware: `httpJsonBodyParser`, `httpErrorHandler`, a custom auth middleware, a custom logging middleware. No more than five middlewares per handler.

## Anti-patterns

- No `aws-sdk` (v2). Use `@aws-sdk/*` v3.
- No shared mutable state between handlers in the same bundle beyond clients and config.
- No environment variable reads inside the handler body — read at module scope, fail fast at cold start if required env is missing.
- No `Promise.all` over unbounded input arrays. Chunk or use a concurrency limiter.
