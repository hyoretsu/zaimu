# Otimização ponta a ponta com RabbitMQ e cache distribuído

## Objetivo

Levar endpoints com cache frio a p95 inferior a 1 segundo e hits de cache a p95 inferior a 100 ms. Cada tela deve fazer no máximo três requests iniciais, sem requests ou queries proporcionais à quantidade de registros exibidos.

PostgreSQL permanece fonte de verdade e armazena somente o transactional outbox. RabbitMQ executa filas e jobs. Redis fornece cache distribuído com invalidação orientada a eventos. API e worker são processos separados.

## Decisões

- PostgreSQL nunca será usado como fila de processamento.
- RabbitMQ usará exchanges duráveis `zaimu.events` e `zaimu.commands`, quorum queues, retries e DLQs.
- Entrega será `at-least-once`; todos os consumidores serão idempotentes.
- O transactional outbox garantirá atomicidade entre mutações e publicação de eventos.
- Redis usará cache-aside, gerações por namespace, write fences, ETags e coalescing contra stampede.
- Cache não terá TTL de frescor: continuará válido até evento relevante avançar sua geração. Evicção poderá ocorrer apenas por proteção operacional.
- Redis indisponível causará bypass. Na reconexão, um novo epoch global impedirá uso de entradas anteriores.
- Não haverá cache L1 de dados de usuário.
- Listagens grandes usarão cursor opaco. Pesquisa continuará substring, sem acentos e sem diferença de caixa.
- Filtros, buscas, ordenação, agregação e paginação serão executados no banco sempre que possível. Exceções exigem filtro complexo demais para SQL ou evidência de que buscas concorrentes executadas diretamente no servidor são mais rápidas.
- DTOs de resumo, detalhe e mutação serão separados. Listagens retornarão somente campos necessários ao primeiro render.
- Trocas de contrato serão atômicas entre backend e frontend; contratos antigos não serão mantidos.
- `/sync` será exceção explícita por transferir snapshots necessários ao modo offline.
- Bundle, renderização React, imagens e startup Tauri/mobile ficam fora deste plano.
- Nenhuma migração remota, deploy, push ou mutação de serviço externo será executada sem solicitação específica.

## Contratos-alvo

- Coleções grandes recebem `cursor?`, `limit` e filtros; retornam `{ items, nextCursor, hasMore }`.
- Transações diárias retornam `{ days, nextCursor, hasMore }` com ordenação estável por data, criação, origem e ID.
- `GET /credit-card-imports` retorna somente `{ id, fileName, pendingItemCount }[]`.
- `GET /credit-card-imports/:id` retorna metadados usados pela revisão e itens paginados somente quando o modal abrir.
- Importações de transações seguem a mesma divisão entre resumo e detalhe.
- `GET /credit-cards` retorna cartões com resumo de limite e fatura atual. A tela não dispara uma consulta por cartão.
- `GET /transactions` retorna itens compactos; rateio completo e campos exclusivos de edição ficam no detalhe lazy.
- Assinaturas, recorrências e salários não carregam rateio completo nas listagens.
- Contas não carregam histórico de taxas na listagem.
- Dívidas retornam pessoas e saldos no resumo; eventos são paginados.
- Empréstimos retornam totais agregados sem pagamentos individuais.
- Frontend e IndexedDB guest implementam os mesmos DTOs e cursores.

## Arquitetura de eventos e jobs

- Envelope padrão: `eventId`, `eventType`, `aggregateType`, `aggregateId`, `userIds`, `occurredAt`, `schemaVersion` e correlação, sem valores financeiros desnecessários.
- Exchanges:
  - `zaimu.events` para eventos de domínio e invalidação.
  - `zaimu.commands` para comandos assíncronos.
- Filas principais:
  - `cache-invalidation`
  - `schedule-materialization`
  - `reference-rate-fetch`
  - `account-yield-recalculation`
  - retries com TTL/dead-letter e DLQ por consumidor
- Mutação e outbox serão gravados na mesma transação PostgreSQL.
- Publisher usará publisher confirms e marcará evento publicado somente após confirmação do RabbitMQ.
- API continuará aceitando mutações durante falha do broker; publicação retomará pelo outbox.
- Materialização de salários, assinaturas, recorrências e faturas sairá dos GETs.
- Scheduler publicará comandos de recuperação; constraints de ocorrência manterão idempotência.
- SLA de materialização: até dois minutos. Criação e edição de agenda enfileiram imediatamente.
- `ReferenceRateJob` será drenada e removida após migração integral para RabbitMQ.

