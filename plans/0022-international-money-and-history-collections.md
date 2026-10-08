# International money and recoverable financial history

Approved 2026-10-07. Implementation stays local: prepare migrations, never apply them or push/deploy.

## Execution

- [ ] Monetary model and ISO precision: explicit native/original money, institution/card defaults, all monetary domains, legacy BRL preservation.
- [ ] Shared PostgreSQL collection/unit progress, transactional outbox, RabbitMQ workers, fenced leases, retries, recovery and global provider limits.
- [ ] Integrate ten-year CDI/Selic bootstrap/daily/repair coverage and atomic yield recalculation publication.
- [ ] Demand-driven 365-day currency histories, official CDN/Cloudflare fallback, partial weighted estimates and public visitor reads.
- [ ] Currency-aware account/card/debt/loan/recurrence/import/payment engines and native/consolidated reporting.
- [ ] Persisted optional currency preference, seven-day IP location cache, settings, inheritance and travel suggestion confirmation.
- [ ] Visitor/sync upgrades, UI/native formatting, collection progress, tests, scoped builds and offline migration validation.

Update this checklist and commit it with every completed step. Resume by reading this file.

## Accepted behavior

All monetary amounts have a currency; percentages and points do not. Points' monetary equivalents do. Native books never mix currencies. Accounts/cards display native money; reports convert to the effective preference. Defaults follow explicit choice, linked card/account/institution, then preference. Existing books with history, balance or commitments cannot change currency. Institution/preference changes only affect new defaults and reporting. Only national ISO 4217 currencies present in currency-api are selectable. ISO precision applies to rounding, inputs, installments and refunds, including JPY/KWD. Legacy values remain BRL; previous foreign source/conversions are preserved.

Transfers/payments preserve native amounts on both sides, with daily conversion suggested and actual amount editable. Debts aggregate per currency before consolidation; fixed splits identify their currency. Concrete card purchases retain purchase-date conversion. Future estimates never rewrite concrete bookings.

Preference is nullable and persisted per authenticated owner, locally for visitors. Null resolves IP country, explicit device region, then USD. Use a client IP-only adapter initially backed by https://ipapi.co/json/, without app credentials. Detect even with explicit preference; cache country/currency/time per device for seven days, refresh on expired launch/foreground, deduplicate, and never reset edited form fields. Country mapping uses CLDR intersected with supported catalog.

Homepage banner compares detected currency with explicit preference. Its button opens confirm/cancel modal; confirmation directly changes preference and refreshes reports. Dismissal is persisted per owner and country/preference/detected-currency combination, not reset on same-country cache refresh. Automatic preference follows detection directly.

## Collections

PostgreSQL collection and globally deduplicated work-unit records are authoritative. Track domain/series/window/key/state/attempts/next-attempt/lease/timestamps/error. Link requests to unique work; reuse overlapping requests and persisted coverage. Create requests/work/outbox atomically. Commit downloaded data, confirmed coverage, work completion and downstream commands atomically before ACK. Progress measures completed coverage, not stored row count, and never resets for a fixed request.

States: pending, running, completed, completed-with-gaps, failed. Units distinguish data success, confirmed no publication and failure. Lease 90 seconds, heartbeat 20 seconds, renew receipt too; owner/token fences prevent stale workers committing. Recovery resends only incomplete demand after expired leases/restarts. Backoff/jitter respects Retry-After; exhausted work remains visible and reaches DLQ. Retry only failed work. Currency history uses separate queue from point lookups, six globally concurrent downloads. Preserve production interest queue names/routing contracts. All Redis/broker resources use service namespace.

FX forecast window is 365 days preceding reference date; fetched only on forecast demand, both involved bases, full daily snapshots. Central provider tries jsDelivr then Cloudflare same date/endpoint on HTTP/timeout/invalid payload. Historical dates are exact; latest snapshots store returned publication date. Weighted forecast mean uses 2^(-ageDays/90), normalizes available dates and reports partial coverage. Coherent factors relative to report currency connect native forecasts. Current positions use latest published rate with date; historical flows/positions use event/position date. Missing FX never becomes zero or mixed-currency sums.

Interest window remains ten calendar years ending yesterday, stable annual intervals/current tail, rolling daily fetches and repairs. Reuse previously proven coverage events. Successful intervals without official publication count as coverage, never artificial zeros. Arithmetic daily CDI/Selic averages remain unavailable until full coverage. Changed rates and necessary yield recalculation outbox commands share transaction.

