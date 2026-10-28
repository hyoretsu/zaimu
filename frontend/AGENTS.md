# Frontend Guidelines

Vite React SPA (Tauri shell in `src-tauri`), not an RSC app: no server components or server-only assumptions. Shared rules live in the root [`AGENTS.md`](../AGENTS.md); Zaimu UI invariants (dialogs, scrolling, date/money fields, URL view state, batching) live in [`docs/engineering-rules.md`](../docs/engineering-rules.md). Skills: `ui-screenshot-validation` (every interface change), `tanstack-route-files` (route files), `backend-endpoint-sdk` (SDK regeneration).

## Generated SDK

Never edit `src/lib/api/generated/`; regeneration overwrites it. Hooks for endpoints not yet in the generated SDK go in `src/lib/api/` and are re-exported through `src/lib/api/index.ts`.

## Components

- Simple, componentized: split parts with their own responsibility into components. One component per file, unless the file intentionally uses the Composition pattern. A parent with private children becomes a folder with `index.tsx`, one file per child and shared local types in `types.ts` (see `components/ui/PageActions`).
- Reuse aggressively: extract primitives whenever a layout/presentation pattern repeats, even within one page. Generic primitives go in `src/components/ui/`; domain composites in `src/components/<feature>/`. When in doubt, extract.
- Component used by one page or parent lives in an adjacent `components/` folder with an `index.ts` barrel.
- Fetch data in the deepest component that consumes it; lift only when a sibling needs the same data.
- Shared form fields: create and edit forms that repeat field groups use one shared field component with small variations as props. Never copy input markup.
- ShadCN components are added through the ShadCN CLI.
- Import React APIs by name (`import { useState, type ReactNode } from "react"`). Prefer an inline `onSubmit` so the event type is inferred.

## Loading, empty and error states

While any request needed to decide what to render is pending, render skeletons that mirror the final content's dimensions and structure. Check `isPending`/`isLoading` first, then errors, then settled empty/not-found. Never infer "not found" or an empty collection from `undefined` before the request settles. With several requests, keep the skeleton until all settle. No spinner-only or one-block placeholders when shaped skeletons fit.

## Inputs and forms

- Numeric inputs: `type="text"` with `inputMode` and explicit parsing (`parseFloat`/`parseInt` on change or blur), kept as a string in local state until submit. Prefer `NumericField`/`MoneyField`.
- Structured values (currency, percentage, date, phone, document) use a mask (`NumericFormat` from `react-number-format` for money/numeric, e.g. `prefix="R$ "`, `thousandSeparator="."`, `decimalSeparator=","`). Every input and textarea has a muted-color `placeholder` with a realistic example (`"R$ 10.000,00"`, `"Ex: Plano Starter"`).
- Autofill: inputs with a standard `autoComplete` token set it plus a stable semantic `name` (`cc-name`, `cc-number`, `cc-exp`, `cc-csc`, identity/contact/address tokens). Never disable autocomplete for fillable fields. When wrapping or masking an input, verify `name` and `autoComplete` reach the native `<input>`.
- Text inputs and textareas use `useDebouncedInput` from `@/hooks/use-debounced-input` (local state updates immediately, parent `onChange` debounced 300 ms): `const [local, setLocal] = useDebouncedInput(form.field, v => set("field", v));` then `value={local}` and `onChange={e => setLocal(e.currentTarget.value)}`. List rows with text inputs are extracted into a row component with its own state.
- Selects use `CustomSelect` from `@/components/ui/CustomSelect`; never wrap it in a `<label>`, use a `<div>` with the label text above.
- Checkboxes use `Checkbox` from `@/components/ui/Checkbox`.
- Required fields show `RequiredMark` from `@/components/ui/RequiredMark`, wrapped with the label text in one element (`<span>{label} <RequiredMark /></span>`) because `Label` is a grid.
- Create forms above a listing (multi-row create/associate form + listing below, e.g. `/admin/products`) collapse to the first row and its labels. Wrap later rows (and their `FormSectionHeading`) in a shared collapsible form section that expands on hover, `focus-within` or any populated input, with all populated values visible when expanded. The parent `<form>` carries `group` and uses `space-y-*`; the submit button stays in the always-visible footer. If no suitable primitive exists, implement it first.
- Portuguese pluralization (`pt-BR`): `_one` only for exactly `1`; `_other` for `0` and everything else.

## Buttons and actions