## Cache distribuído

- Cada GET autenticado cacheável declara namespace e dependências. Auth, health, uploads/downloads e `/sync` ficam fora do middleware genérico.
- Chaves incluem versão do formato, epoch global, usuário, namespace, geração e hash de parâmetros canônicos. Tokens e cookies nunca entram na chave.
- Namespaces iniciais: `transactions:list`, `transactions:detail:{id}`, `credit-cards:overview`, `credit-cards:{id}:statements`, `dashboard`, `accounts:list`, `imports:pending` e `imports:detail:{id}`.
- Cache hit executa zero queries SQL. ETag permite `304` sem PostgreSQL.
- Gerações avançam atomicamente; nenhuma invalidação usa `SCAN`.
- Chaves antigas ficam inalcançáveis e serão removidas assincronamente com `UNLINK` usando registro por geração.
- Lock Redis curto e coalescing garantem um único recálculo por chave ausente.
- Write fence por namespace:
  1. Marcar namespaces como `dirty` antes da mutação.
  2. GET sob fence ignora cache e não repopula.
  3. Executar mutação e inserir outbox na mesma transação.
  4. Após commit, avançar gerações e remover fence atomicamente.
  5. Consumidor do outbox finaliza invalidação após crash.
  6. Rollback deixa o lease expirar e preserva a geração anterior.
- Matriz central de dependências cobrirá transações, contas, saldos, dashboard, sugestões, cartões, faturas, compras, dívidas, categorias, tags, agendas, rendimentos, empréstimos, importações e sync.
- Eventos compartilhados de dívida invalidarão todos os usuários afetados.
- Sync emitirá evento consolidado por usuário e domínio.

## Banco e consultas

- Aplicar filtros antes de buscar ou hidratar registros. Filtragem em memória será permitida somente quando a consulta no banco for complexa demais ou benchmarks demonstrarem melhor desempenho com buscas concorrentes executadas diretamente no servidor.
- Adicionar `userId NOT NULL` a `Transaction` e `CreditPurchase`, fazer backfill e atualizar todos os caminhos de escrita.
- Habilitar `pg_trgm` e `unaccent`; criar função imutável de normalização e GIN trigram para descrição, estabelecimento, categoria, tag, conta e instituição pesquisáveis.
- Índices iniciais:
  - `Transaction(userId, date DESC, createdAt DESC, id DESC)`
  - `Transaction(userId, originFinancialAccountId, date DESC, id)`
  - `Transaction(userId, destinationFinancialAccountId, date DESC, id)`
  - `CreditPurchase(userId, purchaseDate DESC, createdAt DESC, id DESC)`
  - `CreditPurchase(statementId, purchaseDate DESC, id)`
  - `LoanPayment(loanId, paidDate)`
  - `LoanPayment(loanId, installmentNumber)`
  - agendas por proprietário, estado e cursor de materialização
  - FKs de históricos consultados por entidade
- Validar todo índice com `EXPLAIN (ANALYZE, BUFFERS)` em fixture volumosa antes de mantê-lo.
- Transações usarão `UNION ALL` indexável entre movimentações e compras, com filtros e cursor no SQL. Buscar `limit + 1`; hidratar tags, referências e rateios em lote somente para a página.
- Saldos serão agregados set-based no SQL em vez de reproduzir todo histórico em JavaScript.
- Dashboard consultará apenas intervalo e agregados necessários.
- Remover N+1 de rateios, empréstimos, dívidas, cartões e importações com loaders em lote, `GROUP BY` e consultas por conjuntos de IDs.
- Endpoints agregadores usarão um único cliente do pool durante a leitura.
- Configurar timeouts de conexão/query/statement e limitar concorrência dos workers.

## Etapas

- [ ] 1. Fundação
  - [x] Adicionar Docker Compose local com Redis e RabbitMQ.
  - [x] Criar ports/adapters de cache, broker e outbox.
  - [x] Instrumentar duração de request, query count, tempo SQL, espera por conexão, cache e filas.
  - [x] Criar fixture com 100 mil lançamentos, 20 cartões, cinco anos de faturas e dados associados.
  - [ ] Registrar baseline por endpoint e orçamento de queries. (runner e orçamentos concluídos; captura depende do banco local de desempenho)
