---
id: react
display: React
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: ui_library
requires: []
conflicts_with: [preact, solid, vue]
---

# React Conventions

- Build UI as small, composable components with clear props and no hidden side effects.
- Keep components pure: derive output from props/state; avoid mutations in render.
- Prefer function components and hooks over class components.
- Use `useEffect` only for real side effects (subscriptions, timers, external sync), not for simple data derivation.
- Keep state as close as possible to where it is used; lift state only when required by multiple children.
- Memoize only when needed (`useMemo`, `useCallback`, `memo`) and only with a measurable render-cost benefit.
- Use strict TypeScript props for every component; avoid `any` and implicit `children` assumptions.
