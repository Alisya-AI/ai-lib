---
id: cognito
display: Amazon Cognito
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: auth_provider
requires: []
conflicts_with: [auth0, clerk, firebase-auth]
---

# Cognito Conventions

- Treat Cognito as the source of identity truth and avoid duplicating credential state.
- Validate JWT claims (issuer, audience/client, expiry) before trusting authenticated requests.
- Keep authorization decisions explicit in application logic; authentication alone is insufficient.
- Separate user profile/domain data from identity-provider metadata.
- Handle challenge states and token refresh paths explicitly in auth flows.
- Never expose privileged Cognito client credentials in frontend code.
