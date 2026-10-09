# Scrollbars

Every scrollable section must use the project's custom scrollbar through `ScrollArea`, including on mobile and touch devices, unless the user explicitly requests otherwise. Styling or hiding a native scrollbar with `scrollbar-themed` alone does not satisfy this rule. Keep layout and spacing on an inner content wrapper, constrain the scroll area with `min-h-0`, and enable `horizontalScrollbar` for horizontally scrollable sections.

Scrollbars must remain contained within their own scrollable div. Inset vertical and horizontal tracks and thumbs before every edge so they do not cross rounded corners or render outside the container. `ScrollArea` roots must clip overflow. On touch platforms, hide native scrollbar overlays when they cannot honor those bounds; use `ScrollArea` for a visible contained track.

# Infinite scroll

Loading more items must never change the current scroll position. Keep the existing list, rows, and scroll container mounted with stable keys throughout pagination, including dependent requests and pagination errors. Never replace loaded content with a spinner, skeleton, or full-list error state when fetching another page. Show incremental loading and retry feedback after the existing items, append new items without shrinking existing content, and preserve dependent query data while pagination changes its range. Reserve full-list loading states for the initial load or an explicit filter change; never reset scroll as a side effect of pagination.

# Button groups

Align action buttons and action groups to the right, including wrapped rows on mobile. Use `ActionGroup` for standalone actions and groups; keep modal footer actions right-aligned through `DialogFooter`.

Prefer side-by-side buttons when actions are compact, including create and edit modal footers on mobile. Use a horizontal wrapping layout and stack only when the available width cannot fit the buttons; never force stacking solely because of a small-screen breakpoint.

Buttons in the same action group must share height, border radius, icon size, and spacing. Use the same `Button` size or shared sizing classes for every action, including dialog triggers; distinguish primary actions with `variant`.

# Dynamic listing selects

Every `CustomSelect` whose options come from a user-managed listing (accounts, cards, institutions, statements, categories, or equivalent) must use `searchable`. Fixed, small option sets remain non-searchable.

Special select options (such as "Sem conta específica", "Todas as categorias", or "Criar automaticamente") must always appear at the top, before options from user-managed listings. Mark them with `special: true` in `CustomSelect` options. Preserve the order of multiple special options as supplied by the caller when `sortOptions={false}`.

# Pending actions

Pending actions block only their own conflict scope. Never disable unrelated controls from a shared mutation `isPending`. In lists, track pending record IDs; disable sibling controls only when they mutate the same record or an overlapping batch. Navigation, collapse, other rows, and unrelated actions stay enabled.

# Typography

Use only normal hyphens (`-`) in all user-facing text, generated descriptions, documentation, and tests. Replace em dashes and en dashes with normal hyphens. Example: `Fatura Inter - Set/26`.

# Toasts em modais

Modais bloqueantes exibem progresso dentro do próprio modal, sem toast de carregamento. Toasts ficam reservados a resultados finais e ações em modais não bloqueantes, fechados enquanto a operação continua. Importações de extrato e fatura mantêm o modal aberto durante o processamento para seguir à revisão.

# Shared Redis and RabbitMQ isolation

Redis and RabbitMQ instances are shared between production and development. Every Redis key (including cache epochs, locks, fences, registries, and cleanup queues) and RabbitMQ exchange/queue (including retry and DLQ) must use the environment namespace from `backend/src/shared/infra/service-namespace.ts`. API and worker must use the same `SERVICE_NAMESPACE`: `zaimu` in production and `zaimu_dev` in development. Defaults follow `NODE_ENV`; only `production` uses `zaimu`. Keep routing keys and event payload contracts unchanged. Preserve legacy production queue names to retain pending messages; development queues must always be prefixed. Never connect development consumers to production queues or share cache keys across environments.

# Date selectors

Every date selector must use the project's custom components: `DateField` for single dates and `DateRangePicker` for date ranges, on desktop, mobile, and touch devices. Never use native date inputs (`date`, `datetime-local`, `month`, or `week`), `showPicker()`, or hidden native date inputs over custom triggers. Responsive behavior must preserve the custom calendar instead of switching to the browser or operating system picker.
