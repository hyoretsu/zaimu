# Carteira multi-ativo (fiat + cripto) com cotações automáticas

## Context

Hoje `FinancialAccount` tem uma única `currency` (`contract.prisma:568`) e um `balance` em cache (`:576`). Todo o cálculo de saldo (SQL, motor de rendimento, espelho do modo visitante, dashboard) assume um número por conta numa moeda. Isso impede uma "carteira" como a Wise (EUR, USD e BRL na mesma conta) ou uma carteira cripto (BTC, ETH, USDC...).

Objetivo: a conta vira um contêiner com **um saldo por ativo**. Decisões já tomadas com o usuário:

- Cripto é registrada **manualmente** (sem sincronização on-chain).
- **Troca direta**: sem período de dupla escrita; uma migração leva os dados e o código passa a usar só o modelo novo.
- **Cotações coletadas automaticamente**, nos moldes das taxas de câmbio (`CurrencyRateSnapshot`), usando a brapi.dev (https://brapi.dev) para B3 e cripto.
- Foco desta entrega: carteira fiat + cripto. Ações e renda fixa ficam como fases posteriores, só esboçadas aqui.

Não há hoje modelo de "investimento" separado: investimentos são `FinancialAccount` com `type = INVESTMENT|SAVINGS`, com colunas `yield*` na própria conta.

## Decisões de modelo

- **`Asset`** (catálogo global): `code` (chave natural, ex.: `BRL`, `BTC`, `USDC`), `kind` (`FIAT | CRYPTO`; depois `EQUITY | ETF | REIT`), `name`, `decimals`, `quoteProvider`. Fiat usa o código ISO 4217.
- **`FinancialAccountAsset`**: `(financialAccountId, assetCode)` único, `balance Numeric(38,18)` em cache. Substitui `FinancialAccount.currency` e `.balance`. Uma conta pode ter vários.
- **Transações**: manter `currency`/`destinationCurrency` como o código do ativo, alargando para `VarChar(12)`. Não vira FK para evitar tocar em ~15 modelos. **Verificado em `monetary-balances-sql.ts`**: hoje cada lado soma um único número no saldo de `account.currency` (origem: `-amount`; destino: `COALESCE(destinationAmount, amount)`), sem identificar o ativo. Para multi-ativo, a origem debita `Transaction.currency` (ou `paymentCurrency`, se definido) e o destino credita `COALESCE(destinationCurrency, currency)`; o agrupamento do saldo passa a ser por `(accountId, assetCode)`. Isso muda também as consultas de `LoanPayment`, `FinancialAccountYield`, cashback e `DetachedRewardCredit`, que são fiat na moeda da conta.
- **`BalanceAdjustment`** e **`FinancialAccountYield`** ganham `assetCode`. Rendimento continua só para fiat.
- **Valores de transação em cripto**: `Transaction.amount`, `originalAmount`, `destinationAmount`, `paymentAmount` e `exchangeRate` passam a `Numeric(38,18)` (hoje `(20,6)`), senão 0,00001234 BTC ou 18 casas de ETH seriam truncados. Valores trafegam como string decimal na API e no JSON de taxas; `number` só para exibição de fiat.
- **Taxas de rede (gas)**: cada item de `Transaction.fees` ganha `assetCode` (default = moeda da transação). Gas de um swap USDC pago em ETH é uma taxa em `ETH` debitada da conta de origem, separada do valor movimentado. "Valor de chegada" = `destinationAmount` em `destinationCurrency`, já líquido de taxas descontadas do ativo recebido.
- **Códigos de ativo**: `normalizeCurrency` (`packages/finance/src/money.ts`) deixa de exigir `/^[A-Z]{3}$/`; passa a `/^[A-Z0-9]{2,12}$/`. `currencyDigits` consulta `Asset.decimals` para cripto e `Intl` só para fiat.
- **Exibição**: um único formatador de ativo em `packages/finance` (fiat via `Intl` currency; cripto como número com `decimals` do ativo + código, ex.: `0,00012345 BTC`). Substituir os `Intl.NumberFormat(... style: "currency")` e `createCurrencyFormatter` espalhados, inclusive `FinancialFeeRow`, que fixa `pt-BR`. Taxas e valor de chegada exibidos em seu próprio ativo, com equivalente na moeda preferida.
- **Fora de escopo agora**: cartões de crédito, empréstimos, orçamentos e planejamentos continuam em moeda fiat `VarChar(3)`. Um cartão exige que a conta vinculada tenha saldo fiat na moeda do cartão.
- **Precisão**: `Numeric(38,18)` nos saldos por ativo; arredondamento para exibição pelas `decimals` do `Asset`. Seguir o precedente de `20261008T0034_international_money_history`.

## Fases

### 1. Docs e regras

- `docs/business-rules.md`: nova seção de carteira (conta com vários ativos, saldo por ativo, não somar ativos sem conversão, total derivado na moeda preferida). Ajustar a seção "Moedas e taxas" (linha ~213) e "Ajustes de saldo".
- `docs/engineering-rules.md`: registrar `Asset`, provedor de cotações, variável `BRAPI_TOKEN`.

### 2. Schema e migração (`packages/sql`)

- Editar `src/prisma/contract.prisma`: `Asset`, `FinancialAccountAsset`, `AssetQuoteSnapshot`, remover `FinancialAccount.currency/balance`, adicionar `assetCode` em `BalanceAdjustment` e `FinancialAccountYield`, alargar colunas de moeda de `Transaction`.
- Migração em `migrations/app/<timestamp>_multi_asset_wallet/`, seguindo `20261007T2143_multi_currency`: semear `Asset` fiat a partir das moedas em uso, criar uma `FinancialAccountAsset` por conta com a antiga `currency`/`balance`, preencher `assetCode`, só então remover as colunas. Declarar `providedInvariants`.
- Commitar `refs/db.json` e os snapshots junto. Não rodar contra banco remoto.
- Teste de migração no estilo de `international-money-precision.test.ts`, com fixture de contas antigas.

### 2b. Precisão e formatação (`packages/finance`, `frontend`)

- Aceitar códigos de 2 a 12 caracteres; aritmética decimal exata (string/BigInt) para cripto.
- Formatador único de ativo; migrar todos os usos de `Intl.NumberFormat`/`createCurrencyFormatter`.
- DTOs de taxa com `assetCode`; UI de taxas e valor de chegada em `OriginalMoneyDetails`/`FinancialFeeRow`.

### 3. Cotações automáticas (nos moldes de taxas)

- `AssetQuoteSnapshot`: `(date, assetCode, quoteCurrency)` como chave, `price Numeric(38,18)`, `sourceTime` (horário da cotação na origem), `fetchedAt`.
- Provedor em `packages/finance` espelhando `@zaimu/finance/currency-provider`: interface + implementação brapi (`/api/v2/crypto`; `/api/v2/stocks/quote` na fase de ações). Token via `Authorization: Bearer`, lido de `BRAPI_TOKEN`.
- Serviço em `backend/src/modules/currencies/application/`, espelhando `createCurrencyExchangeService`: lê o snapshot, busca se faltar, grava; sem substituição silenciosa por cotação atual (regra já existente).
- Coleta agendada no worker (deploy já sobe backend e worker) só dos ativos que alguém possui, em lote. Limite gratuito: 15 mil requisições/mês; a brapi não documenta o atraso, por isso a interface mostra `sourceTime`.
- Conversão para a moeda preferida: cripto → fiat pela cotação, fiat → fiat pelo `CurrencyRateSnapshot`. Estender `dashboard-currency-context.ts`.

### 4. Backend

- `monetary-balances-sql.ts`: CTEs passam a chavear por `(accountId, assetCode)` em vez de só `accountId` (`owned_accounts`, `movements`, `running`); `get-financial-account-balances.ts` e `get-monetary-balances-at-dates.ts` retornam saldos por ativo.
- `AccountsController.ts`: DTO troca `currency`/`balance` por `balances: [{ assetCode, amount }]`; `POST /` e `PATCH /:id` deixam de ter a trava de troca de moeda (`:765-770`) e ganham operações de adicionar/remover ativo (só remove com saldo zero e sem histórico).
- `BalanceAdjustmentsController`, rendimentos e `ensureAccountCoverage` passam a receber o ativo.
- Regenerar o SDK pela skill `backend-endpoint-sdk`; nunca editar arquivos gerados.
- Novos membros de enum (`Asset.kind`) com chave de tradução em todos os locales.

### 5. Frontend e modo visitante

- `AccountsPage.tsx`, `FinancialInstitutionGroup.tsx`, `FinancialAccountCard.tsx`: exibir lista de saldos por ativo e total convertido; `CreateFinancialAccountDialog.tsx` escolhe os ativos; `BalanceAdjustmentsDialog` pede o ativo.
- `lib/localStorage.ts`: subir `DB_VERSION` de 17 para 18, com upgrade que converte as contas locais; `lib/financial-account.ts` (espelho do motor) e `lib/dataService.ts` usam saldos por ativo, com a lógica compartilhada em `packages/finance`. Cache de cotações em IndexedDB, como já é feito com as taxas.
- i18n: chaves em todos os locales, ordem alfabética.
- Rotas: a skill `tanstack-route-files` só se houver arquivo novo em `routes/`.

### 6. Fases posteriores (esboço, fora do foco)

- **Ações/ETFs/FIIs**: novos `kind`, saldo é quantidade, cotação via brapi `/api/v2/stocks/quote`, preço médio/lotes, proventos (`/dividends`), eventos corporativos.
- **Renda fixa**: entidade própria `FixedIncomePosition` (principal, vencimento, indexador, taxa, IR/IOF), semeada das colunas `yield*` hoje na conta; CDI/Selic/IPCA possivelmente via brapi `/api/v2/macro`, hoje `ReferenceRate`.

## Riscos

- Mudança transversal: todos os caminhos de saldo (SQL, domínio de rendimento, dashboard, espelho do visitante) mudam juntos, sem dupla escrita.
- Cache de lista de contas (`distributedCache.remember(userId, "accounts:list")`) precisa ser invalidado/versionado.
- Dependência do plano gratuito da brapi (cota e atraso não documentado).

## Verificação

- Teste de migração com fixture antiga: saldos, ajustes e rendimentos preservados.
- Testes de `get-financial-account-balances` e `monetary-balances-sql` com conta de dois ativos, transferência com conversão e ajuste de saldo por ativo.
- Teste do serviço de cotações com provedor falso: snapshot reutilizado, falha sem substituição silenciosa, lote único.
- Suíte do runner descartável (`scripts/test-runner.ts`); type-check e build dos pacotes afetados antes do merge.
- Validação visual pela skill `ui-screenshot-validation` (desktop e mobile), nos modos conectado e visitante.

## Progresso

Escopo ampliado pelo usuário em 2026-11-05: integrar `feat/asset-balances`, `feat/asset-quote-provider` e `feat/crypto-cashback`; copiar e concluir o trabalho não commitado de `asset-balances` no worktree persistente `crypto-cashback-integration`, sem modificar o worktree de origem. Integração local somente, sem push ou migrações compartilhadas.

- Catálogo/provedor puro de cotações integrado ao índice; merge ainda não commitado.
- Trabalho de schema, saldos e testes copiado do worktree original; adaptação ao baseline nativo atual e consumidores em andamento.

- Precisão: leitura SQL decimal exata adicionada, com testes de roundtrip transacional e rollback. Os demais consumidores ainda estão em adaptação; isso não conclui a fase 2.
- Schema e saldos por ativo em andamento. Runner SQL integration descartável aprovado em 2026-11-01: 31 testes, incluindo 5 cenários novos de cutover, denominações históricas, 18 casas/gas, identidade das pernas e rollback. Corrigidos postcheck pré-cutover e holdings dos ajustes/rendimentos históricos. Consumidores backend/API/visitante ainda incompletos; não integrar o schema isoladamente.
- Provedor puro brapi e valoração decimal por snapshots concluídos na branch `feat/asset-quote-provider` (commits `d944c22e`, `bedabb9e`), com 76 testes aprovados. Persistência `AssetQuoteSnapshot`, coleta e integração com a aplicação ainda pendentes.
- Correção da premissa do ledger após leitura do controller: `amount` usa `bookingCurrency`; `originalAmount` usa `currency`; `paymentAmount`/`paymentCurrency` são o lado do cartão, e não o débito da conta. Preservar esses pares em dados legados e novos. Testes de moedas distintas pendentes.
- Em 2026-11-05, schema/backfill adaptados ao head nativo `5c0c1d...` e sucessor `20261105T1246_multi_asset_wallet_final`; histórico versionado anterior preservado. Contratos e SDK regenerados oficialmente. Type-check e build dos pacotes backend/frontend/sql/finance aprovados na integração.
- Runner SQL integration descartável aprovado: leitura exata de 38/18 casas por projeção com alias e transação, rollback, cutover, gas, checkpoints por ativo, capitalização mensal/anual de cashback e reversões cumulativas de cinco wei. Regressões de visitante aprovadas: 16 testes de moeda/projeção e 35 de saldo/empréstimos; projeção separa BRL 100 de cripto equivalente a BRL 500 e rende apenas sobre BRL 100.
- Validação restante em andamento: suítes backend completas, teste de sucessores SQL oficiais, screenshots de carteira mista e fluxos móveis, hooks e integração local das ancestralidades. Não considerar entrega concluída antes desses gates.
