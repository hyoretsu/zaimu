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
  - [x] Registrar baseline por endpoint e orçamento de queries. (captura diagnóstica local com cinco amostras; aceite oficial com 25 permanece pendente)
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
  - [x] Hidratar página em lote e tornar detalhe lazy. (rateio compacto na lista; edição busca detalhe isolado de transação/compra)
  - [x] Substituir cálculo de saldo por agregação SQL.
  - [x] Migrar frontend, cache e guest mode para o novo contrato.
- [ ] 5. Cartões
  - [x] Criar payload agregado de cartão, limite e fatura atual.
  - [x] Remover `useQueries` e qualquer request por cartão.
  - [x] Fazer histórico/detalhe lazy e paginado.
  - [x] Consultar faturas, compras, pagamentos e previsões por conjunto de cartões.
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
  - [x] Otimizar dívidas e invalidação entre usuários. (resumo, eventos paginados, invalidação multiusuário e previews lazy de convites concluídos)
  - [ ] Otimizar empréstimos, históricos, categorias, lojas e rendimentos.
  - [x] Integrar eventos consolidados do sync.
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
- Fixture atualizada para `CreditPurchaseRecord`, planos/parcelas/referências normalizados e 240 `Recurrence`; configurações de rendimento respeitam constraints atuais. Migração do seed deixou de avançar referências Git. Execução volumosa ainda exige banco local dedicado.
- Convites agora retornam somente metadados em uma consulta; saldo e lançamentos carregam ao abrir revisão, com autorização restrita ao destinatário pendente, skeleton e retry. Preview aberto ainda retorna o histórico completo.
- Validação: testes de dívidas e medição passaram; builds backend e frontend passaram. Próxima etapa: detalhes de empréstimos, catálogos e captura de p95 com banco local dedicado.
- Listagem/detalhe de categorias, listagem de lojas e detalhe de empréstimos receberam cache distribuído com ETag; autorização de histórico de empréstimos saiu do caminho de cache hit. Consultas frias de detalhe filtram proprietário no SQL.
- Matriz de invalidação e fences incluem detalhes de categoria, inclusive em sync. Regressão cobre edição de categoria, pagamento de empréstimo e preservação de caches de outros usuários/domínios.
- Benchmark recebeu orçamentos de lista/detalhe de categorias, lojas, detalhe/histórico de empréstimos. Paginação dos catálogos e separação de parcelas do detalhe de empréstimos permanecem pendentes.
- Detalhe de empréstimo agora retorna somente metadados em uma query; parcelas e cronograma completo saíram do payload. Nova versão da chave impede reutilizar o contrato anterior no Redis.
- `GET /loans/:id/payments` carrega parcelas em páginas de até 100, com cursor por número/ID vinculado ao usuário e empréstimo, cache e invalidação existente. Contrato frontend atualizado atomicamente; nenhuma tela consumia os campos removidos.
- Paridade guest de pagamentos continua pendente: IndexedDB atual não armazena parcelas nem pagamentos de empréstimos. Paginação de catálogos e captura p95 também permanecem abertas.
- Validação da separação de parcelas: quatro testes passaram (cursor, isolamento e DTO serializado); builds backend e frontend passaram.
- Lojas passaram a retornar `{ items, nextCursor, hasMore }`, com busca substring normalizada no SQL, ordenação estável por nome/ID e páginas de até 100. Cache inclui pesquisa/cursor e versão do novo contrato.
- Seletor de lojas carrega 50 registros somente ao abrir, pesquisa com debounce no servidor e oferece carregamento incremental com estados de erro/retry. Modo guest aplica busca e cursores vinculados a proprietário/filtro; páginas parciais não substituem snapshots locais.
- Categorias permanecem pendentes: tags selecionadas precisam ter seus nomes resolvidos independentemente da página pesquisada. Próxima etapa: paginação de categorias e paridade de pagamentos guest.
- Criação de loja guest reutiliza nome normalizado existente mesmo fora da página carregada. Validação: seis testes de paginação/normalização passaram; builds backend e frontend passaram.
- Categorias passaram a retornar páginas compactas com busca normalizada no SQL e cursor por nome/ID; lookup de IDs resolve tags selecionadas em uma consulta, com cache, limites de lote e isolamento por proprietário.
- Seletor de tags carrega páginas somente ao abrir, pesquisa com debounce e mantém badges através de lookup independente da página. Loading e falha do lookup não são tratados como seleção vazia.
- Cursores de catálogo foram compartilhados entre lojas e categorias, com domínio incluído no filtro; modo guest usa o mesmo formato de página sem substituir snapshots por resultados parciais.
- Próxima etapa: paridade de pagamentos de empréstimos guest, eventos consolidados do sync e aceite de desempenho.
- Validação de categorias: dez testes passaram (cursores, lookup, DTO serializado e badges selecionados); builds backend/frontend passaram.
- Pagamentos guest receberam store IndexedDB por proprietário, criação atômica de empréstimo/parcelas PRICE e SAC, cálculo de resumo, leitura paginada e pagamento protegido contra duplicação. Contrato sync inclui parcelas e mantém pagamentos confirmados no servidor.
- Sync grava eventos consolidados por usuário/domínio no outbox dentro da transação; consumidores invalidam dependências e detalhes dos IDs afetados. Plugin mantém fences e deixa de publicar evento genérico após commit. Dívidas/cartões/transações incluem usuários conectados.
- Limites restantes: empréstimos guest antigos sem parcelas exigem migração específica; SACRE e antecipação guest ainda não suportados. Métodos de pagamento estão disponíveis no serviço, sem nova tela de parcelas neste passo. Aceite de desempenho e integração volumosa continuam pendentes.
- Validação: cinco testes de amortização, IndexedDB e eventos; treze testes de eventos/fences/invalidação passaram. Builds backend e frontend passaram.
- SACRE removido dos contratos ativos, criação e sync por decisão do usuário. Migração SQL substitui enum somente após confirmar ausência de empréstimos legados SACRE; nenhum registro é convertido silenciosamente.
- Cronograma PRICE/SAC compartilhado entre backend e guest corrige taxa zero e vencimentos em meses curtos. Pagamento, criação e antecipação backend executam em transação; mutações concorrentes do mesmo empréstimo serializam por lock.
- Migração guest gera parcelas idempotentemente e isola registros inválidos. Histórico pago exige revisão explícita de amortização/data antes de pagamento, antecipação ou sync; confirmação grava histórico atomicamente.
- Interface de empréstimos recebeu criação com máscaras, parcelas lazy paginadas, pagamento por parcela, antecipação FRONT/BACK e estimativa de quitação. Skeleton, retry, feedback final e bloqueios por conflito preservam controles independentes.
- Validação: seis testes financeiros/IndexedDB passaram; build backend/frontend passou. Próxima etapa: fixture volumosa, orçamento de queries, limpeza dos contratos restantes e aceite final.
- Regressão de eventos sync deixou de depender da ordem das propriedades de objeto: verificação identifica domínio emitido, preservando teste de consolidação e isolamento. Dois testes passaram.

