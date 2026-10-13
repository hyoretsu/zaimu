# Cobertura por cenários

Fonte de resultados: [regras de negócio](business-rules.md). Inventário funcional do [plano 0019](../plans/0019-test-suites-and-coverage.md), separado do aceite de performance do [0018](../plans/0018-whole-application-performance.md). Datas abaixo são datas de calendário; dinheiro é comparado em centavos. Arquivo existente não significa cenário executado nem área encerrada.

Status: **executado** tem resultado local identificado; **implementado** tem assertion no arquivo, sem execução comprovada nesta etapa; **legado** identifica proteção fora das novas suítes; **lacuna** exige proteção adicional. Responsável lógico é o domínio que define a regra, mesmo quando outro pacote a consome. Testes isolados legados continuam preservados e não contam como entrega do 0019.

## Regressões de previsão

Todos os casos desta tabela usam `frontend/src/lib/tests/dashboard-projection.integration.test.ts`, IndexedDB descartável, serviços visitantes reais e motor compartilhado. Somente fetch de taxas é substituído por resposta explícita local; nenhum resultado financeiro final é mockado. Relógio fixado em 12/10/2026 antes dos imports. Os oito testes passaram em processos separados com `TZ=UTC`, `TZ=America/Recife` e `TZ=America/New_York` (23 assertions por processo, Bun local 1.4.3). Nenhuma chamada externa sai do processo.

| ID | Risco e regra | Pré-condição e ação | Esperado independente | Camada e status | Lacuna restante |
|---|---|---|---|---|---|
| PREV-001 | P0, saldo inicial futuro | Conta 1.000; outubro +200/-50; novembro -30; selecionar novembro | Inicial 1.150; final 1.120; fluxo novembro 0/-30 | IndexedDB, executado | SQL/HTTP e paridade conectado |
| PREV-002 | P0, fim inclusivo | Novembro -10 em 30/11 23:59:59; dezembro -900 | Novembro -10, saldo 990; dezembro excluído | IndexedDB, executado em UTC/Recife/New York | Contrato HTTP e interação do seletor até DTO |
| PREV-003 | P0, composição proporcional | Fatura 100 assinatura +100 compra; pagamento antecipado 50 | Pagamento recorrente 25; restante 150 com 75 recorrentes; total saídas 200 | Livro real/IndexedDB, executado | Pagamento CARD_PAYMENT histórico; SQL/HTTP |
| PREV-004 | P0, parcelas futuras reais | Parcela paga; parcela hoje; futuras 61,23 e 48,77 | Futuras somam 110; sem parcela de hoje/paga; saldo 890 | IndexedDB, executado | Lista/dashboard HTTP e UI com mesma fixture |
| PREV-005 | P0, identidade antecipada | Ocorrência 15/10 antecipada 12/10 com marker; REFUND futuro | Nenhuma nova saída; saldo 900; transações/marker inalterados | IndexedDB, executado | SQL e rollback integrado |
| PREV-006 | P0, cashback/pontos | Compras 200; cashback 10 em conta separada; pontos 10.000 +500 | Conta 800; cashback 10; patrimônio 810; pontos excluídos | IndexedDB, executado | HTTP e paridade conectado |
| PREV-007 | P0, subtotais não aditivos | Conta 4.681,01; renda fixa 3.284,26; entrada 2.100; saída comum 69,90; cartão 614,46 recorrentes +1.108,68 outras | Conta 4.987,97; patrimônio 8.272,23; net 306,96; saídas 1.793,04; cartão subtotal 1.723,14 | Livro real/IndexedDB, executado | SQL/HTTP e barras com fixture integrada |

Prova de proteção: antes da correção do consumidor, PREV-003 retornou saídas 400 em vez de 200 e PREV-007 retornou conta 3.264,83 em vez de 4.987,97. O serviço visitante incluía compras da listagem de transações e também pagamentos de fatura. Após filtrar a fonte `CREDIT_CARD` do fluxo monetário, ambos passam. As assertions por segmento continuam necessárias: somente saldo total não prova composição.

## Inventário de domínios

Caminhos abaixo são relativos à raiz. Arquivos `*.test.ts` isolados são referências legadas, sem reclassificação por nome. Suites SQL/HTTP/IndexedDB exercitam persistência real. Lacunas nomeadas impedem declarar cobertura integral.

