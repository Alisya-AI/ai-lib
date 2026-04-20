---
id: esbuild
display: esbuild (Lambda bundling)
version: 1.0.0
updated: 2026-04-20
language: typescript
slot: bundler
requires: []
conflicts_with: [webpack, rollup, tsup]
tested_with:
  - claude-code>=1.2
  - cursor>=0.45
---

# esbuild for Lambda

esbuild is the only bundler used for Lambda packaging, invoked via `serverless-esbuild`. Never introduce webpack, rollup, or tsc for runtime bundling.

## Config

Default esbuild options for Lambda bundles:

```ts
// serverless.ts or esbuild config
{
  bundle: true,
  minify: false,            // keep readable stack traces; size is rarely the bottleneck
  sourcemap: "linked",      // linked sourcemaps for production debugging
  target: "node20",
  platform: "node",
  format: "cjs",            // CJS unless the package has a documented ESM need
  external: [               // do not bundle — provided by Lambda runtime or layers
    "@aws-sdk/*"
  ],
  mainFields: ["module", "main"],
  keepNames: true           // preserves function names for logs/traces
}
```

## External packages

- `@aws-sdk/*` is always external — it's in the Node 20 Lambda runtime. Bundling it bloats cold starts.
- Native modules (`.node` files) must be marked external and shipped via Lambda layers. Never try to bundle them.
- If you add a dependency that ships native code or wasm, flag it in the PR — it needs explicit layer configuration.

## Output

- One bundle per handler. `serverless-esbuild` does this automatically via the `functions.*.handler` declarations.
- No shared chunks across functions. Cold-start isolation > bundle-size deduplication.

## TypeScript

- `tsconfig.json` targets `ES2022` and `module: "NodeNext"`.
- esbuild does not type-check. Type-checking is a separate CI step (`pnpm typecheck` → `tsc --noEmit`). Both run on every PR.

## Anti-patterns

- Do **not** minify production bundles. Debugging `n[0x1f3]` in CloudWatch is not worth the KB saved.
- Do **not** disable sourcemaps for prod. Upload them to Sentry (or equivalent) on deploy.
- Do **not** bundle `@aws-sdk/*`. See above.
- Do **not** use tsc as a bundler. It doesn't handle external imports the way Lambda expects.