- One floating action control per page or modal (`FloatingActionMenu`): one action shows its own icon and runs directly; two or more show a hamburger menu with all actions. Never render floating buttons side by side. Preserve accessible labels, disabled states, keyboard navigation and focus.
- No borderless buttons: secondary actions use `variant: "outline"`; `ghost` only for icon-only toolbar buttons with a clear hover background.
- Clickable controls use `cursor-pointer`; disabled keep `disabled:cursor-not-allowed`. Includes custom-select triggers/options, toggling labels and selectable rows.
- Row action buttons beyond Cancel/Save get a `react-icons/lu` icon with the label. With roughly 5+ actions, render icon-only `size="icon"` buttons with `aria-label` and a `Tooltip` from `@/components/ui/Tooltip`.
- Permanent destructive actions (irreversible, e.g. deleting a product) use `ConfirmActionButton` from `@/components/ui/ConfirmActionButton`: first click opens an anchored tooltip with confirmation text and swaps the icon/text for an explicit confirm control, second click executes, confirmation expires after 3 s. Idle buttons keep their normal hover tooltip. Preserve button geometry (text-only stays text-only, icon-only stays icon-only). Reversible actions run on first click with a toast. Never use native `alert()`/`confirm()`.
- Every button with a side effect that neither navigates nor opens a form (restore defaults, copy, duplicate, clear cache) confirms with `showToast(message, kind)` from `@/stores` (`"info"` neutral, `"positive"`/`"negative"` for outcomes that can fail).
- Disclosure labels: `Expandir` when closed, `Minimizar` when open. Never "recolher".

## Layout and lists

- Scrollable regions use the shared `ScrollArea` (see `docs/engineering-rules.md` "Scrollbars"); CSS-only scrollbar styling does not satisfy this.
- Inline table editing preserves exact geometry: replace each displayed value one-for-one inside the same `<td>`; never merge cells, add `colSpan`, move values between columns or change padding. Size editors within the cell and offset editor padding so text keeps its exact baseline and horizontal position. Action groups stay in the existing action column.
- Modal listings separate viewing from editing: compact read-only rows with key data (thumbnail, name, short description, price/value, availability, drag handle when sortable) plus icon-only Edit/Delete with `aria-label` and `Tooltip`. Edit in a submodal when fields would crowd the listing. Edit modals have explicit `Salvar` and `Descartar`; discard restores the pre-open state and closes.
- Long modal sections are individually collapsible; collapsed shows title and one concise summary (a unit address summary is the full formatted address).
- Sortable lists use animated `dnd-kit` (`DndContext` + `SortableContext`); native HTML `draggable` is forbidden for sorting. `dnd-kit` is not installed yet: add it with the first sortable list. Requirements: dragged item follows the pointer at reduced opacity while siblings animate out of the way; a visible drag-handle icon is the only pointer activator (never a numeric order field); pointer and keyboard sensors; movement restricted to the list's vertical axis and bounds with shared modifiers; normalized `sortOrder` persisted on drag end; no horizontal scrolling or extra vertical scroll while dragging; an expanded group collapses while dragged and restores on drop. Kanban and file-drop targets are not sortable lists.

## Toasts

Use Sonner through `src/lib/toast.ts` and render with `src/components/ui/Sonner.tsx`. At most five active notifications globally (`MAX_TOASTS`); a new one permanently dismisses the oldest, no hidden queue. Group repeated errors and keep the latest recovery action; never resurrect dismissed notifications when an operation completes. Loading toasts are dismissible without cancelling the operation. Every toast dismisses left, right and toward the top edge. Toasts stay fixed at the top on desktop and mobile. The close button is desktop-only. Keep them compact, safe-area aware, clear of modal footer actions, and show actionable errors without raw request URLs or technical IDs.

## Auth guards

Inspect the HTTP result of auth/session requests before redirecting. Empty successful session or HTTP 401 = unauthenticated. 403 = forbidden; keep the project's authorization behavior. 429 = rate limited: keep the route and show retry feedback or backoff. Never treat failed, pending or rate-limited requests as a missing session. Apply this to every guard and session synchronization, using the real existing modules.

## Batching and URL state

- Repeatable independent list actions go through the shared batching infrastructure (`shared/batch-policy.ts`, `src/lib/api/ActionBatchQueue.ts`; details in `docs/engineering-rules.md` "Action batching"). Forms, authentication, uploads and response-dependent actions stay immediate. Never batch arbitrary URLs or forward per-operation credentials. Refresh related views and consolidate feedback once per batch. Cancel unsent work on session changes. Never auto-retry mutations after an uncertain transport result; refresh before an explicit retry.
- Persist only meaningful navigation and committed data-view choices (selected records, tabs, search, filters) via `use-url-view-state` (see `docs/engineering-rules.md` "URL view state"). Keep "load more" counters, expansion counts, cursors, infinite-scroll progress and loaded-window size local; never put them in URLs or durable storage. Restore a selected record directly without replaying how many items were loaded to reach it. Explicit pagination controls users choose as part of a data view are fine.
