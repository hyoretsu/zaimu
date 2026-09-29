# Scrollbars

Every scrollable section must use the project's custom scrollbar through `ScrollArea`, including on mobile and touch devices, unless the user explicitly requests otherwise. Styling or hiding a native scrollbar with `scrollbar-themed` alone does not satisfy this rule. Keep layout and spacing on an inner content wrapper, constrain the scroll area with `min-h-0`, and enable `horizontalScrollbar` for horizontally scrollable sections.

Scrollbars must remain contained within their own scrollable div. Inset vertical and horizontal tracks and thumbs before every edge so they do not cross rounded corners or render outside the container. `ScrollArea` roots must clip overflow. On touch platforms, hide native scrollbar overlays when they cannot honor those bounds; use `ScrollArea` for a visible contained track.

# Dynamic listing selects

Every `CustomSelect` whose options come from a user-managed listing (accounts, cards, institutions, statements, categories, or equivalent) must use `searchable`. Fixed, small option sets remain non-searchable.

# Pending actions

Pending actions block only their own conflict scope. Never disable unrelated controls from a shared mutation `isPending`. In lists, track pending record IDs; disable sibling controls only when they mutate the same record or an overlapping batch. Navigation, collapse, other rows, and unrelated actions stay enabled.

# Typography

Use only normal hyphens (`-`) in all user-facing text, generated descriptions, documentation, and tests. Replace em dashes and en dashes with normal hyphens. Example: `Fatura Inter - Set/26`.

# Toasts em modais

Modais bloqueantes exibem progresso dentro do próprio modal, sem toast de carregamento. Toasts ficam reservados a resultados finais e ações em modais não bloqueantes, fechados enquanto a operação continua. Importações de extrato e fatura mantêm o modal aberto durante o processamento para seguir à revisão.
