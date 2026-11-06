# Agent Guidelines

> Single source of truth for every coding agent (Codex, Claude Code, others). Rules specific to a package or app live in that directory's own `AGENTS.md`; repeatable procedures live in skills under `.agents/skills/` (symlinked into `.claude/skills/`); hooks share one script in `scripts/agent-hooks/` wired per agent. Add new agent configuration to these shared locations, never to an agent-specific one.

## Read first

- [`docs/business-rules.md`](docs/business-rules.md): product/domain rules.
- [`docs/engineering-rules.md`](docs/engineering-rules.md): Zaimu stack, shared components and infrastructure invariants. Read before implementation or review.
- **Nested `AGENTS.md` files.** Agents are normally started from the repository root, where nested files are not guaranteed to load. Before reading or editing anything in a directory, read every `AGENTS.md` between the repository root and that directory that you have not read yet, whatever the directory is called. List them with `git ls-files '*AGENTS.md'`. Their rules add to this file and win on conflicts inside their directory.
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

## Parallel work

Always do in parallel whatever can be done in parallel: issue independent tool calls (reads, searches, shell commands) in one batch and delegate independent subtasks to concurrent subagents. Serialize only when a step needs another step's output or when steps would contend for the same files, locks or git index.

Delegate unrelated tasks to subagents: when a request contains tasks with no dependency on each other (different projects, packages or concerns), hand each one to its own subagent and launch them concurrently in a single batch instead of working through them one by one in the main session. Give every subagent a self-contained prompt with the context it needs, keep file ownership disjoint, and verify and integrate their results yourself.

## Commits

After every completed task, commit with the local Git user as author and committer and a `Co-authored-by:` trailer for the agent:

```
git commit -m "..." -m "Co-authored-by: <Agent> <agent-email>"
```

On the user's machine add `-c commit.gpgsign=false`. Cloud sessions keep their preconfigured signing: disabling it makes GitHub show the commits as Unverified.

- Claude → `Co-authored-by: Claude <noreply@anthropic.com>`; Codex → `Co-authored-by: Codex <noreply@openai.com>`.
- On the user's machine the agent is only ever a co-author: never set it as author/committer, and do not pass `--author` or override `user.name`/`user.email`. Cloud sessions already run with the agent's own Git identity preconfigured; leave it as is and still add the trailer.
- Conventional Commits (`feat`, `fix`, `refactor`, `docs`, `style`, `chore`) scoped by package (`feat(frontend)`, `fix(backend)`).
- Atomic: one commit = one coherent, revertible change. Revert formatter edits outside your change. Prefer several small commits.
- Always split hunks: when a file already has uncommitted changes you did not make, stage only your own hunks (`git add -p`, or `git apply --cached` with a filtered patch) and commit just those. Never bundle the user's work-in-progress into your commit; leave it unstaged.
- Adjustments to something just delivered amend or rebase instead of adding noise, but only while the commits are still local. Never amend, rebase, reset or otherwise rewrite a commit that was already pushed (it exists on a remote branch, e.g. `git branch -r --contains <sha>` is non-empty); add a new commit on top instead.
- Validation is hook-driven (`.githooks/pre-commit` → lint-staged → `scripts/validate-staged.ts`). Do not run format/lint/type-check as manual pre-commit steps; fix hook failures at the root cause and commit again. Never bypass with `--no-verify` or `LEFTHOOK=0`.
- Never run type-checkers by hand (`tsc`, `npx tsc`, `bunx tsc`, `bun check`, `turbo run check-types`) to "verify" before committing, nor linters or formatters outside the hook: the pre-commit hook already runs them on exactly what you staged, and every extra run competes for CPU with the hooks of other concurrent sessions, slowing all commits. Commit, let the hook report errors, fix them and commit again. Only run one yourself when the user explicitly asks, or for the pre-PR/pre-merge check below.

## Agent changes

Any change related to agents (instructions, skills, hooks or configuration) must support at least **Codex and Claude Code**. Keep shared behavior in agent-neutral sources and wire it into both agents; do not implement it for only one. Apply corresponding shared behavior to the template at `/home/hyoretsu/Projects/ts-monorepo` and keep the global instructions for both agents aligned in the same task. Guideline-file edits are restricted to the template and global instructions, as specified below. In the template, put cross-project directives only in the root `AGENTS.md`, not in package-level guidelines. The template is the source of truth when shared rules diverge; preserve each project's actual domain and stack specifics.