- [ ] 2. Outbox e RabbitMQ
  - [x] Criar contrato SQL do outbox e migração.
  - [x] Implementar publisher com confirms, correlação e recuperação após falha.
  - [x] Declarar exchanges, quorum queues, retries e DLQs.
  - [x] Criar worker separado e deduplicação de consumidores.
  - [x] Cobrir crash, duplicação, retry, DLQ, restart e ordem por agregado.
- [ ] 3. Cache distribuído
  - [x] Implementar namespaces, chaves canônicas, gerações e epoch global.
  - [x] Implementar cache-aside, ETag, coalescing e locks contra stampede.
  - [x] Implementar write fences e matriz central de invalidação.
  - [x] Emitir eventos em todas as mutações e workers.
  - [x] Cobrir indisponibilidade/reconexão do Redis e invalidação multiusuário.
- [ ] 4. Transações
  - [x] Adicionar proprietário direto e índices.
  - [x] Implementar `UNION ALL`, pesquisa no banco e cursor opaco.
  - [ ] Hidratar página em lote e tornar detalhe lazy. (hidratação em lote concluída; redução final do DTO e detalhe de compra pendentes)
  - [x] Substituir cálculo de saldo por agregação SQL.
  - [x] Migrar frontend, cache e guest mode para o novo contrato.
- [ ] 5. Cartões
  - [x] Criar payload agregado de cartão, limite e fatura atual.
  - [x] Remover `useQueries` e qualquer request por cartão.
  - [x] Fazer histórico/detalhe lazy e paginado.
  - [ ] Consultar faturas, compras, pagamentos e previsões por conjunto de cartões.
  - [x] Mover materialização de faturas e assinaturas para o worker.
- [ ] 6. Importações
  - [x] Reduzir listagem de importações de cartão a `id`, `fileName` e `pendingItemCount`.
  - [x] Paginar detalhes e itens somente quando a revisão abrir.
  - [x] Aplicar o mesmo padrão às importações de transações.
  - [x] Substituir `getImportReturn` por item por contagens e loaders em lote.
- [ ] 7. Agendas e taxas
  - [x] Retirar materializações de todos os GETs.
  - [x] Migrar salários, assinaturas e recorrências para comandos RabbitMQ.
  - [x] Migrar taxas de referência e recálculos de rendimento.
  - [x] Drenar e remover `ReferenceRateJob` e worker PostgreSQL antigo.
- [ ] 8. Demais domínios
  - [x] Otimizar dashboard e contas.
  - [ ] Otimizar dívidas e invalidação entre usuários. (resumo, eventos lazy e invalidação concluídos; convites ainda carregam previews completos)
  - [ ] Otimizar empréstimos, históricos, categorias, lojas e rendimentos.
  - [ ] Integrar eventos consolidados do sync.
- [ ] 9. Limpeza e aceite final
  - [ ] Remover contratos, tipos, queries e helpers antigos.
  - [ ] Remover código de fila PostgreSQL e invalidação obsoleta.
  - [ ] Validar metas de latência, requests, queries, regressão e build.

## Critérios de aceite

- Cache frio: p95 inferior a 1 segundo no dataset de desempenho.
- Cache quente: p95 inferior a 100 ms e zero queries SQL.
- Nenhuma tela faz mais de três requests iniciais.
- Tela de cartões faz uma request de cartões/resumos e zero requests por cartão.
- Query count permanece igual com 10 ou 100 mil registros.
- Resumo de importação contém somente `id`, `fileName` e `pendingItemCount`.
- Alteração não relacionada preserva caches válidos.
- Mutação seguida de leitura nunca entrega versão anterior.
- GET concorrente com mutação respeita write fence.
- Falha do Redis causa bypass; reconexão troca o epoch.
- Crash entre commit e publish, confirm perdido e entrega duplicada não perdem trabalho nem duplicam efeitos.
- Cursor cobre empates, inserção concorrente, fim, troca de filtro, cursor inválido e isolamento por usuário.
- Pesquisa cobre acentos, caixa, substring, valor, categoria, tag, conta, instituição e estabelecimento.
- Regressão cobre saldos, limite, pagamentos excedentes, previsões, rateios, importações, sync e guest mode.
- Testes backend/frontend, integração via Compose e builds dos pacotes afetados passam.

