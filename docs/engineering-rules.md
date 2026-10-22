# Zaimu-specific engineering rules

Read this file before implementation or review in Zaimu. These rules supplement [AGENTS.md](../AGENTS.md); product/domain rules remain in [business-rules.md](business-rules.md). Paths in backticks are relative to the repository root.

## Scrollbars

Every scrollable section must use the project's custom scrollbar through `ScrollArea`, including on mobile and touch devices, unless the user explicitly requests otherwise. Styling or hiding a native scrollbar with `scrollbar-themed` alone does not satisfy this rule. Keep layout and spacing on an inner content wrapper, constrain the scroll area with `min-h-0`, and enable `horizontalScrollbar` for horizontally scrollable sections.

Scrollbars must remain contained within their own scrollable div. Inset vertical and horizontal tracks and thumbs before every edge so they do not cross rounded corners or render outside the container. `ScrollArea` roots must clip overflow. On touch platforms, hide native scrollbar overlays when they cannot honor those bounds; use `ScrollArea` for a visible contained track.

## Modal scrolling

Opening or closing any modal must never change the current horizontal or vertical scroll position of the page, background lists, or parent modals, or shift their layout when locking scroll. Preserve positions through nested dialogs, autofocus, browser Back, Escape, overlay clicks, and button closes on desktop, mobile, and touch devices. Never scroll a background record into view as part of opening a modal. Apply fixes through the shared dialog and scroll-lock infrastructure so all modals follow this rule.

Every modal must use the shared `Dialog` components from `frontend/src/components/ui/Dialog.tsx`, including wrappers such as `ImportDialogContent`. Keep `DialogHeader` and `DialogFooter` visible and outside the scrollable region on desktop, mobile, and touch devices. Only the central content scrolls, through the shared `DialogBody`, which uses `ScrollArea`. Limit `DialogContent` to the visible viewport and clip its overflow; never scroll the entire modal or wrap its header/footer in a scroll area. Preserve form submission by keeping `DialogBody` and `DialogFooter` inside the same form when needed. Avoid duplicate vertical scroll containers inside `DialogBody`.

## Back navigation

Mobile system back buttons, back gestures, and browser Back must traverse every visited subpage and modal in order. Navigate to subpages through the router with history pushes, reserving replacement for redirects. Opening a modal must add a history step through the shared `Dialog`; Back closes only the topmost modal before navigating away from its page. Closing through buttons, Escape, or the overlay must consume that modal's history step without leaving dead entries. Nested modals must unwind one at a time. Preserve router history state and handle effect replay and unmounting without duplicate entries or accidental page navigation.

## Infinite scroll

Loading more items must never change the current scroll position. Keep the existing list, rows, and scroll container mounted with stable keys throughout pagination, including dependent requests and pagination errors. Never replace loaded content with a spinner, skeleton, or full-list error state when fetching another page. Show incremental loading and retry feedback after the existing items, append new items without shrinking existing content, and preserve dependent query data while pagination changes its range. Reserve full-list loading states for the initial load or an explicit filter change; never reset scroll as a side effect of pagination.

## Button groups

Align action buttons and action groups to the right, including wrapped rows on mobile. Use `ActionGroup` for standalone actions and groups; keep modal footer actions right-aligned through `DialogFooter`.

Prefer side-by-side buttons when actions are compact, including create and edit modal footers on mobile. Use a horizontal wrapping layout and stack only when the available width cannot fit the buttons; never force stacking solely because of a small-screen breakpoint.

Buttons in the same action group must share height, border radius, icon size, and spacing. Use the same `Button` size or shared sizing classes for every action, including dialog triggers; distinguish primary actions with `variant`.

## Dynamic listing selects

Selectors with exactly one available, enabled option must select it automatically, including after asynchronous loading or changes to dependent fields. Update the form value through the normal change flow so validation and submission receive the selection. Count the complete available option set, including special options, before search filtering; typing a search must never trigger automatic selection. Preserve an existing valid selection and never select disabled options.

Every `CustomSelect` whose options come from a user-managed listing (accounts, cards, institutions, statements, categories, or equivalent) must use `searchable`. Fixed, small option sets remain non-searchable.

Special select options (such as "Sem conta específica", "Todas as categorias", or "Criar automaticamente") must always appear at the top, before options from user-managed listings. Mark them with `special: true` in `CustomSelect` options. Preserve the order of multiple special options as supplied by the caller when `sortOptions={false}`.

