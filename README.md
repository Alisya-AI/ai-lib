# ailib

`ailib` is a universal AI context-injection engine built around pointer-based context routing.

## Install

```bash
npm install -g @ailib/cli
```

### Homebrew (without npm)

`ailib` can also be installed through Homebrew using a formula in this repository.

#### Current install (in-repo formula, HEAD)

```bash
brew install --HEAD --formula https://raw.githubusercontent.com/Alisya-AI/ai-lib/main/Formula/ailib.rb
```

This install path does not require npm on your machine; Homebrew installs the required Node runtime dependency.

#### Target install UX (`brew install ailib`)

To get native `brew install ailib`, publish a dedicated tap:

```bash
brew tap Alisya-AI/ailib
brew install ailib
```

See [docs/homebrew-publishing.md](docs/homebrew-publishing.md) for full publishing steps (tap path and Homebrew Core path).

### Why not a shell rewrite?

- The CLI performs non-trivial JSON/state merging and workspace orchestration that is safer in Node.
- Shell portability across macOS/Linux and maintenance complexity would be significantly higher.
- Homebrew distribution provides a better install UX without replacing the existing, tested JS CLI.

### Homebrew maintenance notes

- Publish immutable release artifacts (versioned tags) and use `url` + `sha256` in the tap formula for stable installs.
- Keep the in-repo formula as HEAD/dev convenience, and publish stable updates in `Alisya-AI/homebrew-ailib`.

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
