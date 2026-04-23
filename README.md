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
Branch protection and required check policy: [docs/branch-protection-policy.md](docs/branch-protection-policy.md).
Guide for adding new targets: [docs/targets-guide.md](docs/targets-guide.md).
Guide for adding modules and slots: [docs/modules-slots-guide.md](docs/modules-slots-guide.md).
End-to-end CLI usage guide: [docs/cli-usage-guide.md](docs/cli-usage-guide.md).
Local override workflow and guarantees: [docs/local-override-model.md](docs/local-override-model.md).

### Local install from repository

```bash
bun run local:install
```

## Documentation index

- CLI usage: [docs/cli-usage-guide.md](docs/cli-usage-guide.md)
- Add targets: [docs/targets-guide.md](docs/targets-guide.md)
- Add modules/slots: [docs/modules-slots-guide.md](docs/modules-slots-guide.md)
- Slot governance rules: [docs/slot-standards.md](docs/slot-standards.md)
- Development standards: [docs/development-standards.md](docs/development-standards.md)
- Test standards: [docs/test-standards.md](docs/test-standards.md)
- Coverage exceptions and rationale: [docs/coverage-exceptions.md](docs/coverage-exceptions.md)
- Quality gates quickstart: [docs/quality-gates-quickstart.md](docs/quality-gates-quickstart.md)
- Workflow hardening: [docs/workflow-security-hardening.md](docs/workflow-security-hardening.md)
- Branch protection policy: [docs/branch-protection-policy.md](docs/branch-protection-policy.md)
- Homebrew publishing: [docs/homebrew-publishing.md](docs/homebrew-publishing.md)
- Local override workflow and guarantees: [docs/local-override-model.md](docs/local-override-model.md)
- Module catalog: [docs/module-catalog.md](docs/module-catalog.md)
- Module/slot coverage audit: [docs/module-coverage-audit.md](docs/module-coverage-audit.md)
- Follow-up roadmap: [docs/follow-up-plan.md](docs/follow-up-plan.md)

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

For complete CLI and maintenance command coverage, see:

- [docs/cli-usage-guide.md](docs/cli-usage-guide.md)

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