Public visitor requests use same backend queues, cache snapshots/results/progress in owner-scoped IndexedDB for offline use, never download hundreds of days in browser. FX partial estimate/progress does not block unrelated dashboard sections; interest shows progress until complete average. Reads do not initiate collection. Request operations return an ID immediately; windows/series are validated; retries are idempotent. Responses expose currency/method/window/coverage/state. Existing interest average fields remain compatible.

## Verification

Meaningful unit/integration coverage: crash before/after commit and ACK; outbox loss; redelivery; expired leases; concurrent workers; overlapping demand; retry/DLQ; recovery; monotonic coverage; no-publication days; existing interest proofs; idempotent recalculations; FX fallback/partial/complete weighting; ISO precision; transfers; splits; statements; loans; imports; sync/visitor; preference/location/cache/fallback/banner confirmation/mobile.

Use normal commit hooks for formatting/lint/types/backend unit coverage; scoped builds and offline migration integrity. Local user authors/commits; Codex co-author trailer. Existing uncommitted `packages/sql/migrations/app/refs/db.json` belongs to user and stays untouched.

## Completed milestones

- Shared currency provider now validates exact dates, uses official fallback, preserves Retry-After, and rounds converted values using ISO precision. Unit tests and commit hooks passed.
- Monetary schema and durable history tables generated; offline migration preserves native/source distinctions and imports proven interest coverage. Migration artifact checks passed; migration remains unapplied. Engine and application integration remain pending.
- Shared history lifecycle wired to dedicated FX queue and existing interest queue, public request/progress/retry/estimate endpoints, transactional interest recalc publication, token-bearing receipt renewal, recovery and owner-scoped visitor cache. Tests cover redelivery, fencing, Retry-After and terminal failure; full local integration verification remains pending.
- Optional preference endpoint, owner-scoped preference cache, IP-only seven-day detection with CLDR country mapping, settings selector and confirmed travel suggestion implemented. React review completed; device/cache precedence tests passed. Native/consolidated money application and browser verification still pending.
- Credit books and statement replay now use denomination-specific integer units and explicit bookingCurrency; native persistence identifies statement/installment/refund/charge currencies. JPY distribution and KWD refund/payment tests pass. Remaining controllers, splits, loan/recurrence/import paths and consolidation still need integration.

- Account creation now inherits institution/effective currency in authenticated and visitor flows. Native account groups separate totals by denomination; existing account currency changes are guarded against history/commitments. ISO input masks and remaining purchase-read precision integrated. Hook validation in progress.

- Account inheritance milestone passed normal hooks (types and backend unit coverage), committed locally. Interest dashboard now exposes persisted collection details/retry; partial current interest coverage supersedes stale ready averages, including offline cache.

- Currency history work reuses point snapshots populated after scheduling. Point conversions and history downloads now share the six-slot database provider limiter across replicas.

- Transactions now resolve native destination/card payment amounts separately, supporting explicit actual values and date-based suggestions. Authenticated and guest creation/edit paths retain metadata; balance/yield SQL and visitor balances apply actual credit values. Shared forms expose native actual amounts. ISO transfer/payment tests added; hook validation pending.

- Native transfer/payment integration passed hooks (types and backend coverage) and targeted ISO/balance tests. Forecast engine now keeps native account balances/yields and uses coherent consolidation factors for reserves, expenses, transfers and totals; missing FX raises unavailability instead of summing currencies. Dashboard adapters still need to supply coverage-aware factors.

- Public point-rate reads use shared server snapshot storage/provider slots; visitor point conversion now caches those responses per owner in IndexedDB. Transfer/payment forms show purchase-date suggestions without replacing manual fields and offer explicit copy action with feedback.

- Authenticated dashboard consolidation now separates event-date FX, actual latest publication dates and weighted forecast factors. Native books remain independent on missing conversion; absent aggregate reports are nullable and visible as unavailable. Currency-specific cache keys and denomination-first debt totals added. Targeted context/latest tests pass; guest/report integration and hook validation in progress.

- Dashboard visitante agora usa mesmas cotações exatas/atuais e estimativas enfileiradas, com indisponibilidade explícita e livros nativos preservados offline. Cache de relatórios separa moedas; gráficos/tooltips respeitam precisão ISO. Painel acompanha coletas pendentes e atualização de estado invalida relatórios. Hooks passaram; testes de contexto, visitante e tooltip passaram isoladamente. Query-cache passou com preload local de window. Builds de backend/frontend passaram. Demais domínios e verificação integrada continuam pendentes.

