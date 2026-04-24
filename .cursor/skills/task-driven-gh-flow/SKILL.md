---
name: task-driven-gh-flow
description: Execute roadmap work through GitHub tasks with strict traceability. Use when implementing planned backlog items, creating small PRs, linking PRs to issues, updating GitHub Projects after merge, and splitting tasks into sub-issues when a single PR is not enough.
---

# Task-Driven GitHub Flow

Use this workflow for every roadmap or backlog implementation task.

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

## End-to-End Workflow

Copy this checklist and execute in order:

```md
Progress:
- [ ] 1) Read next task and parent phase context
- [ ] 2) Confirm task scope is single-PR sized
- [ ] 3) Split into child tasks if multi-PR is needed
- [ ] 4) Branch from latest main
- [ ] 5) Implement + validate locally
- [ ] 6) Commit (small, scoped)
- [ ] 7) Push + create PR (assignee, label, Refs #issue)
- [ ] 8) Update issue body (`## Mapped PRs`) and add progress comment
- [ ] 9) After merge: close task, update parent phase checklist, update project status
- [ ] 10) Start next task
```

## Roadmap Planning in GitHub Projects

Use this when creating new roadmap phases (before implementation starts):

1. Create one Epic issue per phase (for example `Phase 10 - ...`).
2. Create Story issues and link each Story as a sub-issue of its Epic.
3. Create Task issues and link each Task as a sub-issue of its Story.
4. Set Issue Type on every item:
   - phase issues -> `Epic`
   - story issues -> `Story`
   - implementation units -> `Task`
5. Add all items to the roadmap project and set required fields (recommended baseline: `Status=Todo`, `Team=<team>`).
6. Verify hierarchy integrity by checking each Task has the expected parent Story and each Story has the expected parent Epic.

Title convention:

- Epic: keep `Phase XX - <name>`
- Story: `<short story name>` (no phase/type prefix)
- Task: `<short task name>` (no phase/type prefix)

## Step Details

## 1) Read the next task

- Open the task issue and parent phase issue.
- Confirm acceptance criteria and any project-field requirements.
- Verify the task is implementation-ready.

## 2) Decide PR sizing

- If scope is larger than one clean PR:
  - create child tasks (sub-issues),
  - move acceptance criteria to child tasks,
  - execute each child with its own PR.

## 3) Create branch

Branch naming pattern:

- `feat/phaseX-taskYY-short-topic` for feature work
- `fix/phaseX-taskYY-short-topic` for bug work
- `refactor/phaseX-taskYY-short-topic` or `infra/...` for maintenance work

## 4) Implement and validate

- Make only changes required for the task.
- Run targeted checks first, then full checks (`bun run check`) before PR.
- Do not include generated noise files unless intentionally required.

## 5) Commit style

Use this commit format:

```text
type: brief description (max 50 chars)

- Bullet point for specific change
- Bullet point for specific change
```

Keep one logical change per commit.

## 6) Create PR

PR requirements:

- Title reflects change type (`feat`, `fix`, `refactor`, `infra`, etc.).
- Body includes:
  - Summary bullets
  - Test plan checklist
  - `Refs #<task>`
- Set assignee and label at creation time.
- Verify the task issue `Development` field shows the created PR link.

## 7) Sync task issue immediately after PR creation

- Update task body checkboxes to reflect progress.
- Maintain a `## Mapped PRs` section and append the PR.
- Add a short comment like `Implemented in #<pr>`.
- Confirm `Development` still references the PR after any PR body/title edits.

## 8) Post-merge sync (mandatory before next task)

After merge:

1. Close the task issue with merge reference comment.
2. Update parent phase issue checklist and mapped PRs.
3. Update GitHub Project item statuses/fields as required.
4. Confirm next task is moved to `In progress`.

## 9) Continue loop

- Repeat the same flow for the next task.
- Never start coding the next task before post-merge sync is complete.

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
