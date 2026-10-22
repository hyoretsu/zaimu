# Global Guidelines

> The sections below apply across every project that uses this `AGENTS.md` / `CLAUDE.md`.

## NEVER affect anything outside the local machine (absolute rule)

Never perform any action whose effect leaves this computer. No exceptions, ever, without an explicit per-instance request from the user.

Forbidden unless the user explicitly asks for that specific action:
- `git push` (or any push to a remote), creating/updating PRs, pushing tags.
- Running database migrations, schema pushes, seeds, or any command against a remote/shared/external database.
- Triggering CI/CD, deploys, or remote jobs; publishing packages; sending requests that mutate external services.

Local work is fine: edit files, run local builds/tests, commit locally. Stop at the local boundary and let the user push / migrate / deploy themselves. If a task seems to need crossing that boundary, describe the exact command and ask first.

## Business Rules - Source of Truth

Project-specific product rules live in [`docs/business-rules.md`](docs/business-rules.md). Keep AGENTS.md focused on agent workflow and engineering conventions; move domain/product rules there instead.

## Git Commits - Required After Every Completed Task

After finishing any task (feature, fix, refactor, or guideline addition), always create a git commit with **the local user as both author and committer** and attribute the agent with a `Co-authored-by:` trailer:

```
git -c commit.gpgsign=false commit -m "..." -m "Co-authored-by: <Agent> <agent-email>"
```

**Never set the agent as author or committer.** Do not pass `--author` with an agent identity and do not override `user.name` or `user.email` with agent details. Use the identity of whichever agent actually contributed the change in the trailer:

- Claude → `Co-authored-by: Claude <noreply@anthropic.com>`
- Codex → `Co-authored-by: Codex <noreply@openai.com>`

Author and committer must always reflect the local machine's configured Git user. If unsure, follow whatever `git config --global` reports.

If the user requests an adjustment to something just delivered, amend or rebase rather than creating a separate noisy commit - keep history clean. Use Conventional Commits (`feat`, `fix`, `refactor`, `docs`, `style`, `chore`) with the monorepo package as scope (e.g. `feat(frontend)`, `fix(backend)`).

**Atomic commits.** One commit = one coherent, complete change (revertible on its own). Never bundle unrelated features/refactors/formatting into the same commit - if an automated formatter touches files outside your change, revert those before committing. Prefer several small, presentable commits over one large one.

**Commit validation is hook-driven.** Do not run formatting, linting, or type-checking as manual pre-commit steps. Stage intended files, then use normal `git commit`; the configured Git hooks run those checks and stage hook fixes. If a hook fails, fix root cause, stage affected files, and commit again. Never bypass hooks with `--no-verify` or `LEFTHOOK=0`.

## Plans - Versioned in the Repo

Use a plan in the top-level [`plans/`](plans/) folder only for large features executed in Plan mode, so progress survives long or interrupted work. Small tasks, fixes, and work outside Plan mode do not need a plan. Keep `docs/` for product/domain knowledge and `plans/` for planning/execution history; do not keep working plans under `~/.claude/plans`.

- For a required plan, create one file per feature, named with a zero-padded sequential prefix: `NNNN-kebab-slug.md` (e.g. `0001-jb-delivery-mvp.md`). The number gives chronological order; the next plan takes the next number.
- When starting or resuming work covered by a plan, **read** it from `plans/`. After **each completed step**, update progress and upcoming steps, then commit that update alongside the step's changes.

## Pre-PR / Pre-Merge Checks - Required Before Staging or Main

Run type-check and build for affected packages before PR/merge. Local commit validation uses `.githooks/pre-commit` -> lint-staged -> `scripts/validate-staged.ts`; it type-checks affected packages and runs backend unit coverage when backend source is staged. Formatting/linting stays hook-driven. CI uses affected package detection and the disposable integration/E2E runner. These existing Zaimu unit/coverage gates remain enabled. No local check authorizes push, deploy or remote database operations.

## Caveman