- Editor da instituição agora oferece moeda padrão, persistida por API/visitante e herdada por novos cadastros. Componentes privados extraídos; descartar/reabrir restaura valores persistidos. Hooks passaram.

- Motor compartilhado de parcelas de empréstimos usa unidades mínimas ISO e devolve moeda explícita. Principal remanescente vai à última parcela; SAC distribui restos inteiros. Testes JPY/KWD adicionados. Integração de criação/pagamentos e leitura de empréstimos ainda pendente.

- Criação de empréstimos identifica moeda efetiva/explícita e propaga moeda a parcelas. Editor usa seletor/máscara ISO; cartões, parcelas e totais de principal exibem denominações separadas. Pagamentos entre moedas e demais domínios ainda pendentes.

- Sincronização preserva moedas de empréstimos/parcelas em ambas as direções; registros legados ausentes mantêm BRL. Alteração de moeda de empréstimo existente e parcelas divergentes são rejeitadas. Hooks da criação/leitura passaram; testes de DTO e armazenamento de pagamentos passaram.

- Etapas desta continuação validadas por hooks normais e builds de backend/frontend. Suíte compartilhada: 116 testes passaram; contexto cambial/tooltips: 9; query-cache com preload de navegador: 5; DTO de parcelas/armazenamento: 4. Commits locais preparados. Próximas lacunas: valores efetivos de pagamentos de empréstimos, rateios/dívidas globais, recorrências/importações/Open Finance e verificação de falhas/concorrência das filas. Artefatos de migração externos a esta continuação continuam preservados e não aplicados.

- Pagamentos/antecipações de empréstimos preservam valor/moeda da parcela e débito efetivo/moeda da conta. Conversão diária sugere débito, escolha manual prevalece; lote distribui unidades ISO. API/visitante/sincronização mantêm metadados; saldos/rendimentos e relatórios incluem saída na data paga. Interface oferece submodal com sugestão e ajuste. Hooks passaram; testes de pagamentos, saldos/rendimentos e dashboard passaram. Antecipação valida parcela esperada para impedir troca após pagamento concorrente. Builds de backend/frontend passaram. Suíte financeira ampliada: 141 testes; dashboard/invalidação: 14; visitante/pagamentos: 6.

- Base de recorrências agora herda/persiste moeda e valida precisão ISO. Ocorrências concretas autenticadas/visitantes preservam principal original, valor convertido e moedas dos dois lados em transferências/pagamentos. Listagem usa denominação da recorrência. Seleção explícita, totais por moeda e conversões ponderadas das projeções ainda precisam integração. Hooks passaram; testes de KWD e transferência USD/JPY verificam precisão, data exata e ausência de reprecificação após ocorrência. Validação: 20 testes de recorrências/cache/armazenamento passaram; hooks e builds de backend/frontend passaram.

- Formulário de recorrências oferece moeda explícita, herança do vínculo enquanto vazio e máscara ISO. Escolha explícita permanece preservada ao trocar vínculo. Parser de submissão cobre JPY/KWD sem depender de símbolo BRL. Resumos mensais separam denominações; projeções estrangeiras ainda pendentes. Hooks normais passaram, 21 testes de recorrência/armazenamento/máscara passaram e build frontend passou.

- Projeções de recorrências agora convertem principal para livro nativo antes de parcelar/pagar, preservando valor/moeda original. Dashboard aplica fatores relativos à consolidação; visitante reutiliza snapshot de estimativas entre projeção e totais. Leituras de faturas solicitam históricos públicos pela fila, sem downloads em massa no navegador. Ausência de conversão não permite mistura de moedas. Testes USD/JPY e USD/KWD adicionados. Hooks e builds backend/frontend passaram; 120 testes financeiros e 19 testes de projeção/contexto passaram. Correção de tolerância numérica evita arredondamento incorreto no limiar de milésimos.

- Calculadores de rateio autenticado/visitante aceitam precisão ISO; leitura de rateios em livros locais e reembolsos preserva moeda nativa. Dívidas criadas por reembolso persistem denominação do cartão. Hooks passaram; 35 testes de rateio passaram. Integração dos demais eventos e interface de dívidas ainda pendente.

- Eventos derivados de compras/transações usam principal contabilizado e moeda do registro persistido. Regras de rateio gravam denominação e leitura usa mesma precisão. Conciliação rejeita moedas divergentes. Hooks passaram. Integração da listagem, eventos manuais e sincronização global ainda pendente.

- Sincronização de eventos manuais identifica moeda, valida unidades ISO, preserva denominação existente e confere moeda na comprovação de compensações legadas. Download inclui moeda; payloads antigos permanecem BRL.

