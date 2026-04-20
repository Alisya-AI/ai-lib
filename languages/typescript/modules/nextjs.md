---
id: nextjs
display: Next.js
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: frontend_framework
requires: [react]
conflicts_with: [remix, astro, sveltekit, nuxt]
---

# Next.js Conventions

- Default to Server Components; mark files with `'use client'` only when browser APIs, event handlers, or client-side hooks are needed.
- Keep route files minimal; move reusable UI into components and non-UI logic into `lib`/services.
- Use `next/link` for internal navigation and `next/image` for optimized images when possible.
- Treat environment variables carefully: only expose browser-safe keys through `NEXT_PUBLIC_*`.
- Co-locate route-specific loading/error states with each route segment.
- Use typed APIs for route params and request/response payloads.
- Avoid leaking framework-specific concerns into domain/business logic modules.
