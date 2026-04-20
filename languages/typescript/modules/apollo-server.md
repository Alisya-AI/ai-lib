---
id: apollo-server
display: Apollo Server
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: graphql_server
requires: [graphql]
conflicts_with: [mercurius]
---

# Apollo Server Conventions

- Keep context creation explicit and lightweight; inject only request-scoped dependencies.
- Use DataLoader (or equivalent) for batch loading in resolver-heavy paths.
- Standardize error mapping so clients receive stable error codes/messages.
- Enable observability hooks/plugins in a way that does not alter business responses.
- Apply depth/complexity controls for untrusted query surfaces.