Searching must never hide special action options (such as adding a new record, selecting none, using defaults, or selecting all). Always keep options marked `special: true` visible at the top regardless of the search term, including when no regular option matches. Apply search filtering only to regular listing options.

## Pending actions

Pending actions block only their own conflict scope. Never disable unrelated controls from a shared mutation `isPending`. In lists, track pending record IDs; disable sibling controls only when they mutate the same record or an overlapping batch. Navigation, collapse, other rows, and unrelated actions stay enabled.

## Typography

Use only normal hyphens (`-`) in all user-facing text, generated descriptions, documentation, and tests. Replace em dashes and en dashes with normal hyphens. Example: `Fatura Inter - Set/26`.

## Toasts em modais

Modais bloqueantes exibem progresso dentro do próprio modal, sem toast de carregamento. Toasts ficam reservados a resultados finais e ações em modais não bloqueantes, fechados enquanto a operação continua. Importações de extrato e fatura mantêm o modal aberto durante o processamento para seguir à revisão.

## Shared Redis and RabbitMQ isolation

Redis and RabbitMQ instances are shared between production and development. Every Redis key (including cache epochs, locks, fences, registries, and cleanup queues) and RabbitMQ exchange/queue (including retry and DLQ) must use the environment namespace from `backend/src/shared/infra/service-namespace.ts`. API and worker must use the same `SERVICE_NAMESPACE`: `zaimu` in production and `zaimu_dev` in development. Defaults follow `NODE_ENV`; only `production` uses `zaimu`. Keep routing keys and event payload contracts unchanged. Preserve legacy production queue names to retain pending messages; development queues must always be prefixed. Never connect development consumers to production queues or share cache keys across environments.

## Date selectors

Every date selector must use the project's custom components: `DateField` for single dates and `DateRangePicker` for date ranges, on desktop, mobile, and touch devices. Never use native date inputs (`date`, `datetime-local`, `month`, or `week`), `showPicker()`, or hidden native date inputs over custom triggers. Responsive behavior must preserve the custom calendar instead of switching to the browser or operating system picker.

## Input sizing and alignment

All single-line form controls must share `inputControlClassName` from `frontend/src/components/ui/input-styles.ts`: height, padding, border radius and typography. This includes text, money, time, date, select, store and tag controls. Related fields must align labels and controls through `FormFieldRow`, including wrapped labels. Keep grid children and triggers `min-w-0`, constrain controls to their column and truncate long values and placeholders. Never let intrinsic text width expand a modal. Textareas may grow vertically.

## Optional form fields

Never label form fields as "(opcional)", "(optional)", or add redundant optional-field notices. Fields without a required marker are implicitly optional. Mark required fields with `RequiredMark` instead.

## Database migration references

`packages/sql/migrations/app/refs/db.json` is versioned migration state. Whenever database work changes this file, always include it in the corresponding database commit alongside relevant migrations and snapshots. Verify that its hash points to a committed or staged snapshot. Preserve the recorded reference; do not advance it merely to match the newest snapshot. This rule does not authorize running migrations or other commands against remote/shared databases.

## Collapsed listings

When a listing is collapsed, tapping or clicking anywhere on its visible card must expand it, including its title, description, summary, and padding. Use the shared listing component and preserve keyboard activation and accessible expanded state. Once expanded, keep content controls independent and collapse through the explicit toggle only.

## Required form validation

Every form must validate all required fields before saving, including custom selects and conditionally required fields. Required markers alone are not validation. Reject empty or whitespace-only values, non-finite or out-of-range numbers, and invalid field combinations. Keep the form open with an accessible, actionable validation message and preserve entered values; never start a mutation or close the modal for invalid input. Validate submitted native input values to avoid stale debounced state, and enforce equivalent rules at the persistence boundary for connected and guest modes.


## Invoice importer date synchronization

Every invoice importer must synchronize source closing and due dates through the shared finance calendar helper when applying imports, including PDF providers, Open Finance and imports with no new purchases. Correct the existing cycle and preserve its ID, payments and financial links; update explicit installment calendars for that cycle. Never overwrite nominal card days from a single invoice. Keep this invariant in shared import infrastructure and cover date corrections with tests. Invoice review descriptions show only the imported filename.
