# ailib

`ailib` is a universal AI context-injection engine built around pointer-based context routing.

## Install

```bash
npm install -g @ailib/cli
```

### Homebrew (without npm)

`ailib` can also be installed through Homebrew using a formula in this repository.
This is currently a **HEAD install** (latest `main`) until versioned release artifacts are published.

```bash
brew install --HEAD --formula https://raw.githubusercontent.com/Alisya-AI/ai-lib/main/Formula/ailib.rb
```

This install path does not require npm on your machine; Homebrew installs the required Node runtime dependency.

### Why not a shell rewrite?

- The CLI performs non-trivial JSON/state merging and workspace orchestration that is safer in Node.
- Shell portability across macOS/Linux and maintenance complexity would be significantly higher.
- Homebrew distribution provides a better install UX without replacing the existing, tested JS CLI.

### Homebrew maintenance notes

- Publish immutable release artifacts (or versioned tags) and update `Formula/ailib.rb` URL + SHA256 per release.
- If you move to a dedicated tap, copy this formula into that tap and keep automated version/checksum bumps in CI.

## Commands

```bash
ailib init
ailib update
ailib add <module>
ailib remove <module>
ailib doctor
ailib uninstall
```

## Repository Layout

- `registry.json` source-of-truth mapping for languages/modules/targets
- `schema/` JSON schemas for registry and module metadata
- `core/` global behavior and architecture guidance
- `languages/` per-language core + modules
- `targets/` IDE router templates
