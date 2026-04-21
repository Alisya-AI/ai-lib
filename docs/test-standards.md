# Test Standards

This guide defines minimum testing expectations for `ailib` changes.

## 1) Required Test Types

- **Unit:** Validate single-function behavior (parsing, validation, formatting, merge helpers).
- **Integration:** Validate command workflows (`init`, `update`, `doctor`, `uninstall`) with filesystem effects.
- **Regression:** Add a test whenever fixing a bug to prevent recurrence.
- **Smoke:** Confirm end-to-end command flow and generated output sanity for core paths.

## 2) Coverage Thresholds

Coverage targets are minimums for changed code paths:

- **CLI/core logic (`src/`, `core/`):** 85% line coverage
- **Tooling scripts (`tools/`):** 80% line coverage
- **Critical command flows (`init/update/doctor/uninstall`):** 90% path coverage via integration tests

Notes:
- Thresholds are quality gates, not a substitute for meaningful assertions.
- Do not inflate coverage with low-value tests.

## 3) Naming and Organization

- Keep tests near existing suites under `test/` with descriptive names.
- Name test cases by behavior, not implementation details.
- Group related assertions by command or workflow context.
- Prefer deterministic fixtures and isolated temp directories.

## 4) Regression Rule

- Every bug fix must include a failing test first (or test update) proving the defect.
- The same test must pass with the fix.

## 5) PR Quality Gates

- `bun run typecheck` passes.
- `bun run check` passes.
- New/changed behavior includes tests.
- If coverage changes, explain rationale in PR summary.

## 6) Definition of Done

A test-related change is done when:
- required test types are addressed,
- coverage targets are respected for changed areas,
- and checks pass in CI/local validation flow.