| ID / responsável | Risco e regra | Proteção e arquivo | Status / bordas restantes |
|---|---|---|---|
| AUTH / auth | P0, identidade e autorização | `backend/tests/financial-contracts.integration.test.ts`; `frontend/src/stores/auth.test.ts` (legado) | Implementado HTTP; lacuna logout/exclusão durante requisição, email local e rota 429 |
| ACC / accounts e instituições | P0, propriedade/padrões/saldo | `backend/tests/financial-contracts.integration.test.ts`; `backend/src/modules/accounts/tests/universal-institutions.integration.test.ts`; `frontend/src/lib/tests/payment-suggestions-storage.test.ts` | Implementado; lacuna exclusão com vínculos e todos os tipos de conta em totais |
| YIELD / accounts | P0, ajuste/rendimento | `frontend/src/lib/financial-account.test.ts` e `backend/src/modules/accounts/application/recalculate-historical-account-yields.test.ts` (legados) | Lacuna integração ajuste fixado após edição retroativa, override manual e impostos/faixas |
| RATES / reference-rates | P0, janela/histórico | `backend/src/modules/reference-rates/tests/reference-rate-repair.test.ts`; `reference-rate-averages.test.ts` na mesma pasta | Implementado; confirmar integração com persistência/BCB double e retomada sem duplicação |
| TX / transactions | P0, saldo e paginação | `backend/tests/financial-contracts.integration.test.ts`; `frontend/src/lib/guest-transaction-page.test.ts` (legado) | Implementado CRUD; lacuna paginação integrada com datas iguais e rollback |
| IMPORT / transaction-imports | P0, aprovação/identidade | `backend/src/modules/transaction-imports/domain/statement-identity.test.ts` e `transfer-suggestions.test.ts` (legados) | Lacuna fluxo lote pendente -> aprovação parcial -> reimportação -> descarte com saldo observado |
| CARD / creditCards | P0, centavos/faturas/estornos | `backend/tests/refund-review.integration.test.ts`; `frontend/src/lib/tests/card-payments-storage.test.ts`; PREV-003/007 | Implementado; lacuna ciclo integrado recorrência/rateio/reembolso e rollback |
| CARD-IMPORT / credit-card-imports | P0, raiz/centavos importados | `frontend/src/lib/tests/institution-installment-remainder.test.ts`; `backend/src/modules/credit-card-imports/domain/anticipated-installments.test.ts` (legado) | Implementado armazenamento; lacuna aprovação/retomada/ambiguidade com HTTP real |
| REC / recurring | P0, agenda/identidade | `frontend/src/lib/tests/recurrence-storage.test.ts`; `backend/src/modules/recurring/tests/materialization.test.ts`; PREV-005 | Implementado; lacuna calendário dia 31/29-02 por consumidor persistente e atomicidade dívida/cursor |
| LEGACY / salaries e subscriptions | P1, migração sem endpoints antigos | `packages/sql/tests/remove-recurrence-legacy.test.ts`; `frontend/src/lib/upgrades/migrate-recurrences.test.ts` | Implementado migração; lacuna navegação de redirect legado e payload inválido |
| DEBT / debts | P0, conservação/privacidade | `backend/tests/debt-ledger.integration.test.ts`; `backend/tests/debt-sync.integration.test.ts`; `frontend/src/lib/tests/debt-events-storage.test.ts` | Implementado; lacuna centavo restante via HTTP para todos os métodos e raiz parcelada |
| LOAN / loans | P0, parcelas/antecipação | `frontend/src/lib/tests/loan-payments-storage.test.ts`; `backend/tests/financial-contracts.integration.test.ts`; PREV-004 | Implementado; lacuna cronograma após antecipação e paridade conectado/visitante |
| DASH / dashboard | P0, composição/saldo/calendário | PREV-001 a PREV-007; `frontend/src/routes/components/DashboardComparisonChart/components/DashboardChartTooltip.test.tsx` | IndexedDB executado; lacuna SQL/HTTP independente e apresentação ligada à mesma fixture |
| CAT / categories | P1, propriedade/vínculos | `backend/tests/financial-contracts.integration.test.ts`; `backend/src/modules/categories/application/category-lookup.test.ts` (legado) | Implementado CRUD; lacuna concorrência unicidade, edição de vínculos e seletor real |
| STORE / stores | P1, normalização e isolamento | `backend/tests/financial-contracts.integration.test.ts`; `backend/src/modules/stores/domain/normalize-store-name.test.ts` (legado) | Implementado CRUD; lacuna paginação/busca e edição preservando saldo |
| OF / open-finance | P0, revisão/idempotência | `backend/src/modules/open-finance/tests/open-finance.integration.test.ts`; `frontend/tests/browser/open-finance.spec.ts` | Implementado; lacuna pausa durante execução e conflito edição local com mesmo esperado financeiro |
| SYNC / sync e serviços locais | P0, identidade/retomada | `frontend/src/lib/tests/snapshot-storage.test.ts`; `monthly-budget-storage.test.ts` na mesma pasta; `backend/tests/debt-sync.integration.test.ts` | Implementado; lacuna duas sessões, resposta fora de ordem, logout durante escrita |
| UPG / upgrades e packages/sql | P0, preservação/constraints | `packages/sql/tests/application-upgrade-audit.test.ts`; `packages/sql/tests/migrations.e2e.test.ts`; `frontend/src/lib/upgrades/local-upgrade.test.ts` | Implementado SQL, legado local; lacuna matriz completa inválidos/IDs colisão e falha com originais preservados |
| FIN / packages/finance | P0, conservação via consumidores | PREV-001 a PREV-007 e integrações financeiras acima | IndexedDB executado; lacuna combinações determinísticas multi-câmbio, calendários, reservas e reembolsos por HTTP |
| INFRA / shared e worker | P0, isolamento/at-least-once | `backend/src/shared/infra/broker/tests/RabbitMqBroker.integration.test.ts`; `backend/src/modules/financial-history/tests/history-leases.integration.test.ts`; caches/outbox `*.test.ts` legados | Implementado; lacuna crash entre publicação/ack e invalidação concorrente com cache real |
| BUDGET / monthly-budgets | P0, reservas sem dupla contagem | `frontend/src/lib/tests/monthly-budget-storage.test.ts`; `packages/finance/src/monthly-budget.test.ts` (legado) | Implementado sync; lacuna consumidor HTTP/IndexedDB com múltiplas tags, meses encerrados e cartão vencido |
| FX / currencies | P0, taxas/moedas nativas | `packages/sql/tests/international-money-precision.test.ts`; `frontend/src/components/currency/OriginalMoneyDetails.test.tsx` | Implementado SQL/UI; lacuna histórico incompleto e resposta remota fora de ordem |
| HISTORY / financial-history | P0, cobertura e leases | `backend/src/modules/financial-history/tests/history-leases.integration.test.ts` | Implementado; lacuna coleta interrompida + retomada materializando valores exatos |
| TAX / taxes | P0, vigência e tributos | `backend/src/modules/taxes/admin-access.test.ts` (legado) | Lacuna autorização HTTP, vigências retroativas e resultado financeiro conhecido |
| CAL / yield-calendar | P0, feriado e fuso | `frontend/src/routes/components/YieldCalendarLifecycle.test.tsx`; `backend/src/modules/yield-calendar/calendar-source.test.ts` (legado) | Implementado UI; lacuna cobertura calendário ligada a rendimento persistido em fusos |
| UI / componentes, hooks, stores | P1, interação e acessibilidade | `frontend/src/components/tags/components/SelectedTags.test.tsx`; `frontend/src/routes/credit-cards/components/CreditPurchaseRow.test.tsx`; `frontend/src/routes/recurring/components/RecurringAdvanceAction.test.tsx` | Implementado; lacuna debounce/último valor/undo, descarte de edição e conflito restrito por registro |
| NAV / rotas, configuração e páginas públicas | P1, history/deep links/mobile | `frontend/tests/browser/overlay-dismissal.spec.ts`; `frontend/tests/performance/navigation.spec.ts` (0018); `frontend/src/lib/deep-links.test.ts` (legado) | Referência 0018 somente navegação; lacuna termos/privacidade, nested routes e modais em viewport móvel |