## Progresso

### 2026-09-20

- Plano aprovado e versionado.
- Implementação ainda não iniciada.
- Próxima etapa: fundação e baseline.

### 2026-09-22

- Compose local recebeu Redis persistente e RabbitMQ com console de administração.
- Criados ports e adapters de Redis, RabbitMQ e transactional outbox, incluindo publisher confirms, leases e processo worker separado.
- Topologia durável criada com exchanges, quorum queues, retries e DLQs.
- Cache distribuído base criado com chaves canônicas, epoch, gerações, ETag, coalescing local, bypass em falha e write fences.
- Instrumentação base registra duração, query count, tempo SQL e espera por conexão; timeouts do pool configurados.
- Consumidor de invalidação conectado ao worker, com deduplicação persistente, lease, retry limitado e DLQ.
- Coalescing agora usa lock Redis entre processos; matriz central relaciona eventos aos namespaces afetados.
- `Transaction` e `CreditPurchase` receberam proprietário direto, backfill, FKs, índices de paginação e índices trigram normalizados; todos os caminhos de escrita passaram a persistir `userId`.
- Listagem diária passou a filtrar, pesquisar, unir e paginar no PostgreSQL com `UNION ALL`, `limit + 1` e cursor opaco vinculado aos filtros; tags, referências e sincronização são hidratadas por página.
- Frontend e modo guest passaram a consumir `{ days, nextCursor, hasMore }` sem paginação por offset.
- Listagem diária recebeu cache-aside Redis, ETag/304 e diagnóstico `X-Cache`; mutações de transações agora abrem write fences e avançam gerações antes de responder.
- Listagem de importações de cartão agora retorna somente o resumo mínimo; detalhes usam cursor opaco e carregamento incremental dentro do modal de revisão.
- Importações de transações agora expõem resumo mínimo, paginam itens por cursor estável e carregam páginas adicionais somente dentro do modal de revisão.
- Rateios das revisões de cartão e transação agora são hidratados em lote, incluindo candidatos de duplicidade e sugestões de transferência; o custo de leitura deixou de crescer por item.
- Fixture local determinística criada com 100 mil transações, 20 cartões, cinco anos de faturas, compras e tags; runner mede cold start, p95 quente, tempo SQL e query count contra orçamentos versionados.
- Saldos diários da listagem de transações agora usam agregação e janela cumulativa no PostgreSQL, sem carregar todo o histórico em JavaScript.
- Listagem de cartões agora entrega limite agregado e fatura atual em duas consultas set-based; tela deixou de disparar uma consulta de faturas por cartão, inclusive no modo guest.
- Cache, publicação, consumo e lotes do outbox agora emitem métricas estruturadas de duração e resultado, completando a instrumentação da fundação.
- Histórico de faturas agora usa cursor opaco vinculado ao filtro e carregamento incremental; detalhes continuam lazy, e o resumo de cartão na tela de contas deixou de buscar faturas separadamente.
- Visão geral de cartões agora usa cache distribuído com ETag; fences cobrem mutações de cartões, contas e importações, além de transações.
- Detalhe lazy de fatura agora hidrata rateios de todas as compras em lote, removendo o N+1 restante dessa leitura.
- Materialização de faturas e compras de assinaturas saiu dos GETs: um serviço independente e idempotente agora roda no worker pela fila `schedule-materialization`, com comando de recuperação a cada minuto e deduplicação determinística entre instâncias.
- Salários e recorrências agora são materializados pelo mesmo comando RabbitMQ, em todos os usuários, com ocorrências idempotentes; dashboard e listagem de transações não escrevem mais durante GETs.
- Busca de taxas de referência e recálculos de rendimento agora usam comandos duráveis no RabbitMQ, publicados pelo outbox e consumidos pelo worker separado.
- Migração de banco drena jobs PostgreSQL pendentes para o outbox antes de remover `ReferenceRateJob`, seu enum, polling e worker embutido na API.
- Plugin global de consistência agora abre fences e grava eventos duráveis no outbox para todas as rotas de mutação dos domínios; a matriz cobre agendas, taxas, sync e demais caches compartilhados.
- Workers de agendas e rendimentos agora emitem eventos consolidados após materialização, incluindo todos os usuários afetados, para invalidação distribuída.
- Falha do Redis agora faz bypass imediato, sem espera pelo lock; a primeira operação após reconexão avança o epoch global e torna entradas antigas inalcançáveis.
- Mutações de dívidas resolvem participantes, conexões e visibilidades para abrir fences e invalidar todos os usuários afetados.
- Testes de falha cobrem confirmação perdida do publisher, recuperação pelo outbox, crash do consumidor, duplicação, retry, DLQ, restart e ordenação entre efeito, receipt e ACK.
- Próxima etapa: otimizar os demais domínios e executar o aceite final de performance.

