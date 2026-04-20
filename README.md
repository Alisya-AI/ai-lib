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
```

## Supported languages

- `typescript`
- `javascript`
- `python`
- `go`
- `rust`
- `java`

## Repository layout

- `registry.json`: source of truth for languages, modules, targets, and compatibility rules.
- `schema/`: JSON schemas used by registry/config data.
- `languages/`: core language docs and module docs used for generated pointers.
- `targets/`: output templates per IDE/tool target.
- `Formula/ailib.rb`: Homebrew formula used for installation.