Terse like caveman. Technical substance exact. Only fluff die.
Drop: articles, filler (just/really/basically), pleasantries, hedging.
Fragments OK. Short synonyms. Code unchanged.
Pattern: [thing] [action] [reason]. [next step].
ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift.
Code/commits/PRs: normal. Off: "stop caveman" / "normal mode".

- Never put multiple components in the same file unless the file is intentionally using the Composition pattern. When a parent component needs private child components, turn it into a folder with `index.tsx`, move each child component to its own file, and place shared local types in `types.ts`.
- Always add ShadCN components through the ShadCN CLI.

## TanStack Router - Route File Convention

**Always use folder/index structure - never dot notation for multi-segment paths.**

```
✅ sports/$sportKey/events/$eventId.tsx
❌ sports.$sportKey.events.$eventId.tsx
```

- Nested route → create a folder, put page in `index.tsx` or a named file inside
- Layout-only files that just render `<Outlet />` can be omitted entirely - TanStack Router infers hierarchy from file names
- When moving files deeper, update all relative imports (depth increases, so `./components` → `../../components` etc.)
- After any route file change, rebuild so `routeTree.gen.ts` regenerates

## TanStack Router - File-Based Route Nesting

A route with children is a layout and must render Outlet. Use folder paths consistently: `foo/$param.tsx` for the layout, `foo/$param/index.tsx` for its index page and `foo/$param/terms/index.tsx` for a child. Move the parent's page content and page guard to the index route; preserve deliberate layout-wide authorization. Never place page content in a route that also has children. Regenerate routeTree.gen.ts through the frontend build after route changes.

## Component Architecture (Frontend)

