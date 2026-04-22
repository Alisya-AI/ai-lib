# Branch Protection Policy

This policy defines required branch protection settings for `main` and the expected maintainer flow.

## Protected branch target

- Branch: `main`
- Restrict direct pushes: enabled
- Require pull request before merging: enabled
- Dismiss stale reviews on new commits: enabled
- Require conversation resolution before merge: enabled

## Required status checks

Set the following checks as required before merge:

### Quality checks

- `lint`
- `typecheck`
- `test`
- `registry-validation`
- `coverage`
- `check`

### Security checks

- `dependency-audit`
- `codeql-analysis`
- `secret-scan`

## Merge policy

- Require at least 1 approving review.
- Require branch to be up to date before merge.
- Disable force push on protected branches.
- Disable branch deletion for protected branches.

## External PR policy

- External/fork PRs run with least privilege and must not receive repository secrets.
- Secret-dependent jobs are restricted to trusted contexts (non-fork PRs, push to `main`, schedule).
- Maintainers should verify security job behavior before adding/removing required checks.

## Maintainer operational flow

1. Ensure PR references a task issue (`Refs #<issue>`).
2. Verify required checks are green (quality + security).
3. Confirm issue checklist and `## Mapped PRs` are updated.
4. Merge PR.
5. Close task issue and update parent phase + project status.