## Template change propagation

- The template is `~/Projects/ts-monorepo`. For every requested template change, read `~/Projects/template-sync.txt` and propagate the completed change to each listed project in the same task, unless the user explicitly limits the scope. The file is a local, newline-separated list of project directory paths; ignore blank lines, expand a leading `~/`, and resolve relative paths against `~/Projects`. Deduplicate resolved paths and skip the template itself. Never execute file contents as shell commands. An empty file means no downstream projects; report a missing file or invalid project path rather than silently claiming propagation succeeded.
- Adapt the change to each project's actual stack and domain; do not blindly copy template files or overwrite branding, configuration, unrelated work or project-specific behavior. Read each project's instructions first. Use an isolated task worktree per repository, validate under its own rules, commit only the propagated change with the local Git identity and agent co-author, and integrate it back into that project's original branch. Do not push or perform remote operations. Report each project's commit or any blocker; do not claim the task fully propagated while a target remains blocked.
- **`AGENTS.md` files are always propagated; `CLAUDE.md` is never kept in projects.** Agent guideline files follow the same propagation as everything else: sync the template's root `AGENTS.md` and nested `AGENTS.md` files and delete any `CLAUDE.md` in the template and in every listed project (only the global `~/.claude/CLAUDE.md` stays) to every listed project, adapting only project-specific domain, stack and branding content, which each project keeps. The shared global instructions at `~/.agents/AGENTS.md` (used by both Codex and Claude Code) stay aligned with the template's cross-project directives, preserving global-only context.

## Plans

Only large features executed in Plan mode need a plan. `docs/` is product/domain knowledge; `plans/` is execution history organized by lifecycle:

- `plans/`: only newly created or in-progress plans.
- `plans/done/`: code-complete plans. Move the plan here as soon as all planned code is implemented; developer validation and approval are the developers’ responsibility and do not keep a plan open. Record any pending validation or approval explicitly in the archived plan without marking it as completed.
- `plans/discarded/`: abandoned, rejected or superseded plans. Record why they were discarded and link a replacement when applicable; never mark them completed just to archive them.

Name plans `NNNN-kebab-slug.md`, using the next sequential number across all three locations; never reuse an archived plan's number. Preserve the filename when moving a plan, update references and relative links, and commit the move with the corresponding completion or discard update. When resuming, read the existing plan wherever it is; if reopened, move it back to `plans/`. After each completed step, update progress and commit that update with the step's changes.

## Pre-PR / pre-merge

Run type-check and build for affected packages before a PR or merge. Local validation type-checks affected packages and runs backend unit coverage when backend source is staged; CI uses affected-package detection and the disposable integration/E2E runner. No local check authorizes push, deploy or remote database operations.

## Structure and naming

**File naming follows responsibilities.** Components, classes, use cases and DTO schemas use PascalCase: `AuthTabs.tsx`, `LoginForm.tsx`, `FormField.tsx`. Utilities, hooks and configs use kebab-case. Preserve established directory structures and their index barrels. Avoid unrelated renames.

## Tests

- Unit tests sit next to the file under test: `Foo.ts` → `Foo.test.ts`.
- Integration/E2E tests (several units, DB, cross-module) live in a `tests/` folder in the module. Never name it `__tests__` or any `__…__` form.
- Backend runs on Bun: `bun:test` and `bun test`.
- Pre-commit runs backend unit tests with `--changed` (only tests affected by the modified files); the full suite runs in CI.
- Ephemeral test services: the runner uses `DATABASE_DEV_URL` (or `POSTGRES_DEV_URL`), `REDIS_DEV_URL` and `RABBITMQ_DEV_URL` (set globally or in `.env`) when present, and starts a Docker container for each one that is missing. On an existing server it only creates and removes its own resources and never touches existing ones: Postgres gets a random uniquely named database (any database name in the URL is ignored), Redis keys and RabbitMQ queues/exchanges are namespaced per run and deleted afterwards.

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

## Documentation follows implementation

Shared rules describe invariants; repository-specific sections describe the actual stack and exceptions. Keep business rules in `docs/business-rules.md` and engineering rules in `docs/engineering-rules.md`.

## Development guides

Find development guides under `docs/development/` and read those applicable to the change; keep discovery links here when adding new ones. CD setup and release operations: [continuous delivery guide](docs/development/cd.md).
