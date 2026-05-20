# ADR 0006: Trusted Bot Auto-Merge Policy

## Status

Accepted.

## Context

The repository is intended to be self-maintaining, but it is public and must not auto-merge arbitrary code. Dependabot, Release Please, and GitHub Actions can create useful maintenance PRs, but those PRs still need validation.

## Decision

Enable auto-merge only for trusted bot PRs with expected titles:

- Dependabot dependency updates: `chore(deps):` and `chore(deps-dev):`
- Release Please release PRs: `chore(main): release`

Branch protection requires the main checks before merge. GitHub Actions are pinned by commit SHA, and `scripts/check_actions_pinned.sh` enforces that policy.

## Consequences

- Minor maintenance can flow without manual clicks.
- Human-authored PRs and unexpected bot PRs are not auto-merged by this workflow.
- The policy favors conservative automation over blanket autonomy.
- If a bot PR is behind `main`, GitHub auto-merge waits until required checks pass on the updated branch.
