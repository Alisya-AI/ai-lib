# ailib

`ailib` generates and maintains AI instruction files for your repo from a language + module + target configuration.

## What it does

- Creates and updates `.ailib/` pointer files from the built-in registry.
- Generates target-specific instruction files (for example `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/ailib.mdc`).
- Supports monorepos with root + service workspaces.
- Verifies generated files with `ailib doctor`.

## Install

### npm

```bash
npm install -g @ailib/cli
```

### Homebrew

Current in-repo formula (HEAD):

```bash
brew install --HEAD --formula https://raw.githubusercontent.com/Alisya-AI/ai-lib/main/Formula/ailib.rb
```

Planned stable user flow via tap:

```bash
brew tap Alisya-AI/ailib
brew install ailib
```

Homebrew publishing and release steps: [docs/homebrew-publishing.md](docs/homebrew-publishing.md).
Workflow hardening patterns for external PRs: [docs/workflow-security-hardening.md](docs/workflow-security-hardening.md).

### Local install from repository

```bash
bun run local:install
```
Slot governance and naming rules: [docs/slot-standards.md](docs/slot-standards.md).
Development standards for contributions: [docs/development-standards.md](docs/development-standards.md).
Test standards and coverage thresholds: [docs/test-standards.md](docs/test-standards.md).
Generated module catalog: [docs/module-catalog.md](docs/module-catalog.md).
Module/slot coverage audit report: [docs/module-coverage-audit.md](docs/module-coverage-audit.md).
Follow-up implementation roadmap: [docs/follow-up-plan.md](docs/follow-up-plan.md).

## Quick start

Initialize in the current repo:

```bash
ailib init --language=typescript --modules=eslint,vitest --targets=claude-code,copilot
```

Update generated outputs:

```bash
ailib update
```

Add/remove a module:

```bash
ailib add prettier
ailib remove prettier
```

Validate workspace files:

```bash
ailib doctor
```

Uninstall generated files:

```bash
ailib uninstall
```

## CLI commands

```bash
ailib init [--language=<lang>] [--targets=a,b] [--modules=m1,m2] [--workspaces=a/*,b/*] [--bare] [--no-inherit] [--on-conflict=overwrite|merge|skip|abort]
ailib update [--workspace=<path>]
ailib add <module> [--workspace=<path>]
ailib remove <module> [--workspace=<path>]
ailib doctor [--workspace=<path>]
ailib uninstall [--all]
ailib slots list
ailib modules list [--language=<lang>]
ailib modules explain <module> [--language=<lang>]
```

## Maintenance commands

```bash
bun run registry:build
bun run registry:check
bun run catalog:build
bun run catalog:check
bun run coverage-audit:build
bun run coverage-audit:check
bun run coverage:build
bun run coverage:check
bun run release:build
bun run security:audit
bun run lint
bun run local:install
bun run typecheck
bun run test
bun run tools:build
bun run standards:check
bun run check
```

## Supported languages

- `typescript`
- `javascript`
- `python`
- `go`
- `rust`
- `java`

## Supported targets

- `claude-code`
- `cursor`
- `windsurf`
- `copilot`
- `jetbrains`
- `openai`
- `gemini`

## Repository layout

- `registry/`: split registry sources (`core.json` and `registry/languages/*.json`).
- `registry.json`: generated registry artifact consumed by the CLI.
- `schema/`: JSON schemas used by registry/config data.
- `languages/`: core language docs and module docs used for generated pointers.
- `targets/`: output templates per IDE/tool target.
- `tools/`: generation utilities for registry and docs catalogs.
- `Formula/ailib.rb`: Homebrew formula used for installation.
