---
id: zod
display: Zod (runtime validation)
version: 1.0.0
updated: 2026-04-20
language: typescript
slot: schema_validation
requires: []
conflicts_with: [io-ts, yup, joi]
tested_with:
  - claude-code>=1.2
  - cursor>=0.45
---

# Zod Conventions

Zod is the single source of truth for all runtime schemas: Lambda event payloads, API responses, configuration, and DynamoDB item shapes. No ad-hoc `typeof` checks or hand-rolled validators.

## Schema location

- Shared schemas live in `packages/<service>/src/schemas/` and are exported as both the schema (`UserSchema`) and the inferred type (`type User = z.infer<typeof UserSchema>`).
- Handler-specific request/response schemas live next to the handler, not in the shared folder.
- Never duplicate a type and a Zod schema — derive the type from the schema.

## Handler usage

Every Lambda handler validates its input at the top and its output at the bottom:

```ts
const RequestSchema = z.object({
  accountId: z.string().uuid(),
  prompt: z.string().min(1).max(4000)
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const parsed = RequestSchema.safeParse(JSON.parse(event.body ?? '{}'));
  if (!parsed.success) {
    return badRequest('INVALID_INPUT', parsed.error.flatten());
  }
  // …domain call…
  return ok(ResponseSchema.parse(result));
};
```

- Use `safeParse` at input boundaries and turn failures into typed 4xx responses. Never throw on input-validation failures.
- Use `parse` (throwing) at output boundaries — a schema mismatch on the way out is a programmer error, not a client error, and should surface loudly in logs.

## Branded types

Use `z.string().uuid().brand<"AccountId">()` for domain identifiers. This prevents accidentally passing an `AccountId` where a `ProjectId` is expected at compile time.

## Error mapping

A shared helper converts `ZodError` to the standard error envelope:

```ts
function badRequest(code: string, details: unknown) {
  return {
    statusCode: 400,
    body: JSON.stringify({ error: { code, message: 'Invalid input', details } })
  };
}
```

No handler reinvents this mapping.

## Performance

- Define schemas at module scope, never inside the handler body.
- Use `.strict()` on inbound schemas to reject unknown fields. Use default (strip) on outbound.

## Anti-patterns

- No TypeScript-only type guards for data crossing a trust boundary (HTTP, queue, DB).
- No `as Type` casts after parsing — Zod already narrowed the type.
- No `.catch()` on `safeParse` — it doesn't throw, there's nothing to catch.
- Do not mix io-ts or yup into this codebase. Zod is the one validator.
