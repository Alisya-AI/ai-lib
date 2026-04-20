---
id: aws-amplify
display: AWS Amplify
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: cloud_platform
requires: []
conflicts_with: [firebase, supabase]
---

# AWS Amplify Conventions

- Keep Amplify configuration centralized in a dedicated module; initialize once and reuse.
- Separate public client configuration from server-only secrets and privileged operations.
- Prefer environment-driven configuration for stages/environments; never hardcode project IDs or secrets.
- Keep hosting/build settings deterministic and scriptable in versioned config files.
- For auth flows, delegate token/session handling to Amplify primitives instead of custom token storage.
- Fail fast with clear error messaging when required Amplify environment configuration is missing.