## Jornadas e referência ao 0018

| ID | Fixture e resultado requerido | Arquivo/evidência atual | Status |
|---|---|---|---|
| J-IMPORT | Aprovar parte de lote, repetir importação, editar data/valor; saldo apenas de itens aprovados | Proteções isoladas de importação acima | Lacuna jornada entre módulos |
| J-CARD | Recorrência -> rateio -> antecipação -> pagamento parcial -> reembolso; centavos/identidade conservados | PREV-003 e testes armazenamento cartão/dívida | Lacuna jornada inteira |
| J-LOAN | Pagar -> antecipar -> intervalo futuro, conectado/visitante | PREV-004 e `loan-payments-storage.test.ts` | Lacuna paridade integrada |
| J-YIELD | Taxa/feriado retroativo -> rendimento -> ajuste -> previsão sem gravar | Legados YIELD/RATES/CAL | Lacuna persistência integrada |
| J-RECOVERY | Falha transacional -> retry -> invalidação -> UI sem efeito parcial | SYNC/INFRA | Lacuna ponta a ponta |
| PERF-0018 | Startup, navegação, guest e recarga com métricas | `frontend/tests/performance/{guest,navigation,refresh,purchase}.spec.ts`; `plans/0018-whole-application-performance.md` | Referência existente; não executado neste inventário, sem aceite funcional inferido |

Novos módulos devem adicionar linha e cenário com esperado explícito. Fechar lacuna requer arquivo, execução e resultado observável na camada indicada. Shard ausente, fixture indisponível ou teste skipped não encerram cenário.

## Reprodução local

```sh
TZ=UTC bun test frontend/src/lib/tests/dashboard-projection.integration.test.ts
TZ=America/Recife bun test frontend/src/lib/tests/dashboard-projection.integration.test.ts
TZ=America/New_York bun test frontend/src/lib/tests/dashboard-projection.integration.test.ts
```

Regressão legada do comparativo também executada: `bun test frontend/src/lib/tests/dashboard-comparison.test.ts`, um teste e cinco assertions aprovados. Esse teste usa mocks finais de armazenamento e não substitui os oito cenários com IndexedDB.