- Validação desta continuação: hooks passaram em todos os commits; builds backend/frontend passaram. Suíte conjunta de histórico/câmbio/dashboard/dívidas/financeiro: 179 testes; rateios frontend/backend: 35; visitante/contexto/armazenamento: 6; contrato de sincronização: 1. Testes integrados com PostgreSQL/RabbitMQ descartáveis, listagens/formulários de dívidas e importações/Open Finance/recompensas continuam pendentes; implementação completa ainda não concluída.

- Interface de dívidas agora oferece moeda explícita e máscara ISO, preserva denominação na edição e mostra saldos/totais separados por moeda. API entrega moedas dos eventos e vetores de saldos; visitante reconstrói mesmos grupos. Editor compartilhado usa precisão ISO para divisão fixa e prévias. Hooks passaram.
- Cashback de compras e recorrências é convertido para moeda da conta de destino na data concreta; reembolsos usam valor contabilizado e unidades ISO. Edição preserva fator histórico, mudança de cartão aplica destino, moeda da conta de recompensa é protegida contra alterações com compromissos. Reversões SQL agora alimentam saldos, rendimentos e dashboard. Teste em PostgreSQL descartável local verificou JPY/KWD, conservação e exclusão de reembolsos removidos. Políticas institucionais e equivalências de pontos ainda precisam revisão global.
- Revisão final da interface distingue carregamento, erro com retomada e ausência de lançamentos, sem exibir totais vazios. Mensagem de excesso no rateio fixo usa precisão ISO, com regressão de 0,001 KWD. Validação: 44 testes direcionados passaram, mais regressão KWD; teste SQL de cashback passou novamente em PostgreSQL descartável local; builds backend/frontend passaram. Hooks normais validaram alterações. Não houve aplicação de migrações nem ações remotas. Verificação visual/mobile e demais lacunas globais acima permanecem pendentes.
- Importação autenticada identifica moeda dos livros, separa crédito/débito e pagamentos em moedas diferentes; materialização de faturas usa unidades ISO e snapshot de recompensa na conta de destino. Open Finance permite moeda suportada compatível com destino, sem gate exclusivo BRL. Testes KWD/JPY e hooks passaram. Revisão de metadados originais e modo visitante continuam em auditoria.
- Políticas institucionais persistem moeda própria, exibem seletor e limites ISO, aplicados somente a contas da mesma denominação. Equivalente monetário de pontos usa moeda da conta e valida precisão ISO. Regressões de denominação e KWD/JPY passaram; hooks passaram.

- Layout mobile agora inicializa preferência na raiz comum, inclusive em acesso direto. Playwright local verificou localização JPY, preferência BRL, cancelamento/confirmacao de viagem, persistência e formulário mobile JPY. Valores concretos de compras, parcelas, reembolsos e pagamentos exibem livro nativo; totais de contas/cartões e saldos diários separam moedas. Hooks e build backend passaram.

- Sugestões de pagamento identificam moeda da fatura e débito efetivo da conta, com ajuste manual e precisão ISO. Visitante preserva duas denominações e repetição idempotente; regressão KWD/JPY e hooks passaram. Revisão de importações passa moeda nativa a máscaras, rateios e prévias.

- Revisão estrangeira do Open Finance converte valores para livro nativo na data exata antes de criar itens. Aprovação preserva principal/moeda original do snapshot externo e fator contabilizado, sem reinterpretar moeda estrangeira como nativa. Validação integrada ainda pendente.

- Validação de políticas usa moeda explícita ou moeda institucional existente, antes de gravar alterações. Revisão de duplicatas/editor de transações importadas usa moeda do livro; falha de carregamento não aparece como saldo vazio. Hooks passaram.

- Janela móvel de juros reutiliza unidades sobrepostas em execução; progresso contabiliza apenas dias dentro da janela solicitada. PostgreSQL local verificou concorrência, rollback e fencing (3 testes). RabbitMQ descartável local verificou confirmação, reinício, deduplicação, retries e DLQ (1 teste). Filas de testes usam namespace próprio; serviços descartáveis foram encerrados.

- Auditoria final identificou rateios fixos estrangeiros e formulários de criação ainda incompletos. Conversão compartilhada distribui arredondamento cumulativo em unidades ISO; regras distinguem moeda explícita, e edição mantém valores fixos do livro. Criação de compra herda cartão/preferência sem sobrescrever escolha ou valor editado. Validação em andamento.
