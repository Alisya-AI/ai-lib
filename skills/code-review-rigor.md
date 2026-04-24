---
name: code-review-rigor
description: Run bug-risk-first code reviews that prioritize behavioral regressions, test gaps, and unsafe assumptions.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# code-review-rigor

## Purpose

- Focus reviews on risk, correctness, and maintainability over style-only feedback.
- Catch behavioral regressions before merge.
- Ensure test coverage matches change risk and blast radius.

## Workflow

- Start with change intent, scope boundaries, and known non-goals.
- Trace critical paths affected by the diff, including error and fallback behavior.
- Check for behavioral regressions in state transitions, data contracts, and side effects.
- Validate input validation, null/edge handling, and failure-mode resilience.
- Review concurrency, ordering, idempotency, and retry assumptions where relevant.
- Confirm observability impact: logs, metrics, and error signals for changed paths.
- Evaluate test plan quality: missing edge cases, brittle assertions, and risk blind spots.
- Prioritize feedback by severity and user impact.
- Recommend minimal, concrete fixes and clearly mark must-fix versus optional follow-ups.