- **Loading states before empty/error states.** While any request required to decide what a screen should render is pending, render skeletons that mirror the final content's dimensions and structure as closely as possible. Never infer "not found", "unavailable", or an empty collection from `undefined` data before the relevant request settles. Check `isPending`/`isLoading` first, then request errors, then settled empty/not-found states. When a screen depends on multiple requests, keep its skeleton until all required requests settle. Avoid generic spinner-only or one-block placeholders when shaped skeletons can preserve layout.
- **Simple, componentized components.** Break out parts that make sense into their own components - avoid bloated components with multiple responsibilities.
- **Shared form fields.** When create and edit forms repeat field groups, extract one shared field component and pass their small variations as props (for example, an optional product select or layout width). Never copy input markup between these forms.
- **Maximize reuse - design-system mindset.** Aggressively extract primitives (Container, Section, IconBadge, CheckList, BrandMark, SectionHeading, etc.) whenever a layout/presentation pattern repeats, even within a single page. Generic primitives go in [frontend/src/components/ui/](frontend/src/components/ui/); domain composites go in `frontend/src/components/<feature>/`. When in doubt, extract.
- **Inline table editing preserves exact geometry.** Entering edit mode must not change column widths, row structure, alignment, or overall table layout. Replace each displayed value one-for-one inside the same `<td>`; never merge cells, add `colSpan`, move values between columns, or change cell padding. Size editors within existing cells and neutralize/offset editor padding so editable text begins on the exact same baseline and horizontal position as display text. Keep action groups inside the existing action column.
- **Modal listings separate viewing from editing.** Default to a compact read-only row/card so users can scan and reorder many records. Show key data only: image thumbnail, name, short description, price/value, availability indicator, drag handle when sortable, plus icon-only Edit/Delete actions (with `aria-label` and `Tooltip`). Do not keep all fields editable in every listing row. Use a submodal when editing has enough fields to make the listing modal crowded. Every edit modal must provide explicit `Salvar` and `Descartar` actions; discard restores state from before opening and closes without retaining edits.
- **Modal sections collapse to title and summary.** Long modal sections must be individually collapsible. When collapsed, show the section title and one concise summary only; expanding reveals the editable content. For a unit address, the summary is the full formatted address.
- **File naming follows responsibilities.** Components, classes, use cases and DTO schemas use PascalCase: `AuthTabs.tsx`, `LoginForm.tsx`, `FormField.tsx`. Utilities, hooks and configs use kebab-case. Preserve established module directories such as `useCases`, `infra`, `dtos` and their index barrels. Avoid unrelated renames.
- **Page component co-location.** If a component is only used by one page (or a single parent component), place it in a `components/` folder adjacent to the file that uses it. Always create an `index.ts` barrel inside that folder. Example: `app/auth/components/AuthTabs.tsx` + `app/auth/components/index.ts`.
- **Fetch data in the deepest possible component.** The request belongs in the component that actually consumes the data. Only lift it to the parent if another sibling also needs the same data.
- **Respect the application runtime.** This frontend is a Vite React SPA, not an RSC application. Do not introduce server components or server-only assumptions. In projects that actually support RSC, keep client boundaries at the smallest interactive scope.
- **No `React.` namespace.** Never use `import * as React from "react"` or qualify types/hooks with `React.X`. Import everything by name: `import { forwardRef, useState, type HTMLAttributes, type ReactNode } from "react"`. `FormEvent`/`FormEventHandler` are deprecated in current typings - prefer an inline `onSubmit` handler so the type is inferred.
- **No `<input type="number">`.** Numeric inputs are better implemented as `type="text"` with explicit parsing and validation - `type="number"` has poor UX (scroll-to-change, inconsistent browser behavior, broken paste). Use `inputMode="numeric"` or `inputMode="decimal"` for mobile keyboard hints, parse the value with `parseFloat`/`parseInt` on change or blur, and store it as a string in local state until submission.
- **Always add masks and placeholders.** Every input that accepts a structured value (currency, percentage, date, phone, document number) must use a formatting mask - prefer `NumericFormat` from `react-number-format` for monetary/numeric fields (e.g. `prefix="R$ "`, `thousandSeparator="."`, `decimalSeparator=","`, `suffix="%"`). Every input and textarea must have a `placeholder` that shows a realistic example of the expected format (e.g. `"R$ 10.000,00"`, `"Ex: Plano Starter"`). Placeholder text must always use a more muted color than normal input text. Raw bare inputs with no context are not acceptable.
- **Always provide autofill metadata where applicable.** Every input whose purpose has a standard browser autocomplete token must use that `autoComplete` value plus a stable semantic `name`. Payment fields use `cc-name`, `cc-number`, `cc-exp`, and `cc-csc`; identity/contact/address fields use the corresponding standard token. Do not disable autocomplete for fields that password managers or browser autofill can fill. When wrapping or masking an input, verify that `name` and `autoComplete` reach the native `<input>`.
- **Always debounce text inputs.** Every `<input type="text">` and `<textarea>` must use `useDebouncedInput` from `@/hooks/use-debounced-input` - it keeps a local state that updates immediately (preserving the browser's native undo/Ctrl+Z history) and debounces the parent `onChange` callback (default 300 ms). Without this, each keystroke triggers a parent re-render that resets the browser undo stack. Pattern: `const [local, setLocal] = useDebouncedInput(form.field, v => set("field", v));` then bind `value={local}` and `onChange={e => setLocal(e.currentTarget.value)}`. For list rows, extract a row component so each row has its own local state.
- **Confirm only permanent destructive actions inline.** Native `alert()` and `confirm()` remain forbidden. Never use `showConfirm` for UI actions. Require confirmation only for irreversible consequences, such as deleting a product. The first click must open an anchored tooltip with confirmation text, replace its icon/text with an explicit confirmation control, and require a second click to execute. Confirmation expires after three seconds. Idle buttons retain their normal hover tooltip. Use `ConfirmActionButton` from `@/components/ui/ConfirmActionButton`. Preserve original button geometry: text-only stays text-only, icon-only stays icon-only, icon-plus-text keeps both. Reversible actions, including activating or deactivating coupons, execute on the first click and show a toast. Use `showAlert` only for blocking non-confirmation errors.
- **Toast every button with a side effect.** Any button that mutates state without navigating or opening a form - restoring defaults, copying a value from elsewhere, duplicating a record, clearing a cache, etc. - must confirm the action with `showToast(message, kind)` from `@/stores`. Without visible feedback the user can't tell whether the click did anything, especially when the visual result is subtle (e.g. copying one theme's colors onto another). Use `"info"` for neutral confirmations (copy/restore), `"positive"`/`"negative"` for outcomes that can fail. Use showAlert only for blocking errors; never use showConfirm for UI actions.
- **No native `<select>`.** Native selects have inconsistent cross-browser styling and a cramped arrow affordance. Always use `CustomSelect` from `@/components/ui/CustomSelect` instead - it renders a `<button>` trigger with a portal-based popover (`createPortal` + `position: fixed`) so it escapes `overflow: hidden/auto` containers (e.g. modals). Never wrap `CustomSelect` in a `<label>`; use a `<div>` with the label text above it since the trigger is a button, not an input.
- **No ghost (borderless) buttons.** Never render a button without a visible border. A ghost/borderless button is invisible at rest - users can't tell it's interactive. Always use `variant: "outline"` for secondary/subtle actions; reserve `variant: "ghost"` only for icon-only toolbar buttons where the icon itself communicates interactivity, and even then ensure a clear hover background.
- **Scrollbars use ScrollArea.** Every scrollable region, including touch/mobile, must use the shared ScrollArea. CSS-only native scrollbar styling does not satisfy this rule. Clip roots, inset tracks before rounded corners, constrain with min-h-0, put spacing on inner wrappers and enable horizontalScrollbar for horizontal regions.
- **Clickable controls use pointer cursor.** Unless explicitly defined otherwise, every clickable control must show `cursor-pointer` on hover. Preserve `disabled:cursor-not-allowed` for disabled controls. This includes buttons, custom-select triggers/options, labels that toggle checkboxes, and selectable modal rows.
- **Checkboxes use established custom component.** Never render a raw `<input type="checkbox">` in product UI. Use `Checkbox` from `@/components/ui/Checkbox` so all checkbox controls retain established design.
- **Sortable lists use animated `dnd-kit` sorting.** Every reorderable list of groups, rows, or cards must use `DndContext` + `SortableContext` from `dnd-kit`; native HTML `draggable` is forbidden for list sorting. The full item must follow the pointer with reduced opacity, while surrounding items animate out of the way in real time to preview the insertion order before drop. Use a visible drag-handle icon as the only pointer activator (never a numeric order field), configure pointer and keyboard sensors, restrict movement to the list's vertical axis and existing bounds with shared vertical-axis and list-bound modifiers, and persist normalized `sortOrder` values on drag end. Dragging must never create horizontal scrolling or extend vertical scrolling beyond the list's normal content height. Dragging an expanded group collapses it; dropping restores its previous expanded state. Cross-column workflows such as kanban and file-drop targets are not sortable lists and may use purpose-specific drag behavior.
- **Portuguese pluralization uses CLDR keys.** For `pt-BR`, define and call `_one` only for exactly `1`; define and call `_other` for `0` and every other count. Never treat zero as singular.
- **Disclosure labels use standard terms.** Toggle labels must use `Expandir` when closed and `Minimizar` when open. Avoid alternate wording such as "recolher".
- **Row action buttons get an icon; collapse to icon-only past a handful.** Any action button that isn't an essential Cancel/Save (e.g. table row actions like Editar, Configurar, Excluir) should be paired with a `react-icons/lu` icon alongside its label. When a row accumulates many actions (roughly 5+, e.g. a units table with Cardápio/Configurar/Endereço/Banner/Horários/Entrega/Excluir), drop the visible label entirely - render `size="icon"` buttons with just the icon, an `aria-label` for accessibility, and wrap each in `Tooltip` from `@/components/ui/Tooltip` so the label surfaces on hover/focus instead. This keeps wide action rows from overflowing while staying discoverable.
- **Mark required fields with an asterisk.** Any field the user must fill before submitting (HTML `required`, or otherwise gating the submit button, e.g. `disabled={!name}`) must show a destructive-colored `*` next to its label - this is standard form UX and lets users spot what's missing without a failed submit. Use `RequiredMark` from `@/components/ui/RequiredMark`. Since `Label` is a CSS grid where each direct child becomes its own row, wrap the label text and the mark together in one element so they render on the same line: `<span>{t("field.label")} <RequiredMark /></span>` as the first child, followed by the input.
- **Collapse multi-row create forms above a listing.** When a page has a multi-row create/associate form at the top and a listing below (e.g. `/admin/products`, `/admin/units`), the form must collapse to show only its **first row and that row's labels** - every row and section heading _beyond_ the first collapses. It expands on hover, on focus (`focus-within`), or whenever any of its inputs holds state (so a half-filled form never collapses out from under the user). Use a shared collapsible form section to wrap rows past the first; if no suitable primitive exists, implement it before referencing it. Its expanded state must include all populated field values; the parent `<form>` must carry the `group` class (and lay rows out with `space-y-*`, not a single form-wide grid, so the collapsed region can be a distinct block). Any section heading (`FormSectionHeading`) that belongs to a collapsed row goes _inside_ the `CollapsibleFormSection`, never above it - only the first row's heading stays visible. The submit button stays visible in the always-shown footer.