- Fixture volumosa executada em banco local isolado: 100 mil transações, 20 cartões, 1.200 faturas e 12 mil compras normalizadas. Seed corrigido para contratos de rendimento e timeout próprio de carga.
- Validação do runner: duas regressões passaram; medição de p95 e aceite permanecem pendentes.
- Visão geral de cartões passou a usar leitura normalizada por conjunto, compartilhando replay com dashboard. Contas agregam saldos monetários no SQL e carregam metadados em uma consulta. Nove testes focados passaram; latência volumosa ainda fora do aceite.
- Importações receberam cache de resumo/detalhe com chaves por domínio e página, ETag e autorização dentro do loader. Fences existentes invalidam listas e detalhes. Aceite volumoso ainda pendente.
- Correção de empréstimos: taxa armazenada como fração agora exibida em porcentagem; histórico preserva enum FRONT/BACK no contrato tipado; paginação da interface recebeu tipos explícitos. Build frontend passou.
- Contrato autenticado integral/offset de transações removido. Extrato e rendimentos usam páginas filtradas; guest preserva cálculo offline e cursores de rendimento vinculados a proprietário/filtros. Consulta comum limita candidatos antes de hidratar página e evita texto de pesquisa sem filtro. Três testes de cursor e builds passaram; medição final pendente.
- Atomicidade global corrigida: mutações HTTP e outbox compartilham transação de request; resposta de erro força rollback. Fences finalizam após commit, inclusive sync; falha/rollback mantém lease. Quatro testes cobrem ordem, rollback HTTP, falha de commit e integração do wrapper Elysia.
- Captura diagnóstica versionada registra p95 frio real com cinco amostras e cache limpo em Redis dedicado, além de p95 quente concorrente. Todos os hits medidos fizeram zero SQL; latências de vários endpoints ainda excedem metas. Runner preserva relatório mesmo após erro por endpoint.
- Replay financeiro passou a agrupar parcelas/reembolsos por compra uma vez e indexar faturas por ID. Regressão completa de finanças: 64 testes passaram. Teste local de falha forçada no outbox confirmou HTTP 500 com zero lojas persistidas; trigger de teste removido após verificação.
- Listagem de transações passou a retornar rateio compacto e omitir referências externas de edição. Formulário carrega detalhe completo sob demanda, com skeleton/retry e cache por ID. Edição de compra busca metadados somente da compra selecionada, com autorização no SQL, rateio completo e paridade guest. Builds backend/frontend e 25 testes de rateio passaram.
- Perfil CPU identificou datas de faturas revalidadas por compra e calendário recalculado em parcelas concretas. Replay valida conjunto de faturas uma vez e usa vínculos registrados; 64 testes financeiros continuaram passando.
- Cursores guest de transações passaram de offset para posição estável, vinculada a usuário/filtros, com suporte Unicode e teste de inserção concorrente. Saldos diários offline deixaram de retornar zero; página guest transporta mesmo rateio compacto da API. Helpers antigos de busca em memória e saldo por datas sem consumidores foram removidos. Dois testes guest e build frontend passaram.

- Consistência de detalhes: agendas, categorias e transações invalidam família de detalhes, e mutações de transações incluem participantes conectados. Epoch agora é consultado entre processos; regressão cobre reconexão em outra instância. Catálogos respondem 304 por ETag. 21 testes de cache/invalidação passaram. Fences concorrentes e limpeza de gerações continuam pendentes.
