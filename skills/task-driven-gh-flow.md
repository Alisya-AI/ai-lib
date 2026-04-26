---
name: task-driven-gh-flow
description: Execute roadmap work through GitHub tasks with strict traceability. Use when implementing planned backlog items, creating small PRs, linking PRs to issues, updating GitHub Projects after merge, and splitting tasks into sub-issues when a single PR is not enough.
compatible_languages: [typescript, python, go, java, rust, javascript]
compatible_targets: [cursor, claude-code, copilot, openai, gemini, windsurf, jetbrains]
---

# task-driven-gh-flow

## Purpose

- Execute roadmap and backlog delivery with strict one-task/one-PR traceability.
- Keep planning hierarchy clear using native `Epic -> Story -> Task` issue relationships.
- Ensure project tracking, issue state, and PR linkage stay in sync throughout delivery.

## Workflow

1. Read the active task plus its parent Story/Epic context and acceptance criteria.
2. Confirm the task is single-PR sized; if not, split into child tasks before coding.
3. Branch from latest `main` with a scoped name that references phase/task context.
4. Implement only task-required changes and validate with targeted checks plus full checks.
5. Commit one logical change using concise commit title and bullet details.
6. Open one PR per task with summary bullets, test checklist, assignee/label, and `Refs #<task>`.
7. Immediately sync task issue body (`## Mapped PRs`) and add progress comment.
8. After merge, close task, update parent checklist/mapped PRs, and move project fields to next state.
9. Repeat the loop for the next task only after post-merge sync is complete.

## Non-Negotiable Rules

1. Every PR must link to exactly one task issue via `Refs #<issue>`.
2. Every task should be completed by one PR when possible.
3. If work requires more than one PR, split the task into child tasks in GitHub first, then map one PR per child task.
4. Keep PRs small, scoped, and mergeable.
5. After merge, sync issue + project state before starting the next task.
6. For roadmap planning, always model hierarchy as `Epic -> Story -> Task` using native issue parent/sub-issue links.
7. Set real GitHub Issue Types (`Epic`, `Story`, `Task`) on every created item; never rely only on title prefixes.
8. Keep `Phase XX` in Epic titles only. Story and Task titles must be clean, without `[Phase XX][Story]` or `[Phase XX][Task]` prefixes.
9. Add all created items to the target GitHub Project and set required fields (at minimum `Status` and `Team` when configured).
10. Every task issue must show its PR in the GitHub issue `Development` field (not only in comments/body links).

## Default PR Metadata

- Assignee: `silvamarcel`
- Label selection:
  - `maintenance` for refactor/chore/infra/docs/process updates
  - `feature` for new functionality
  - `bug` for defect fixes

If uncertain, prefer `maintenance` and note why in PR summary.

## PR Body Template

```md
## Summary

- <change 1>
- <change 2>

## Test plan

- [x] Run `<command>`
- [x] Run `<command>`

Refs #<issue>
```

## Issue Body Pattern

Ensure task issues include:

- `## Goal`
- `## Tasks` (checkboxes)
- `## Acceptance criteria` (checkboxes)
- `## Mapped PRs` (append-only log)

For multi-PR work, replace one task with child tasks and keep each child mapped to one PR.
