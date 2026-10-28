# Agent Guidelines

> Single source of truth for every coding agent (Codex, Claude Code, others). `CLAUDE.md` only imports this file. Package rules live in `frontend/AGENTS.md` and `backend/AGENTS.md`; repeatable procedures live in skills under `.agents/skills/` (symlinked into `.claude/skills/`); hooks share one script in `scripts/agent-hooks/` wired per agent. Add new agent configuration to these shared locations, never to an agent-specific one.

## Read first

Agents are normally started from the repository root, where nested `AGENTS.md` files are not guaranteed to load. Read them explicitly:

- [`docs/business-rules.md`](docs/business-rules.md): product/domain rules.
- [`docs/engineering-rules.md`](docs/engineering-rules.md): Zaimu stack, shared components and infrastructure invariants. Read before implementation or review.
- [`frontend/AGENTS.md`](frontend/AGENTS.md): read before reading or editing anything under `frontend/`.
- [`backend/AGENTS.md`](backend/AGENTS.md): read before reading or editing anything under `backend/`.
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

## Structure and naming

**File naming follows responsibilities.** Components, classes, use cases and DTO schemas use PascalCase: `AuthTabs.tsx`, `LoginForm.tsx`, `FormField.tsx`. Utilities, hooks and configs use kebab-case. Preserve established module directories such as `useCases`, `infra`, `dtos` and their index barrels. Avoid unrelated renames.

## Tests

- Unit tests sit next to the file under test: `Foo.ts` → `Foo.test.ts`.
- Integration/E2E tests (several units, DB, cross-module) live in a `tests/` folder in the module. Never name it `__tests__` or any `__…__` form.
- Backend runs on Bun: `bun:test` and `bun test`.

## i18n - Mandatory Rule

The translation files in [frontend/src/i18n/locales/](frontend/src/i18n/locales/) **must remain synchronized**. The project is adopting i18n: these paths are the target layout and are created with the first i18n setup. Until then, add no hardcoded locale-specific structure elsewhere.

**Every time you add, rename, or remove a key, apply the change to ALL locale files in the same operation.** Never leave one locale behind another, even if the final translation still needs review - in that case, use the fallback-language string as a placeholder and leave a comment in the PR, but ensure the key structure is identical across files.

- The fallback locale is the ground truth for types (see `frontend/src/i18n/types.d.ts`).
- Keys inside JSON files follow alphabetical order (linter rule).
- When introducing a new namespace, register it in `frontend/src/i18n/config.ts` and in `types.d.ts`.

### Enums Are Frontend-Translatable Contracts

Backend status/error enums (e.g. KYC status, bet status, payout status, error codes) exist to give the frontend predictability: the frontend translates the enum value, it never renders the raw value to the user. Whenever you add or change an enum member on the backend, add the matching translation key to **all** locale files in the same change, and render it through `t()` with the raw value as `defaultValue` (e.g. ``t(`kyc.status.${user.kycStatus}`, { defaultValue: user.kycStatus })``). Never render a raw enum value in the UI.

## Enforced rules

Not repeated elsewhere:

- `bun run lint` (see `eslint.config.mjs`) fails on: `React.` namespace/`import * as React`, `<input type="number|checkbox|date|datetime-local|month|week">`, native `<select>`, `alert`/`confirm`, `t.Intersect`.
- Edits to generated files (`frontend/src/lib/api/generated/`, `backend/generated/`, `frontend/src-tauri/gen/`, `packages/sql/out/`, `*.gen.ts`) are blocked before they happen by `scripts/agent-hooks/block-generated-edits.ts`, wired for Claude Code in `.claude/settings.json` and for Codex in `.codex/hooks.json`. Regenerate instead (`backend-endpoint-sdk` skill, frontend build). Keep both configs pointing at the same script.

## Style

Caveman mode: terse, technical substance exact, no filler or pleasantries; fragments fine. Code, commits and PRs stay normal. Off on "stop caveman" / "normal mode".
