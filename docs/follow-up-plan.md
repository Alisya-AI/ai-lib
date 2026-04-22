# Follow-Up Implementation Plan

This roadmap tracks post-foundation work for `ailib`.

## Phase 1: TypeScript + Bun foundation

- Move implementation files from JavaScript to TypeScript.
- Use Bun for package scripts and test execution.
- Keep behavior unchanged while improving maintainability.

## Phase 2: Development and test standards

- Add development standards for:
  - TDD
  - Clean Code
  - SOLID
- Add test standards for:
  - minimum coverage thresholds
  - required test types (unit, integration, regression, smoke)
- Enforce standards in CI and contribution flow.

## Phase 3: Module and slot mapping completion

- Audit all current modules/slots and map any missing items.
- Fill gaps with docs, registry entries, and tests.
- Apply standards and rules consistently across the library.

## Phase 4: CI/CD and security hardening

- Add GitHub Actions checks for:
  - lint/style
  - tests
  - coverage minimums
  - schema and generation sync validation
  - security scans and dependency auditing
- Add secure community PR guardrails:
  - least-privilege workflows
  - protected branch checks
  - hardened workflow policies

## Phase 5: Contributor and user guides

- Add dedicated guides for:
  - adding new targets
  - adding new modules
  - adding new slots
  - using the CLI
- Keep README concise with links to those docs.

## Phase 6: Consumer-local customization

- Add an override mechanism so consumers can customize local behavior without forking or patching generated files.
- Proposed shape:
  - project-local override file (for example `ailib.local.json`), ignored by default in VCS
  - override scopes for selected targets, modules, and slots
  - merge strategy that survives `ailib update` and new `ailib` versions
  - validation + doctor checks for invalid overrides
- Guarantee:
  - upstream `ailib` upgrades do not wipe consumer-local customizations.

Model draft and schema reference: [docs/local-override-model.md](local-override-model.md), [schema/override.schema.json](../schema/override.schema.json).