## Auth Guards - Never Conflate Rate Limiting with Unauthenticated

Inspect the HTTP result of auth/session requests before redirecting. An empty successful session or HTTP 401 means unauthenticated. HTTP 403 means forbidden; preserve the project's authorization behavior. HTTP 429 means rate limited: keep the route and show retry feedback or backoff. Never interpret failed, pending or rate-limited requests as missing sessions. Apply this to all guards and session synchronization, using actual existing module paths rather than assuming staff/super-admin guards exist.

## Backend DTOs (Elysia / TypeBox)

**DTOs are always TypeBox schemas, never TypeScript interfaces.** The type is derived with `typeof XxxDTO.static`:

```ts
// ✅ correct
export const CreateReceiptDTO = t.Object({
    ...CreateReceiptBody.properties,
    companyId: t.Optional(t.String()),
    filename: t.String(),
    userId: t.String(),
});
export type CreateReceiptDTO = typeof CreateReceiptDTO.static;

// ❌ avoid
export interface CreateReceiptDTO {
    companyId?: string;
    filename: string;
    // ...
}
```

To compose DTOs, use a single `t.Object` with a `.properties` spread - **never** `t.Intersect`:

```ts
// ✅ correct
export const ListPriceAlertsDTO = t.Object({ ...ListPriceAlertsQuery.properties, userId: t.String() });

// ❌ avoid
export const ListPriceAlertsDTO = t.Intersect([ListPriceAlertsQuery, t.Object({ userId: t.String() })]);
```