### 2026-09-26

- Fundação dos domínios restantes recebeu cursores opacos compartilhados vinculados a usuário e filtros, namespaces de cache e matriz completa de invalidação.
- Fixture de desempenho passou a cobrir rendimentos, dívidas multiusuário, empréstimos, parcelas, históricos, agendas e catálogos.
- Orçamentos agora falham também quando o cache frio excede o limite de queries do endpoint.
- Contrato SQL recebeu índices para paginação e agregação de dívidas, empréstimos, pagamentos, históricos e agendas; validação com `EXPLAIN` depende do banco local de desempenho.
- Dashboard, lista e detalhe de contas receberam cache distribuído com ETag e zero SQL em hit.
- Lista de contas deixou de transportar históricos de taxa; detalhe mantém configuração completa sob demanda.
- Rendimentos agora usam cursor opaco, páginas de até 100 registros e carregamento incremental no extrato, com paridade no modo guest.
- Resumo de dívidas agora agrega pessoas e saldos em uma consulta SQL, sem eventos embutidos ou N+1 por pessoa.
- Eventos de cada pessoa passaram a carregar somente ao expandir, com cursor opaco, hidratação SQL set-based, cache e paridade guest.
- Invalidação multiusuário cobre resumo e páginas de eventos para todos os participantes conectados; previews lazy de convites permanecem pendentes.
- Empréstimos agora agregam parcelas, total pago e saldo principal numa única consulta, com cache e zero SQL em hit.
- Payoff antecipado passou a consultar apenas a contagem paga; adiantamento atualiza parcelas em lote e histórico usa cursor opaco.
- Próxima etapa: concluir previews de convites, detalhes de empréstimos e catálogos.

### 2026-09-28

- Dashboard passou a carregar visão geral, agendas, fluxos agregados e saldos em quatro consultas usando um único cliente do pool.
- Consultas deixaram de hidratar 100 mil transações, eventos de dívida, pagamentos e compras completas para montar o primeiro render.
- Fluxos são agregados por dia no PostgreSQL; saldos usam checkpoints, movimentações e rendimentos set-based somente nas datas necessárias.
- Leitura local caiu para 415 ms com 16 datas de saldo, mantendo cache distribuído e ETag; medição com 100 mil lançamentos segue bloqueada pelo fixture incompatível com constraints atuais.
- Próxima etapa: concluir previews de convites, detalhes de empréstimos e catálogos.

### 2026-09-30

- Corrigida regressão que fazia o dashboard reabrir o livro normalizado uma vez por cartão, chegando a 423 queries e 18 segundos.
- Cartões, compras, planos, parcelas, reembolsos, encargos, faturas e pagamentos agora são lidos em lote na consulta agregada do dashboard.
- Replay de faturas permanece no domínio financeiro, mas sem hidratar tags ou rateios não usados pelo dashboard e sem queries proporcionais ao número de cartões.
- Orçamento frio do dashboard permanece em quatro queries; teste cobre isolamento do replay em lote entre cartões.
- Próxima etapa: validar p95 com o dataset de desempenho e concluir previews de convites, detalhes de empréstimos e catálogos.

### 2026-10-01

- Benchmark agora mede duração até receber o corpo completo da resposta, evitando subestimar payloads grandes; regressão cobre resposta transmitida com atraso e ausência de métricas SQL.
- Aceite de p95 permanece pendente: captura exige fixture atualizada, API local e sessão do usuário de desempenho.
