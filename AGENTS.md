# Agent Guidelines

> Single source of truth for every coding agent (Codex, Claude Code, others). `CLAUDE.md` only imports this file. Directory-scoped rules live in nested `AGENTS.md` files (`frontend/`, `backend/`); repeatable procedures live in skills under `.agents/skills/` (symlinked into `.claude/skills/`). Add new agent configuration to these shared locations, never to an agent-specific one.

## Read first

- [`docs/business-rules.md`](docs/business-rules.md): product/domain rules.
- [`docs/engineering-rules.md`](docs/engineering-rules.md): Zaimu stack, shared components and infrastructure invariants. Read before implementation or review.
- [`frontend/AGENTS.md`](frontend/AGENTS.md) and [`backend/AGENTS.md`](backend/AGENTS.md): loaded when working in those packages.
- Keep this file for workflow and cross-package rules. Do not copy domain examples or nonexistent paths from another project; instructions must name real scripts, hooks, paths and components.

## Skills

Load the matching skill before starting that kind of task:

| Skill                      | When                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `task-worktree`            | Local sessions: start any implementation task in an isolated worktree and integrate it back. |
| `ui-screenshot-validation` | Any interface change, before reporting completion.                                           |
| `backend-endpoint-sdk`     | Adding or changing an endpoint, DTO or response; regenerating the frontend SDK.              |
| `tanstack-route-files`     | Adding, moving or renaming files under `frontend/src/routes`.                                |

## Local boundary (local sessions)

When running on the user's machine, never perform an action whose effect leaves it unless the user explicitly asks for that specific action:

- `git push`, creating/updating PRs, pushing tags.
- Migrations, schema pushes, seeds or any command against a remote/shared/external database.
- Triggering CI/CD, deploys or remote jobs; publishing packages; mutating external services.

Local work is fine: edit files, run local builds/tests, commit locally. If a task needs to cross the boundary, describe the exact command and ask first.

Cloud/remote sessions have an ephemeral container and cannot rely on the user pushing: follow the environment's own instructions (push the designated branch, open a draft PR). Never run migrations against a remote/shared database from any session without explicit authorization.

## Commits

After every completed task, commit with the local Git user as author and committer and a `Co-authored-by:` trailer for the agent:

```
git commit -m "..." -m "Co-authored-by: <Agent> <agent-email>"
```

On the user's machine add `-c commit.gpgsign=false`. Cloud sessions keep their preconfigured signing: disabling it makes GitHub show the commits as Unverified.

- Claude → `Co-authored-by: Claude <noreply@anthropic.com>`; Codex → `Co-authored-by: Codex <noreply@openai.com>`.
- Never set the agent as author/committer; do not pass `--author` or override `user.name`/`user.email`.
- Conventional Commits (`feat`, `fix`, `refactor`, `docs`, `style`, `chore`) scoped by package (`feat(frontend)`, `fix(backend)`).
- Atomic: one commit = one coherent, revertible change. Revert formatter edits outside your change. Prefer several small commits.
- Adjustments to something just delivered amend or rebase instead of adding noise.
- Validation is hook-driven (`.githooks/pre-commit` → lint-staged → `scripts/validate-staged.ts`). Do not run format/lint/type-check as manual pre-commit steps; fix hook failures at the root cause and commit again. Never bypass with `--no-verify` or `LEFTHOOK=0`.

## Plans

Only large features executed in Plan mode need a plan in [`plans/`](plans/), named `NNNN-kebab-slug.md` with the next sequential number. Read it when resuming; after each completed step update progress and commit that update with the step's changes. `docs/` is product/domain knowledge, `plans/` is execution history.

## Pre-PR / pre-merge

Run type-check and build for affected packages before a PR or merge. Local validation type-checks affected packages and runs backend unit coverage when backend source is staged; CI uses affected-package detection and the disposable integration/E2E runner. No local check authorizes push, deploy or remote database operations.

## Tests

- Unit tests sit next to the file under test: `Foo.ts` → `Foo.test.ts`.
- Integration/E2E tests (several units, DB, cross-module) live in a `tests/` folder in the module. Never name it `__tests__` or any `__…__` form.
- Backend runs on Bun: `bun:test` and `bun test`.

## Lint-enforced rules

These fail `bun run lint` (see `eslint.config.mjs`) and are not repeated elsewhere: no `React.` namespace/`import * as React`, no `<input type="number|checkbox|date|datetime-local|month|week">`, no native `<select>`, no `alert`/`confirm`, no `t.Intersect`.

## Style

Caveman mode: terse, technical substance exact, no filler or pleasantries; fragments fine. Code, commits and PRs stay normal. Off on "stop caveman" / "normal mode".