`t.Intersect` produces poorly resolved runtime types during validation; the `.properties` spread produces a correct flat schema.

### DTO Naming vs. Elysia Option

- **Return DTO**: name it `XxxReturn` or `XxxResult` - it reflects the use-case domain, without knowledge of HTTP infrastructure.
- **Elysia controller**: pass the DTO under the `response:` key, **never** `result:`.

```ts
// ✅ correct - the Elysia key is "response"
.get("/revenue", handler, { response: GetRevenueReturn })

// ❌ wrong - "result" is not recognized by Elysia; it generates `any` types in Kubb
.get("/revenue", handler, { result: GetRevenueReturn })
```

Using `result:` makes Elysia ignore the response typing, which makes Kubb generate `XxxQueryResponse = any` in the generated SDK.

## Frontend SDK - Mandatory Rule

**Never edit files inside `frontend/src/lib/api/generated/`.** They are completely overwritten on every regeneration.

Correct flow when adding or changing an endpoint:
1. Change the backend (controller/DTO).
2. `bun run export` in the backend → updates `backend/generated/openapi.json` and `generateOpenApi.ts`.
3. `bun run generate` in the frontend → regenerates the SDK in `generated/`.

If you need a hook for an endpoint that is not yet available on the production server, place it in `frontend/src/lib/api/` (outside `generated/`) and re-export it through `frontend/src/lib/api/index.ts`.

