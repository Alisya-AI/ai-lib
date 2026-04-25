# ailib

`ailib` is a context-as-code CLI for AI tooling. It generates, validates, and keeps instruction files in sync across Claude Code, Cursor, Copilot, OpenAI, Gemini, and more from one shared configuration.

## What you get

- One source of truth for AI tooling behavior (`ailib.config.json` + generated outputs).
- Managed `.ailib/` pointer files from the built-in registry.
- Target-specific instruction files (for example `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/ailib.mdc`).
- Reusable built-in skills plus custom workspace-local skills.
- Monorepo support with root and workspace-level operations.
- Health checks with `ailib doctor`.

## Install

### npm

```bash
npm install -g @alisya.ai/ailib
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

### Local install from repository

```bash
bun run local:install
```

## Guided quick start (single repo)

1. Initialize your project:

```bash
ailib init --language=typescript --modules=eslint,vitest --targets=claude-code,copilot
```

2. Generate/update outputs after config changes:

```bash
ailib update
```

3. Validate generated files:

```bash
ailib doctor
```

4. Evolve your stack over time:

```bash
ailib add prettier
ailib remove prettier
```

## Guided monorepo workflow

Initialize root with workspace patterns:

```bash
ailib init --language=typescript --modules=eslint --targets=claude-code,cursor --workspaces=apps/*,services/*
```

Run commands for a specific workspace:

```bash
ailib update --workspace=apps/web
ailib add prettier --workspace=apps/web
ailib doctor --workspace=apps/web
```

## Discover modules and skills

Use discovery commands before changing config:

```bash
ailib modules list --language=typescript
ailib modules explain nextjs --language=typescript
ailib skills list
ailib skills explain release-readiness
```

Author and validate custom skills in a workspace:

```bash
ailib skills init release-manager --workspace=apps/web --description="Release orchestration workflow"
ailib skills validate --workspace=apps/web
```

## Customize behavior with local overrides

Use `ailib.local.json` when specific workspaces need different modules, slots, targets, or skills than your default baseline.

See [docs/local-override-model.md](docs/local-override-model.md) for the schema, precedence rules, and examples.

## Uninstall

Remove generated files for the current workspace:

```bash
ailib uninstall
```

Remove generated files across all workspaces from monorepo root:

```bash
ailib uninstall --all
```

## Documentation map

Getting started:

- CLI usage guide: [docs/cli-usage-guide.md](docs/cli-usage-guide.md)
- Built-in skills catalog: [docs/built-in-skills-catalog.md](docs/built-in-skills-catalog.md)
- Local override workflow: [docs/local-override-model.md](docs/local-override-model.md)

Extending `ailib`:

- Add targets: [docs/targets-guide.md](docs/targets-guide.md)
- Add modules/slots: [docs/modules-slots-guide.md](docs/modules-slots-guide.md)
- Slot governance rules: [docs/slot-standards.md](docs/slot-standards.md)

Quality and governance:

- Development standards: [docs/development-standards.md](docs/development-standards.md)
- Test standards: [docs/test-standards.md](docs/test-standards.md)
- Quality gates quickstart: [docs/quality-gates-quickstart.md](docs/quality-gates-quickstart.md)
- Coverage exceptions and rationale: [docs/coverage-exceptions.md](docs/coverage-exceptions.md)
- Module catalog: [docs/module-catalog.md](docs/module-catalog.md)
- Module/slot coverage audit: [docs/module-coverage-audit.md](docs/module-coverage-audit.md)

Release and security:

- Homebrew publishing: [docs/homebrew-publishing.md](docs/homebrew-publishing.md)
- Workflow hardening patterns: [docs/workflow-security-hardening.md](docs/workflow-security-hardening.md)
- Branch protection policy: [docs/branch-protection-policy.md](docs/branch-protection-policy.md)
- Follow-up roadmap: [docs/follow-up-plan.md](docs/follow-up-plan.md)

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