## i18n - Mandatory Rule

The translation files in [frontend/src/i18n/locales/](frontend/src/i18n/locales/) **must remain synchronized**. Today only `en-US.json` exists.

**Every time you add, rename, or remove a key, apply the change to ALL locale files in the same operation.** Never leave one locale behind another, even if the final translation still needs review - in that case, use the fallback-language string as a placeholder and leave a comment in the PR, but ensure the key structure is identical across files.

- The fallback locale is the ground truth for types (see [frontend/src/i18n/types.d.ts](frontend/src/i18n/types.d.ts)).
- Keys inside JSON files follow alphabetical order (linter rule).
- When introducing a new namespace, register it in [frontend/src/i18n/config.ts](frontend/src/i18n/config.ts) and in `types.d.ts`.

### Enums Are Frontend-Translatable Contracts

Backend status/error enums (e.g. KYC status, bet status, payout status, error codes) exist to give the frontend predictability: the frontend translates the enum value, it never renders the raw value to the user. Whenever you add or change an enum member on the backend, add the matching translation key to **all** locale files in the same change, and render it through `t()` with the raw value as `defaultValue` (e.g. ``t(`kyc.status.${user.kycStatus}`, { defaultValue: user.kycStatus })``). Never render a raw enum value in the UI.

## Test File Placement

- **Unit tests** live **next to the file under test** - `Foo.ts` → `Foo.test.ts` in the same directory.
- **Integration / E2E tests** (multiple units, DB, or cross-module flows) live in a `tests/` folder within the relevant module.
- **Never** name the folder `__tests__` (or any `__…__` form). The folder is always plainly named `tests`.
- Backend runs on Bun: tests use `bun:test` and `bun test`.

## Local worktrees and atomic commits

Always implement in an isolated worktree. Record original branch, preserve unrelated staged and working changes, commit coherent increments, then integrate completed commits into the original branch without push. Prefer explicit commit paths; never include unrelated staged files. Wait and retry temporary Git locks, never remove locks owned by active processes or bypass hooks.

After integrating a task into the original branch (including `main`), remove its isolated worktree with `git worktree remove <path>` before reporting completion. Verify that every intended commit was integrated and the worktree has no staged, unstaged or untracked work, and is not in use by another task or process. For cherry-picked or squashed changes, verify equivalent changes in the destination rather than relying only on ancestry. Never use `--force` or delete a directory directly to bypass these checks. If cleanup is blocked by remaining work or active use, preserve the worktree and report its path and reason. Do not remove other tasks' worktrees.

Use `git worktree remove` so Git removes both the directory and its registration. If a task's directory was already deleted, inspect `git worktree prune --dry-run` before pruning stale registrations; never prune entries belonging to active or temporarily unavailable worktrees. Verify the task worktree no longer appears in `git worktree list` after cleanup. Branch deletion is separate and must never discard unintegrated commits.

## Documentation follows implementation

Instructions must name real scripts, hooks, paths and components. Shared rules describe invariants; repository-specific sections describe actual stack and exceptions. Do not copy domain examples, production namespaces or nonexistent helper paths from another project. Keep business rules in docs/business-rules.md.

## Project-specific engineering rules

Engineering rules document how this repository must be implemented: stack choices, shared components, infrastructure conventions and technical behavior that agents must preserve. They supplement the reusable workflow and engineering conventions in AGENTS.md. Product/domain policies belong in `docs/business-rules.md` instead.

Keep repository-specific engineering rules in `docs/engineering-rules.md`. When adapting this template to a new project, update that file to reflect the actual stack, paths, scripts and components; do not copy another application's rules blindly. Keep this explanation and the mandatory reference below in AGENTS.md so future agents know where to read and maintain project-specific constraints.

Before implementation or review, read [docs/engineering-rules.md](docs/engineering-rules.md) and follow its applicable rules.
