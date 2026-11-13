# 0018 - Validação e otimização de performance da aplicação inteira

## Objetivo e diagnóstico

Concluir aceite pendente do plano 0012 e ampliar cobertura para backend, autenticação, workers, frontend, modo visitante, IndexedDB, sincronização e Tauri desktop/mobile.

Plano versionado em `plans/0018-whole-application-performance.md`. Salvamento e commit local não iniciam a execução das etapas abaixo.

Evidências encontradas:

| Evidência                                                              | Implicação                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Dashboard: 35,2 s com quatro queries e 224 ms SQL                      | Investigar esperas de cache, autenticação, CPU, serialização e bloqueio do event loop.                |
| Eventos de dívida: 32,2 s com duas queries                             | Poucas queries não garantem resposta rápida. bypass precisa informar causa e tempo de infraestrutura. |
| Cartões/transações: 419/833 queries nos logs                           | Confirmar atribuição por request. loadCreditBook possui N+1 real: consulta rateio por compra.         |
| Espera de conexão 17,6 s numa request de 3,5 s                         | Instrumentação precisa separar tempo acumulado, operações concorrentes e duração da request.          |
| Uma consulta de revisão de estorno por cartão                          | Tela voltou a ter requests proporcionais à quantidade de cartões.                                     |
| Histórico/detalhe de faturas lê livro inteiro                          | Paginação atual limita resposta, mas mantém trabalho integral antes do corte.                         |
| Baseline versionado: cinco amostras, cartões ~10 s e dashboard ~15,5 s | Captura diagnóstica; não constitui aceite. Vários hits também excedem 100 ms.                         |
| Adapter de autenticação consulta fora dos contadores atuais            | queryCount: 0 ainda não comprova zero SQL total.                                                      |
| Shell mobile importa telas diretamente; guest usa leituras integrais   | Bundle, CPU, memória e IndexedDB precisam entrar na validação.                                        |

Nenhuma causa será atribuída somente pela diferença entre duração HTTP e soma SQL. Tempos sobrepostos serão identificados por spans.

## Cobertura e critérios de aceite

Inventariar todas as rotas HTTP, telas e ações. Cada item recebe cenário, métricas, orçamento e resultado. Nenhum item desaparece do relatório por falha ou ausência de ambiente.

Cobertura obrigatória:

- Autenticação: inicialização, login, cadastro, verificação, recuperação de senha, renovação, logout e exclusão de conta.
- Dashboard, contas, instituições, ajustes, rendimentos e feriados.
- Transações, filtros, pesquisa, sugestões de transferência, edição e rateios.
- Cartões, limites, faturas, compras, parcelas, pagamentos, encargos, reembolsos e revisões.
- Dívidas, pessoas, convites, compartilhamento e eventos.
- Recorrências, históricos, previsões e recomposição; empréstimos, parcelas e antecipação.
- Categorias, tags, lojas, seletores, configurações e páginas públicas.
- Importação de extratos/faturas, revisão, aprovação individual/em lote e conciliação.
- Guest, migrações IndexedDB, offline, troca de identidade e sincronização.
- Outbox, RabbitMQ, invalidação, materialização, taxas e recálculo de rendimentos.
- Web, Tauri desktop e WebViews Android/iOS: startup, navegação, retorno do background e deep links.

Metas oficiais em infraestrutura local saudável, com carga de 1, 5 e 20 usuários concorrentes:

| Cenário                                        | Meta                                                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| GET cacheável frio                             | p95 < 1.000 ms, incluindo autenticação e corpo completo                                                                                   |
| GET quente e resposta 304                      | p95 < 100 ms; zero SQL total, incluindo autenticação                                                                                      |
| Entrada numa tela                              | Requests iniciais justificados por responsabilidade; sem limite artificial quando prejudicar divisão lógica; assets medidos separadamente |
| Listagens e detalhes paginados                 | Nenhum request/query por registro; orçamento constante com tamanho de página fixo                                                         |
| CRUD individual comum                          | p95 < 1.000 ms até confirmação                                                                                                            |
| Navegação/abertura de detalhe com cache quente | p95 < 1.000 ms até conteúdo utilizável                                                                                                    |
| Experiência web                                | LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1                                                                                                     |
| Startup utilizável                             | p95 ≤ 3 s web/desktop; ≤ 4 s mobile                                                                                                       |
| Importação de referência                       | Até 15 s para arquivo local ≤ 10 MB e ≤ 1.000 itens                                                                                       |
| Sync de referência                             | Até 30 s para snapshot de 100 mil lançamentos                                                                                             |
| Materialização                                 | SLA existente de até dois minutos                                                                                                         |
| Falha do Redis                                 | Até 100 ms adicionais de espera de cache por request antes do fallback                                                                    |

GETs não cacheáveis, uploads, operações em lote, sync e jobs terão cenários próprios; seus custos não serão ocultados nas médias de CRUD. Orçamentos adicionais são defaults deste plano, ajustáveis somente por decisão registrada do usuário.

## Etapas de execução

### 1. Instrumentação confiável e ambiente reproduzível

- [x] Versionar plano e matriz de cobertura; preservar alterações locais preexistentes.
- [x] Capturar contexto de métricas por request com isolamento entre requests, jobs e tarefas posteriores à resposta. Iniciar relógio na entrada HTTP.
- [x] Instrumentar execução SQL numa camada comum, incluindo ORM de autenticação, raw SQL, conexões e transações, sem dupla contagem.
- [ ] Registrar requestId, rota normalizada, status, duração, bytes, total de queries, queries de auth/negócio, aquisição de conexão e ocupação do pool.
- [ ] Separar tempo SQL acumulado de duração das operações e espera interna. Registrar spans de autenticação, Redis, locks/fences, loaders, replay, serialização e fila.
- [ ] Registrar motivos de bypass, timeout e falha. Medir CPU, event-loop lag, memória, GC e backlog.
- [ ] Preservar headers diagnósticos existentes e estendê-los somente em ambiente de desempenho. Não registrar cookies, tokens, senhas ou valores financeiros.
- [ ] Preparar PostgreSQL, Redis e RabbitMQ dedicados, locais, com email e fontes de taxas substituídos por serviços/fixtures locais.

### 2. Baseline integral e runner de aceite

- [ ] Estender runner existente para todas as leituras, escritas e jornadas inventariadas.
- [ ] Criar fixtures determinísticas de 10, 10 mil e 100 mil lançamentos; variar cartões, faturas, compras, rateios, recorrências, dívidas, catálogos e importações. Gerar usuários isolados para carga concorrente.
- [ ] Fixar data de referência dos testes. Validar schema, constraints e resultados financeiros antes de medir.
- [ ] Separar startup, cache Redis frio, cache quente, cache frontend quente, bypass, pós-invalidação e concorrência numa mesma chave. Não chamar somente cache Redis vazio de “cold start”.
- [ ] Medir carga controlada em 1/5/20 usuários, leitura e escrita mistas, com worker parado e ativo. Cache frio significa miss comprovado, não fence artificial.
- [ ] Executar três rodadas com pelo menos 25 amostras concluídas por cenário e nível de carga. Stress acima de 20 usuários será diagnóstico de capacidade.
- [ ] Salvar amostras, percentis, throughput, erros, payloads, queries, cache, CPU, memória e configuração da máquina. Falta de métricas ou cenário com erro reprova aceite.
- [ ] Capturar planos EXPLAIN (ANALYZE, BUFFERS) das consultas relevantes no banco dedicado, incluindo buscas e páginas profundas.

### 3. Infraestrutura, cache e autenticação

- [ ] Reproduzir esperas de aproximadamente 30 s. Limitar orçamento total de chamadas Redis por request, implementar circuit breaker e evitar tentativas sucessivas durante indisponibilidade.
- [ ] Medir round trips Redis; consolidar operações preservando verificações atômicas de geração, epoch e fences.
- [ ] Corrigir coalescing entre processos: loader longo não pode perder proteção e disparar recomputações sem limite. Testar lease, renovação, expiração e liberação por proprietário.
- [ ] Configurar secondaryStorage do Better Auth em Redis, com namespace próprio e chaves protegidas; manter sessões persistidas no PostgreSQL (storeSessionInDatabase: true, preserveSessionInDatabase: false).
- [ ] Manter cookie cache de sessão desativado. GETs validam sessão compartilhada no Redis; renovação usa fluxo explícito e deduplicado, separado das leituras financeiras.
- [ ] Implementar fallback seguro ao banco em falha/miss de sessão e repopulação protegida contra revogação concorrente. Sessões antigas continuam válidas até expirar ou serem revogadas.
- [ ] Integrar criação, renovação, logout, revogação, reset de senha e exclusão de conta à consistência entre PostgreSQL e Redis. Recuperação invalida estado anterior antes de reutilizá-lo.
- [ ] Testar revogação durante falha do Redis e entre instâncias. Falha operacional não autentica sessão revogada nem força logout indevido; 429 continua distinto de sessão ausente.
- [x] Deduplicar inicialização frontend e resolução de sessão dentro da request. Medir StrictMode separadamente do build release.
- [ ] Demonstrar zero SQL em hits após aquecimento de sessão e dados, com instrumentação completa.

### 4. Consultas, replay financeiro e escritas

- [ ] Remover consulta de rateio por compra em loadCreditBook; hidratar regras, tags e planos em lote e somente quando necessários.
- [ ] Separar loaders de leitura/resumo dos livros completos usados por mutação e sync.
- [ ] Paginar faturas antes da hidratação; detalhe busca compras/pagamentos da fatura selecionada. Saldos anteriores usam contexto financeiro correto, sem truncamento arbitrário do histórico.
- [ ] Aplicar cache, ETag e invalidação aos históricos/detalhes ainda sem cobertura.
- [ ] Reduzir trabalho de dashboard/cartões: eliminar replay duplicado, filtros repetidos e estruturas reconstruídas por compra ou ciclo.
- [ ] Preservar orçamentos existentes de queries de negócio; instrumentar auth separadamente e exigir total zero no hit. Novos endpoints recebem orçamento fixo justificado antes da otimização.
- [ ] Auditar filtros, buscas, agregações e índices de todos os domínios. Evitar leitura integral seguida de filtragem/paginação em memória.
- [ ] Medir escritas: locks, gravações por item, reconstrução de livros, aprovação em lote e persistência de histórico. Usar operações set-based e gravar alterações necessárias.
- [ ] Se cenário continuar acima da meta após batching, SQL e otimização de replay, implementar checkpoints/projeções persistidos, reconstruíveis e versionados. Reprocessar desde primeira data afetada por alteração retroativa.
- [ ] Validar projeções contra replay integral. Leitura após escrita precisa enxergar resultado atualizado; GET não materializa histórico concreto.

### 5. Frontend, guest, importações, sync e workers

- [x] Substituir requests de revisão por cartão por resumo agregado na listagem e detalhes lazy. Resumo inclui contagem de revisões pendentes; contrato por cartão permanece para consulta individual.
- [ ] Auditar mounting, modais fechados, abas ocultas, retries, foco e invalidação. Evitar requests duplicadas ou por registro; preservar divisão lógica de dados/sessão.
- [x] Fazer code splitting das telas e módulos pesados, incluindo referências diretas do shell mobile. Preservar estado/scroll exigidos pelo plano 0010.
- [ ] Medir chunks, parsing, gráficos, ícones, fontes e imagens. Carregar gráficos, PDF e formulários pesados sob demanda.
- [ ] Perfilar commits React, DOM e long tasks; virtualizar listas volumosas preservando ScrollArea, acessibilidade, geometria e navegação.
- [ ] Trocar leituras integrais IndexedDB por índices/cursores por proprietário e página. Cálculos integrais inevitáveis usam processamento incremental fora da thread principal, com cancelamento.
- [ ] Validar migrações e projeções guest: atomicidade, clocks, tombstones, retomada e equivalência financeira.
- [ ] Perfilar importação por fase: upload, parsing, identificação, reconciliação, persistência e revisão. Manter modal aberto com progresso interno.
- [ ] Perfilar sync no servidor e cliente. Aplicar mudanças locais em lotes, proteger edições concorrentes e preservar contrato de snapshot integral nesta versão.
- [ ] Limitar concorrência dos workers e processar somente usuários/entidades afetados. Evitar sobreposição de jobs e invalidações periódicas sem mudança efetiva.
- [ ] Validar impacto de backlog, catch-up, recálculo, retries, DLQ e limpeza Redis sobre latência das requests.

### 6. Aceite e relatório final

- [ ] Reexecutar matriz completa em builds release, comparando baseline e resultado por cenário.
- [ ] Registrar orçamentos de bundle/payload e consumo de memória a partir do baseline; nenhuma regressão superior a 10% sem justificativa aprovada.
- [ ] Executar 50 ciclos de navegação, modais, troca de abas e retorno do background; verificar ausência de crescimento contínuo de memória, listeners e requests.
- [ ] Validar desktop e emuladores nativos locais. Browser responsivo não substitui teste de WebView.
- [ ] Publicar relatório versionado com antes/depois, gargalo corrigido, evidências, comandos e pendências por plataforma.
- [ ] Encerrar aceite do 0012 somente após comprovar seus critérios. Remoção ampla de legado continua em plano separado.
- [ ] Atualizar progresso e criar commit local por etapa concluída, com usuário local como autor/committer e trailer Codex. Validação de commit segue hooks, sem bypass.

## Contratos e testes obrigatórios

Alterações de interface previstas: métricas estruturadas e relatórios de benchmark; adapter Redis de sessões; resumo agregado de revisões de estorno; separação de detalhes/páginas de fatura quando payload ainda estiver integral. Backend, frontend e guest mudam juntos. DTOs seguem TypeBox; arquivos gerados não recebem edição manual.

Testes:

- Requests simultâneas com SQL conhecido: isolamento de contadores, ausência de dupla contagem e diferenciação entre soma concorrente e tempo decorrido.
- Hits/304 sem SQL total; miss, Redis lento/indisponível, reconexão, stampede, fences concorrentes e loader atrasado.
- Sessão expirada/revogada, renovação, logout, reset, troca de identidade e revogação durante falha/reconexão.
- Crescimento de dados/cartões sem N+1; paginação, pesquisa normalizada e isolamento entre usuários.
- Equivalência em centavos: saldos, pagamentos excedentes, transposição, reembolsos, parcelas, cashback, rateios, previsões e alterações retroativas.
- Importação repetida, aprovação em lote, sync concorrente, tombstones, migração interrompida e retomada.
- Jobs duplicados, crash, retry, backlog e recuperação sem efeitos duplicados.
- Navegação web/mobile, abas preservadas, skeletons, modais, scroll, deep links e responsividade durante processamento.
- Testes funcionais dos pacotes afetados e checks exigidos pelos hooks; builds scoped ao concluir etapas relevantes.

## Premissas e limites

Execução integralmente local. Fixtures externas substituídas por mocks; nenhum push, deploy, serviço compartilhado ou migração remota.

Metas originais de latência mantidas. Zero SQL quente inclui autenticação. Checkpoints autorizados, condicionados à equivalência e necessidade medida.

Ambiente atual Linux não permite aceite iOS; ferramentas Android não foram detectadas. Preparar testes e registrar validação nativa pendente até existir ambiente local compatível. Nenhuma plataforma ausente será marcada como aprovada.

## Progresso de execução

### Instrumentação e ambiente local

- Inventário inicial: 135 contratos HTTP, 22 rotas frontend e 18 jornadas. Resultados ausentes permanecem `pending` em `backend/performance/coverage.json`.
- Contagem movida à execução física do cliente PostgreSQL. Comandos de transação entram no total; orçamentos antigos de negócio serão revisados separadamente.
- Contexto nasce antes do handler Elysia; encerramento congela contadores para tarefas posteriores. SQL acumulado e união dos intervalos SQL são métricas distintas.
- Docker Compose dedicado usa imagens já locais, sem pulls, portas loopback 55495/6395/56795 e armazenamento PostgreSQL temporário.
- Hook existente executava somente formatação/lint. Validação scoped de tipos e cobertura unitária backend adicionada ao hook para cumprir convenção do projeto.
- Próximo: confirmar métricas no PostgreSQL dedicado, baseline e orçamento Redis; completar instrumentação por fase e sessões.

### Fixtures e baseline diagnóstico

- Fixture local validada: 20 proprietários, 10 mil transações por proprietário, 10 cartões, 240 faturas e 2.400 compras por proprietário. Rateios e parcelas mantêm valores em centavos.
- Seed aceita perfis de 10, 10 mil e 100 mil lançamentos; somente perfil 10 mil foi executado até aqui.
- Runner mede corpo completo, MISS/HIT/304, SQL total/auth/negócio, percentis e erros. Modo oficial configura três rodadas e cargas 1/5/20; diagnóstico tem cinco amostras.
- Baseline diagnóstico arquivado em `backend/performance/baseline-0018.json`: hits ainda executam duas queries de autenticação. Não constitui aceite; data do processo inicial ainda não estava congelada.
- Launcher dedicado congela data em 04/10/2026 e fixa todas as conexões locais. Jornadas sem runner continuam pendentes, sem aprovação implícita.

### Cache e sessões

- Orçamento Redis compartilhado por request: 100 ms, circuito com cooldown e uma sonda de recuperação. Testes cobrem atraso, orçamento e sucesso tardio.
- Loader protegido com renovação de lease; espera por outro processo não dispara segundo loader após dois segundos. Perda de lease impede preenchimento.
- Secondary storage Better Auth usa HMAC, namespace, epoch e fencing atômico; sessões continuam persistidas no PostgreSQL, cookie cache desativado e leituras financeiras sem renovação.
- Consistência durante partição exige fence antes de qualquer alteração de autenticação. Falha em adquirir fence retorna 503 antes de gravar no banco. Leituras financeiras continuam com fallback ao PostgreSQL. Revogação com Redis indisponível ainda não atende disponibilidade pretendida pelo plano.
- Fence de autenticação não expira automaticamente: crash durante mutação mantém fallback ao banco, evitando reaproveitar sessão antiga. Recuperação de fence órfão exige procedimento seguro; não apagar fence de processo ativo.
- Testes locais com duas instâncias confirmam invalidação compartilhada e impedem repopulação de fallback antigo. Aceite integrado HTTP e falhas permanece em execução.

### Leituras financeiras e frontend de cartões

- Rateios de compras carregados em lote; planos indexados por compra. Leitura de faturas omite metadados do livro completo e hidrata tags/rateios somente das compras apresentadas.
- Histórico/detalhe de faturas agora usam cache, ETag e namespace invalidado pelas mutações. Paginação ainda precisa de projeção financeira persistida para limitar replay antes do corte; histórico integral não foi truncado.
- Revisões pendentes agregadas por cartão em uma query agrupada. Backend e guest entregam contagem na listagem; componente busca detalhes somente ao expandir.
- DTOs TypeBox adicionados à listagem de cartões e página de faturas. Este repositório usa cliente manual em `frontend/src/lib/api.ts`, sem SDK gerado ou scripts export/generate.
- Configurações de rendimentos carregadas em lote; dashboard reutiliza replay atual. Livro financeiro indexa planos, estornos e parcelas; pagamentos resolvem vencimentos por busca binária preservando desempate por ID.
- 96 testes financeiros existentes passam. Diagnóstico HTTP já comprova hits com zero SQL total. Meta fria do dashboard ainda exige novo profiling/aceite após otimizações.

### Shell, sessão e IndexedDB

- Telas extraídas para componentes locais. Router usa autoCodeSplitting; shell mobile carrega chunks lazy e preserva Activity/scroll de abas visitadas. Build release cria chunks separados.
- Inicialização de sessão deduplicada e protegida por versão de identidade. 429/5xx preservam identidade e mostram tentativa novamente; logout só limpa dados após revogação confirmada.
- IndexedDB v15 adiciona índices compostos por proprietário/data e proprietário/modifiedAt. Upgrade de índices preserva estado de migração financeira concluída.
- Snapshot usa Map e lotes de 1.000 requests numa transação atômica; preserva tombstones e edições concorrentes. Registros remotos idênticos com mesmo clock dispensam regravação.
- Testes de migração exercitam bloqueio atômico, recuperação e retomada. Benchmark Chromium: atualização de 10 mil registros caiu de 40,7 s para 2,1 s; gravação inicial ainda excede meta e 100 mil registros atingiram timeout de 60 s. Aceite de sync segue reprovado.
- Auditoria web identificou entradas com 4-6 requests: configuração automática Open Finance, imports e sugestões seguem responsabilidades próprias. Contagem isolada não exige agregação artificial, conforme decisão do usuário em 09/10/2026. Navegação ainda não constitui aceite.

### Consolidação Redis e coalescência entre processos

- Estado de epoch, gerações e fences lido num único script Lua. Leitura e preenchimento continuam protegidos por validação atômica.
- Polling de loaders cresce de 25 ms até 500 ms, reduzindo consumo do orçamento Redis; falha durante espera retorna 503. Renovação perdida impede preenchimento tardio.
- Redis dedicado: 16 testes passaram, incluindo NX, renovação/liberação por proprietário e estado atômico. Runner com três processos e loader de 12 s observou uma execução e dois hits, ultrapassando lease de 10 s. Evidência em `backend/performance/coalescing-0018.json`.
- Runner usa namespace exclusivo por execução e limpa somente suas próprias chaves. Resultado anterior com três loaders não foi reproduzido nesta execução; não estabelece causa nem aceite sob carga/falhas.

### Materialização com escopo capturado

- Worker consulta cartões com faturas/parcelas faltantes e recorrências cujo marcador está atrasado; comando sem candidatos dispensa fences e transação de escrita. IDs de cartões e proprietários são capturados antes da espera, incluindo pares de dívida nos fences.
- Faturas faltantes inseridas em lote; livros carregados somente para cartões candidatos a parcelas. Removida leitura duplicada anterior à mutação. Recorrências retornam somente proprietários com movimentos criados.
- Calendário UTC corrige deslocamento adicional de fechamento no dia 1 e preserva meses curtos. Sete testes passaram. `performance/validate-schedules.ts` comparou 144 datas SQL com motor financeiro e confirmou repetição sem mudanças; validação inteira revertida no banco dedicado.
- Ainda pendentes: candidates conservadores de parcelas canceladas por reembolso, invalidação granular de jobs sem mudança, backlog/retries e medição com worker ativo.

### Saldos monetários sem releitura por data

- SQL agrega movimentos por conta/data e usa soma acumulada; checkpoints preservam saldo de fechamento, inclusive alterações retroativas. Nenhum histórico truncado.
- Validador compara SQL anterior em centavos e testa valores independentes com transferências, transferência para própria conta, dois ajustes, rendimentos de quatro casas, exclusão/null e cashback; pontos permanecem fora. Dados adversariais e alteração retroativa revertidos integralmente. Fixture ausente agora falha explicitamente.
- Dois proprietários com 10 mil transações: seis comparações passaram, 144 saldos comparados. Última captura diagnóstica: SQL anterior 25,5-43,3 ms, otimizado 20,9-42,7 ms, com regressão numa das seis amostras; EXPLAIN ANALYZE BUFFERS versionado em `backend/performance/balances-0018.json`. Não substitui rodadas oficiais HTTP.

### Métricas isoladas por job

- Consumo RabbitMQ envolve deduplicação, handler, confirmação/retry no contexto SQL exclusivo do job. Logs registram queries totais/auth/negócio, SQL acumulado/união, espera de conexão/Redis, pool, duração e atraso desde publicação.
- Ambiente de performance inclui spans, event-loop lag, memória e CPU. Campos CPU/memória explicitamente pertencem ao intervalo do processo, podendo sobrepor outros jobs. Métricas congelam ao concluir consumo.
- Nove testes passaram: jobs concorrentes, trabalho tardio, falha sem exposição da mensagem e contratos de ack/retry/DLQ. Erros HTTP agora registram somente frames de stack, evitando mensagens de validação com payload.
- Backlog agregado, GC, fases de importação e launcher worker com fixtures de taxas continuam pendentes.

### Diagnóstico HTTP após otimizações

- Build backend release, data fixa e banco dedicado com dois proprietários de 10 mil transações. Runner diagnóstico: cinco amostras, carga 1, worker parado. Relatório `backend/performance/http-diagnostic-0018.json`.
- Transações: frio p95 103,9 ms, seis queries; quente 3,7 ms e 304 3,3 ms, ambos zero SQL total.
- Dashboard: frio p95 548,5 ms, 13 queries totais, reprovado pelo orçamento original. Quente 5,6 ms e 304 9,5 ms, ambos zero SQL total. Orçamento não relaxado.
- Aceite global permanece reprovado: cobertura e rodadas oficiais incompletas, frontend/sync e plataformas nativas ainda pendentes.

### Decisão de escopo e worker isolado (09/10/2026)

- Usuário dispensou redução da quantidade de requisições quando prejudicar organização lógica. Limite de três requests frontend deixa de ser gate rígido; latência, ausência de duplicação/N+1 e zero SQL nos hits continuam exigidos. Orçamentos SQL anteriores permanecem.
- API e worker compartilham configuração dedicada e data fixa. Launcher `backend/performance/start-worker.ts` força PostgreSQL/Redis/RabbitMQ locais e prefetch 1.
- BCB retorna fixture determinística de 0,04 por dia útil, sem rede. HTTP/preconnect externos ou para serviços locais fora das portas dedicadas são bloqueados; requests locais não seguem redirects. Email permanece em transporte JSON no ambiente de teste.
- Dois testes funcionais passaram: fixture sem rede, bloqueio externo e preservação de método/corpo com redirects bloqueados. Próximo: worker ativo, backlog e latência concorrente.

### Parser PDF fora do startup

- Build release da API falhava com `DOMMatrix is not defined`: bundling antecipado do PDF.js perdia contexto dos módulos nativos. Parser agora carrega somente ao importar PDF, com inicialização compartilhada e caminho do worker relativo ao pacote.
- `pdf-parse` permanece dependência externa do bundle Bun; imagem runtime copia dependências locais do backend. Bundle API passou de 6,15 MB para 5,16 MB nesta captura, e startup dedicado voltou a funcionar.
- PDF sintético local confirmou extração de texto e deduplicação da inicialização. Build backend passou. Imagem Docker não foi reconstruída nesta etapa.

### Gravação de taxas em lotes

- Worker ativo no ambiente dedicado expôs até 1.758 queries por job de taxas, com uma inserção por dia. Escrita agora usa lotes de até 1.000 registros e retorna somente datas alteradas.
- Datas repetidas preservam semântica sequencial: primeira entrada no modo insert-only, última na coleta com correção. Valores iguais não alteram timestamps; primeira data alterada continua determinando recálculo.
- `performance/validate-rate-batches.ts` confirmou equivalência com SQL sequencial, rerun sem mudanças e preservação de timestamps, com rollback integral no banco dedicado. Medição do worker atualizado ainda pendente.

### Cobertura de taxas calculada uma vez

- Com histórico de taxas preenchido pelo worker, dashboard atingia timeout SQL de 15 s. Consulta `referenceRateAveragesSql` repetia verificação de cobertura de dez anos após join/agregação das taxas. CTE de cobertura agora materializada uma vez.
- Validador comparou SQL anterior em janela curta e confirmou janela completa/gap com médias determinísticas, em 73,7 ms e 46,9 ms. Remoção de eventos de cobertura foi revertida integralmente. EXPLAIN ANALYZE BUFFERS em `backend/performance/rate-coverage-0018.json`.
- Timeout original mantido. Próximo: reexecutar HTTP com worker atualizado e registrar backlog/queries dos jobs em lote.

### Validação com worker ativo

- Suite backend de integração completa passou: 45 testes, em serviços descartáveis locais. Inclui parser PDF, cache, sessões, regras financeiras e RabbitMQ. Hooks também validaram tipos e suite unitária nas mudanças de fonte.
- Comando válido de taxas de 01/01/2020 até 03/10/2026 concluiu com oito queries e 65,8 ms; confirmação `completed` do consumidor conferida. Amostra anterior de cinco queries era retry por intervalo inválido e foi excluída da evidência de sucesso. Relatório `worker-verification-0018.json`.
- Diagnóstico HTTP com worker ativo segue reprovado: dashboard frio p95 3.528 ms, até 3.688 queries; transações frias 202 ms, mas hits/304 ainda fazem SQL durante invalidações. Relatório `worker-active-diagnostic-0018.json`.
- Nova configuração monetária padrão USD exige conversões do fixture BRL. Provedor de moedas permanece bloqueado no ambiente local e precisa de fixture própria; consultas por data e jobs repetidos de câmbio exigem batching e invalidação por mudança efetiva. Esses cenários não constituem infraestrutura saudável nem foram aprovados.
- Próximos: fixture de câmbio, leituras históricas em lote, jobs sem invalidação vazia, guest/IndexedDB e matriz oficial.

### Demanda pontual de câmbio

- Cotação atual deixou de ser solicitada por mera presença de moeda em transação histórica. Backend deriva demanda atual de valores não zero; guest deriva posições de saldos e movimentos não zero, com deduplicação por moeda/data.
- Projeção backend ignora empréstimos pagos, recorrências sem configuração/encerradas e metadados sem valores. Projeção guest ainda exige revisão da seleção prévia de moedas.
- Regressão: mil movimentos BRL e dois USD no mesmo dia antigo exigem uma cotação histórica, nenhuma cotação atual e nenhuma coleta de previsão. Cenário sem valor estrangeiro exige zero cotações.
- Próximo: jobs de taxas apenas para lacunas comprovadas, incluindo histórico salvo antes das unidades de coleta; completar seleção de demanda de projeção guest.

- Motor financeiro também deixa de pedir fatores para contas zeradas, movimentos zerados e reservas vazias durante consumo. Transferências futuras ainda incluem moedas das contas envolvidas. Dez testes do motor financeiro passaram.

### Coleta de taxas somente para lacunas

- Agendamento de CDI/SELIC considera taxas já persistidas e intervalos cuja ausência de publicação foi verificada. Divide janela em trechos cobertos e lacunas; publica somente lacunas, reutiliza unidades existentes e conclui unidades pendentes/falhas já cobertas.
- Worker reconsulta cobertura antes de baixar unidade histórica, inclusive jobs antigos. Comandos explícitos de correção preservam comportamento próprio.
- Prontidão das médias considera datas salvas sem exigir novo download para gerar marcador de cobertura.
- Testes de dez anos com apenas dois dias ausentes produziram um único intervalo; solicitação repetida não republicou. Dias verificados sem publicação não geraram download. Suite de integração completa passou em serviços locais descartáveis.
- Logs `currency-rate-history-fetch` correspondem a câmbio: janela de previsão é 365 dias, não dez anos. Só moeda estrangeira efetivamente necessária deve criar demanda; backlog previamente registrado continua sendo recuperado. Print sem datas/base/origem não comprova se demanda é antiga ou nova.
- Próximos: concluir seleção de projeção guest/cartões, fixture de câmbio e validações oficiais de performance.

### Demanda de câmbio em projeções

- Backend e guest selecionam moedas de recorrências com ocorrências pendentes dentro do horizonte solicitado; cartões também ignoram recorrências encerradas, sem configuração, já materializadas ou sem valor.
- Guest deriva demanda de saldos não zero, parcelas/faturas a vencer, empréstimos não pagos e transações futuras contabilizadas na moeda de lançamento. Moeda original de compra já contabilizada não cria demanda por si só.
- Conta principal e contas envolvidas seguem incluídas quando movimentos futuros precisam delas, preservando transferências, insuficiência de saldo e liquidação de faturas em outra moeda.
- 21 testes direcionados passaram, incluindo recorrências fora do período e movimentos estrangeiros fora do horizonte. Janela de previsão cambial permanece 365 dias conforme regras de negócio; somente demanda efetiva inicia coleta.
- Próximos: fixture de câmbio, batching de leituras, invalidações por mudança efetiva e matriz completa de aceite do plano.

### Corrida de inicialização da moeda

- Causa reproduzida para demanda cambial nova em contas BRL: painel e gráfico consultavam dashboard com USD provisório antes de carregar preferência explícita BRL. Essa conversão temporária podia registrar coleta de previsão por 365 dias.
- Consultas consolidadas agora aguardam preferência resolvida para o proprietário atual; skeleton permanece até resolução. Cache já inclui moeda na chave.
- Regressão no navegador: sem guarda, duas consultas USD aconteceram enquanto preferência BRL estava bloqueada. Com guarda, zero consultas antes da preferência; painel e gráfico usam somente BRL após resolução, sem demanda de histórico cambial.
- Três testes de navegador passaram, incluindo localização/troca/persistência de preferência e herança de moeda em formulário. Build frontend passou. Todas as requisições externas foram interceptadas; nenhum serviço compartilhado foi alterado.
- Jobs de câmbio previamente registrados continuam recuperáveis; print sem datas/base/origem não identifica individualmente a idade da demanda. Dez anos correspondem apenas a CDI/SELIC; câmbio projetado usa 365 dias.

## Retomada aprovada - 2026-10-09

Complementar cobertura de ações e concluir etapas pendentes deste plano. Prioridade: confirmação de salvamento de compras, persistência por diferença, apresentação restrita à compra solicitada e espera de lock limitada a 250 ms com fallback sem publicação. Confirmar resultado persistido sem aguardar recargas derivadas; fluxos dependentes aguardam leitura explicitamente.

Diagnóstico estático: saveCreditBook regrava histórico integral e sincroniza dívidas por compra; respostas de mutação apresentam livro inteiro antes de filtrar; lock distribuído espera até 30 segundos; frontend aguarda invalidação/refetch para confirmar. Causa dos 20 segundos exige baseline instrumentado, não inferência por contagem SQL.

Suíte deve incorporar escritas/jornadas, validação do próprio executor, fontes externas locais simuladas, métricas obrigatórias e cobertura sem falso positivo. Manter metas existentes, três rodadas de pelo menos 25 amostras, cargas 1/5/20 e fixtures 10/10 mil/100 mil. Relatórios parciais não encerram aceite global.

Progresso da retomada:

- [x] Revisar plano e identificar caminhos compartilhados de espera/regravação.
- [x] Capturar baseline e corrigir cache, persistência e confirmação frontend.
- [ ] Ampliar runner e testes de performance para escritas e jornadas.
- [ ] Executar matriz, corrigir demais violações e registrar antes/depois.
- [ ] Validar plataformas disponíveis e encerrar aceite somente com cobertura integral.

Próxima etapa: validar fallback de cache e persistência incremental contra regressões financeiras e fixture dedicada. Alteração preexistente em packages/sql/migrations/app/refs/db.json permanece fora dos commits.

### Confirmação de escrita e diagnóstico da retomada

- Persistência incremental e lock de 250 ms versionados em `5c35b11f`. Diagnóstico local com 10 mil transações: criação passou de 2.739-2.747 consultas de negócio e 6,87-11,26 s para 46 consultas e 193-881 ms. Cinco amostras, sem aceite oficial.
- Frontend invalida imediatamente e confirma escrita sem aguardar refetch. Conteúdo anterior permanece montado; opção `awaitRefetch` atende fluxos dependentes. Seis testes de cache passaram.
- Navegador release mediu resposta, confirmação e dados atualizados separadamente. Rodada concorrente reprovou: p95 confirmação 2.529 ms, atualização 3.796 ms. Resultado exige repetição sem builds/testes concorrentes e investigação dos spans.
- Plano permanece aberto; cobertura e plataformas incompletas não constituem aceite global.

### Redução adicional do trabalho financeiro

- Planos de parcelas persistidos em lote; criação em 48 vezes passa de 93 para 46 consultas de negócio no diagnóstico. Materialização indexa ocorrências/reembolsos em memória; replay não atualiza totais iguais.
- Reparcelamento apresenta somente compra original e substitutas. Contrato preserva formato; histórico não relacionado deixa de compor resposta.
- Snapshot de sincronização troca uma consulta de rateio por transação por leitura em lote. Auditoria identificou esse crescimento linear com histórico; cenário HTTP específico incluído na suíte em desenvolvimento.
- Regressões financeiras e executor passaram. Integração completa em execução local descartável. Metas de latência ainda exigem medição isolada; rodada concorrente permanece reprovada.

### Executor e investigação de importações

- Executor consolidado: destinos dedicados, redirects recusados, seleção validada, fixtures/câmbio fixos, três rodadas de 25 amostras e cargas 1/5/20, percentis por ação, SQL total/auth/negócio e associação de spans/CPU/event-loop/memória. Métrica ou ação obrigatória ausente impede aprovação.
- Cobertura HTTP ampliada para 26 cenários, incluindo pagamento, sync e parsing/revisão de mil registros. Inventário de rotas/telas/jornadas continua expondo pendências. Matriz oficial ainda não executada.
- Diagnóstico revelou descarte de extrato com 1.004 queries e fatura com 2.006 queries; revisões sem aplicação agora são descartadas em lote, e fatura evita procura de alvo sem registro externo. Consultas de tags/rateios usam arrays SQL; duplicação tem índice por data/valor e identidade externa.
- Relatório sanitizado `backend/performance/reports/purchase-retomada-0018.json` preserva baseline e primeira correção. Diagnóstico do navegador incluía overhead do Playwright; medição foi corrigida para clique/DOM na própria página e exige repetição.
- Suite completa de integração passou após batching de parcelas/sync. Mudanças posteriores em revisão externa precisam nova regressão. Android sem adb, desktop sem tauri-driver e iOS indisponível nesta máquina Linux: aceite nativo pendente.

### Navegador release e contratos dos cenários

- Navegador mede clique até confirmação no DOM, resposta e recarga separadamente, long tasks e navegação pelos oito módulos principais. Três rodadas de 25 amostras na execução oficial; diagnóstico reduzido nunca aprova aplicativo.
- Catálogo de moedas autenticado envia cookies; visitante evita chamada ao endpoint autenticado. Navegação acusa respostas de negócio inválidas em vez de ocultá-las.
- Diagnóstico após correções: pagamento de empréstimo p95 192 ms, evento de dívida 172 ms, parsing/revisão/descarte de fatura com mil itens 5.984 ms agregado. Orçamento de parsing é 30 s, revisão/descarte mantêm 1 s. Necessário repetir relatório após ajuste desses orçamentos.
- PDF retorna página de 50 itens e contador de mil pendências; suíte verifica paginação em vez de exigir mil itens na resposta.

- Descarte de extrato após batching: cinco consultas, 89-188 ms em cinco amostras. Caso extremo com mil lançamentos iguais retorna 29,7 MB de candidatos a duplicação e ainda reprova revisão (<1 s); preservado como `statementImportDuplicates`, sem esconder violação na fixture normal.
- Matriz recusa porta API ocupada, usa health público, encerra processos próprios ao interromper e retorna falha quando inventário global permanece incompleto. Revisão/descarte não herdam orçamento de 30 s do parser.

- Spans do extrato normal ainda identificaram SELECTs com cerca de 13 s. Busca de referências externas trocada de milhares de condições para `ANY` parametrizado. Regressão de descarte em lote corrigida: fixture deve criar revisão concreta, não estado BANK_PENDING sem item de revisão.

### Captura de referência após redução de consultas

- Cinco amostras por ação, histórico de 10 mil transações e release local, sem builds simultâneos. Criação simples p95 341 ms; edição 315 ms; 48 parcelas 315 ms; reparcelamento 361 ms. Até 49 queries de negócio, sem regravação do histórico integral.
- Extrato normal com mil itens: parsing p95 3.040 ms/25 queries; revisão 843 ms/16 queries; descarte 118 ms/5 queries. Cenários passaram seus orçamentos nessa rodada diagnóstica.
- Relatório sanitizado `backend/performance/reports/financial-actions-reference-0018.json`. Não substitui três rodadas, cargas 1/5/20, históricos completos e plataformas.
- Executor usa mesmo cálculo de percentis para leituras/escritas, exige spans e campos numéricos completos. Antecipação de empréstimo e avanço/replay de recorrência acrescentados; validação real ainda pendente.

### Leitura derivada após escrita persistida

- Seis listagens principais preservam dados e componentes montados quando recarga falha. Status compartilhado informa atualização pendente/erro e oferece retry com feedback; erro inicial ainda mostra estado de falha completo.
- Revisão React: sem novos efeitos ou estado derivado; consultas permanecem nos consumidores; componente de status separado; scopes de mutação e navegação preservados.
- Regressão no navegador provoca falha de GET após POST bem-sucedido e exige confirmação persistida, cartão ainda visível e retry. Execução exige build atualizado; pendente enquanto diagnóstico IndexedDB está ativo.

- Rateios do snapshot usam `ANY` também para participantes e pessoas, evitando expansão de milhares de condições no SQL. Regressão completa em banco descartável em execução.

### Storage visitante

- Diagnóstico real em Chromium reprovou leitura integral de 100 mil registros: 7.328 ms; fixture levou cerca de 11 minutos para concluir. Índices simples `syncedAt`, `modifiedAt` e `deleted` não têm consumidores e foram removidos na versão 16.
- Teste de upgrade v15 preserva registro e migração financeira concluída; mantém isolamento e exclusão estrita de `modifiedAt === since`. 14 assertions passaram. Remoção de índices exige nova medição, não resolve por inferência o custo de leitura integral.
- Navegação inicial e confirmação de compra também reprovaram na rodada anterior; artefatos mantidos em `/tmp/zaimu-browser-performance`, sem aceite global.

### Registro de demanda cambial

- Trace do dashboard identificou 1.916 queries e 10.760 ms no primeiro pedido de histórico cambial. Unidades de 365 dias, vínculos, cobertura e geração agora usam operações em lote; outbox recebe eventos em lote na mesma transação.
- Regressão dedicada cobre 730 unidades de duas moedas, dia previamente coberto, repetição sem republicação e rollback após falha de publicação. Builds backend/frontend passaram; integração e nova medição pendentes.
- Integração anterior completa passou, incluindo regressão de descarte de revisões externas; executor passou 15 testes/68 assertions.

- Batching cambial validado pela integração completa e hooks. Matriz valida socket Docker local antes de qualquer operação e usa volume dedicado em disco para não consumir RAM com dois milhões de transações. Relatórios registram memória livre e carga no começo/fim.
- Navegação e atualização após compra passam a medir frame/DOM dentro do navegador. Espera de observação pode durar 60 s sem alterar orçamento de 1 s; falhas de performance continuam reprovadas.

### Sugestões de transferência

- Navegação real encontrou bloqueio de CPU em `GET /transactions/transfer-suggestions`: 296.236 ms, duas queries e 205 s de CPU com histórico de 10 mil. API deixou de responder até health enquanto comparava todos os pares.
- Comparação agora indexa data/valor/tipo/minuto, elimina horários ausentes e só verifica buckets compatíveis. Preserva limite de 60 segundos, ordem, contas distintas e rejeições. Regressão cobre 10/10 mil/100 mil registros.
- Endpoint entra no orçamento frio/quente/304 e usa geração existente de `transactions:list`, invalidada também por aceitação/rejeição. Nova medição pendente.

- Caso denso com 100 mil horários iguais na mesma conta também evita todos os pares por agrupamento de conta. Hooks de tipos/unidade passaram no comparador.
- Navegação identificou HTTP 401 no progresso cambial: leituras de histórico e médias de juros não enviavam cookies quando frontend/API tinham origens distintas. Ambas passam a enviar credenciais; regressão de navegação exige zero respostas de negócio com erro.

- WebKitGTK 2.54.1 acessível via GI, embora tauri-driver não esteja instalado. Diagnóstico separado prepara contexto ephemeral, bloqueia rede externa por proxy local e mede oito rotas visitante. Não equivale a aceite Tauri/mobile; histórico grande e long tasks continuam explícitos.
- Relatório JSON do Playwright conserva falhas mesmo quando cenário termina antes de produzir métricas.

- Repetição release: sugestões caíram de 296.236 para 1.908 ms (duas queries), removendo bloqueio global. Lookup também passa a excluir horários nulos no SQL, pois jamais compõem sugestão válida. Nova captura pendente; meta de 1 s não foi relaxada.
- Regressão real de POST bem-sucedido seguido de GET 500 passou: confirmação permanece visível, cartão continua montado e retry recupera leitura.

- Fixture de navegador usa `accountName`, campo real do contrato do cartão; observador de confirmação encerra após resultado. Diagnóstico WebView também recusa execução encerrada com rotas ausentes.

### Jornada de autenticação

- Executor inclui login, sessão com validação de titularidade, logout e leitura anônima. Cookies ficam privados e separados da identidade original da fixture; erro de titularidade encerra sessão criada.
- Executor passou 17 testes/81 assertions, incluindo limpeza e ausência de cookies nos relatórios. Medição real dessa jornada ainda pendente; signup/reset/revogação não estão cobertos por esse cenário.

### Evidência WebView e relatórios interrompidos

- WebKitGTK 2.54.1 executou oito rotas visitante vazias: cartões 817 ms, transações 932 ms, recorrências 518 ms, empréstimos 507 ms e ajustes 716 ms. Contas 1.061 ms e dívidas 1.005 ms reprovaram; dashboard terminou sem heading/prontidão após 60 s. Relatório versionado conserva timeout e ausência de long tasks.
- Diagnóstico Chromium de compra foi interrompido na recarga entre amostras. Harness agora conserva métricas parciais em finally, exige quantidade completa e permite 60 s de observação sem alterar meta de 1 s. Reexecução ainda necessária.

### Demanda cambial repetida

- Upsert diário regravava unidades existentes mesmo sem alteração. CTE insere somente ausentes e reúne unidades já existentes sob advisory lock por série. Cobertura nova e agendamento continuam reavaliados.
- Regressão PostgreSQL passou: 730 unidades/11 queries, 729 publicações únicas, xmin de todas as unidades preservado na repetição e rollback em falha. Integração completa ainda em execução; nova medição HTTP necessária.

### Referência de autenticação e confirmação visual

- Integração backend completa passou após CTE cambial; todos os hooks dos três commits locais passaram. Alteração preexistente em migrations/app/refs/db.json preservada.
- Autenticação real: cinco ciclos sem erros/identidade divergente; login p95 1.177 ms reprova, sessão 81 ms, logout 162 ms, sessão anônima 41 ms. Bcrypt custo 12 mantido. Orçamento por ação preserva reprovação que percentil agregado não demonstra.
- Chromium release: cinco compras concluídas e removidas; zero erros de página, confirmação DOM p95 1.609 ms e dados utilizáveis 3.079 ms. Long tasks 615-1.437 ms acumulados por amostra. Meta de 1 s continua reprovada; host compartilhado e matriz oficial pendente.
- Relatório sanitizado auth-browser-reference-0018.json registra resultados completos e limites. 0018/0012 permanecem abertos; cobertura integral, crescimento oficial 10/10k/100k, falhas Redis/carga mista/workers e plataformas ainda não têm evidência completa.

### Retomada da matriz oficial

- Primeira execução oficial com 20 identidades abortou preparação: logins compartilhavam IP e receberam HTTP 429. Executor passa IP local simulado por identidade, preservando limites de autenticação.
- Jornada HTTP de sugestão cria duas transações com horário no limite de 60 s, exige sugestão, rejeita e verifica invalidação; limpeza remove ambos os lançamentos e conta mesmo após falha. Executor passou 18 testes/84 assertions.
- Parsing volta ao orçamento original de 15 s do 0018; limite de 30 s fica exclusivo ao snapshot sync. Rodada oficial precisa repetir após correção da preparação.

### Projeção com calendário por combinação distinta

- Rodada oficial interrompida após descobrir GET dashboard com 78 queries e até 10.947 ms em fixture de dez transações. Autenticação/carga fria continuam reprovadas e relatório parcial preservado em /tmp/zaimu-performance-matrix-corrected.
- Contexto de juros deduplica associação por moeda e calendário por país/ano. Mesmas funções transacionais mantêm fontes, overrides, advisory locks e disponibilidade; quantidade de contas deixa de multiplicar registro idêntico.
- Três regressões/15 assertions passaram, com 10/10k/100k contas, anos duplicados, país ausente, cobertura incompleta e falha de registro. Build, integração e nova captura release pendentes.

### Renderização da grade de cartões

- Grade passa a componente memoizado com dados e callbacks estáveis. Abrir/fechar modal e alterar estado pendente da compra deixam de recriar controles e modais de edição de todos os cartões.
- Busca de conta por cartão usa Map; ordenação e filtros permanecem derivados dos dados. Sem novos efeitos, sem atualização otimista de valores financeiros e sem mudança no escopo de pending.
- Revisão React aplicou memo na fronteira cara, manteve queries compartilhadas no consumidor comum e callbacks tipados. Build e medição release ainda necessários.

### Recuperação de medições interrompidas

- Encerrar runner com SIGTERM durante matriz perdia agregados concluídos, embora logs HTTP permanecessem. Journal JSONL registra início e término de cada grupo uma vez, com escrita fora da latência medida.
- Leitor conserva grupos concluídos e cenário pendente; cauda incompleta fica explícita. Namespace, objetos, ordem e duplicação são validados. Recuperação sempre reprova aceite e identifica ausência de relatório/telemetria completos.
- Executor passou 22 testes/102 assertions, incluindo arquivo real, erro de storage e corrupção. Hook de calendário passou unidade completa; build backend isolado passou. Captura release após correções permanece pendente.

### Fixtures de contas e evidência após calendário

- Criação de conta auxiliar e cenários de conta/transferência passam país explícito, exigido pelo contrato; preferência ausente da fixture não pode provocar HTTP 400 antes da medição. Regressão verifica país no request.
- Diagnóstico real: sugestão/rejeição p95 242 ms, conta 172 ms, transferência 85 ms; cinco amostras por cenário, sem erros, titularidade e limpeza preservadas. Relatório transfer-country-reference-0018.json não constitui aceite global.
- Dashboard após deduplicação ainda reprova: frio p95 25.576 ms/68 queries; quente 101 ms e 304 75 ms com uma query total. Host tinha load average próximo de 32, impedindo comparação sob infraestrutura saudável; custos de projeção e fallback precisam investigação adicional.
- Executor passou 22 testes/103 assertions. Matriz oficial e medição frontend release continuam pendentes.

### Tela de cartões após evolução dos contratos

- Carga inicial passa a usar /financial-accounts/options, projeção explícita de identificação, nome, tipo, moeda, visibilidade e nome da instituição. Uma consulta, sem cálculo de saldos, replay, políticas de juros ou snapshots legados. Namespace de contas preserva invalidação e isolamento; cache de opções não substitui snapshot financeiro local.
- Grade não depende mais de contas completas. Edição busca apenas conta selecionada no clique; formulário de criação monta ao abrir. Catálogo de instituições deixa de carregar em cada formulário fechado. Opções visitante vêm diretamente dos registros locais, sem replay de saldos.
- Integração verifica ownership, cartões escondidos, campos exatos e uma consulta. Cenário de performance dedicado exige frio abaixo de 1 s/uma query e quente/304 abaixo de 100 ms/zero SQL. Regeneração SDK usa exportador backend e Kubb, sem edição de código gerado. Validação em andamento; não constitui aceite global.
- Sugestões de pagamento dispensam tags/rateios do livro e usam cache por usuário/data, com invalidação existente de cartões. Teste release registra paths iniciais, exige ausência de contas completas/catálogo de instituições e verifica detalhe apenas após clique em editar.

- Opções da tela filtram CREDIT_CARD no SQL e no storage visitante; poupança, dinheiro e recompensas nem entram na resposta inicial. Regressão inclui conta de dinheiro do mesmo dono para garantir corte por tipo.
- Primeiro smoke de navegador parou em autenticação HTTP 503 por orçamento Redis, com host em load average ~64. Integração das opções passou (5 assertions); transferências passaram 13 casos/54 assertions. Restante da integração encontrou @prisma/cli ausente no worktree, corrigido por dependência local. SDK do primeiro hook foi interrompido após mais de nove minutos sem concluir; gates serão repetidos integralmente.

- Diagnóstico HTTP local, cinco amostras/um usuário/dez transações: opções frias p95 292 ms/uma query de negócio; quente 22 ms e 304 20 ms/zero SQL total. Relatório sanitizado cards-context-reference-0018.json conserva amostras, spans, recursos, cobertura incompleta e reprovação global.
- Comparação de payload na mesma fixture: listagem integral 4.739 bytes/três contas/30 campos; opções 293 bytes/dois cartões/seis campos, redução de 93,8%. Tempos dessa comparação são MISS contra HIT e não representam ganho controlado de latência.
- Build backend e release frontend passaram após exportação e geração SDK atualizadas. Dois testes Chromium (1440×900 e 390×844) passaram leitura mínima, carregamento de detalhe no clique, erro/retry e descarte. Dez capturas finais inspecionadas em /tmp/zaimu-cards-browser-results; mensagem de erro agora ocupa linha própria e preserva botões.
- Integração ampla detectou divergência preexistente: normalized-refunds espera bloquear excesso de reembolso, enquanto implementação/migração atuais o permitem; docs/business-rules.md ainda descreve bloqueio. Assertion falha antes da remoção do trigger de replay e contamina casos seguintes. Nenhuma regra financeira alterada nesta correção; aceite financeiro/global permanece pendente.

### Inventário após mudanças de contratos

- Inventário anterior continha 145 rotas/22 telas. Varredura por nome de arquivo omitia preferências e health e registrava /comparison sem prefixo /dashboard. Geração agora exporta declarações e lê os caminhos realmente montados: 219 operações OpenAPI, dez ações Better Auth e 29 telas.
- Fingerprint das fontes, telas, gerador e orçamentos impede execução de acceptance/matriz com inventário antigo. Checagem ocorre antes de conexão/preparação. Exportação permanece local, sem executar endpoints. Quatro testes/20 assertions passaram para prefixos compostos, módulos auxiliares, configuração vazia/inválida, alteração de fontes e cobertura parcial.
- Relatório de cartões atualizado com inventário atual; rotas ausentes de cenários continuam pendentes e bloqueiam aceite global. Regra recente no final de business-rules permite crédito excedente; alinhamento dos testes antigos e isolamento do trigger de rollback estão em validação separada.

### Regressões financeiras com contratos atuais

- Testes normalizados permitem créditos concorrentes acima do principal, conforme regra recente já implementada. Rollback compara snapshots completos dos reembolsos e política institucional; trigger de falha sempre é removido em finally.
- Casos HTTP mantêm rejeição por cronologia inválida; seleção de antecipação prepara parcelas materializadas antes de consultar. Evidência de reembolso importado conserva parcelas e crédito integral, sem exigir cancelamento automático removido pela regra mais recente. Trechos antigos contraditórios do documento foram sincronizados.
- Finance compartilhado passou 65 testes/299 assertions; executor de performance passou 25 testes/119 assertions. Integração normalizada passou 17 de 18 casos: aprovação de 125 compras excedeu timeout funcional de 30 s em host com load average ~16. Orçamento mantido; consultas auxiliares por item estão sendo investigadas antes de repetir aceite.

### Aprovação de importações e persistência alterada

- Aprovação ainda consultava rateio, identidade, origem Open Finance, política de recompensa e revisões por item. Contextos agora carregam em lote; política/cotação são reutilizadas somente dentro da transação por cartão, dono, moeda e data. Alias bancário mantém detecção de conflito e rollback atômico.
- Persistência reúne compras, planos, parcelas e referências alteradas em lotes de até 500 linhas; tags iguais compartilham operação. Titularidade é validada por conjuntos. Compras realmente novas sem rateio/vínculos não fazem buscas e limpezas de dívida vazias; compras existentes e vínculos transferidos preservam reconstrução.
- Reconciliação de pagamentos deixava todas as faturas com novo updatedAt a cada chamada. Atualiza somente valores alterados, numa instrução. Regressão compara xmin de todas as faturas e exige preservação em replay sem mudança.
- Aprovação de 125 compras caiu de 1.556 para 189 queries após agrupamento. Regressão ampliada para mil compras passou com 166 queries/limite 200, preservando rollback e timeout funcional de 30 s; aprovação medida em 9.456 ms, SQL 6.627 ms. Uma amostra funcional não representa p95 nem aceite de latência. Relatório import-approval-context-0018.json conserva diferenças de fixture e limitações.
- Integração final completa passou 157 testes/1.518 assertions em 21 arquivos, incluindo 19 casos normalizados. Unidade backend passou 658 testes/2.051 assertions; hooks de tipos, cobertura, lint e formatação passaram. Build backend final passou; inventário regenerado após as correções automáticas. Matriz oficial e plataformas permanecem pendentes, sem aceite global.

### Jornadas de aprovação e reconciliação de fatura

- Executor acrescenta aprovação de mil compras e reconciliação explícita com compra existente. Cartão exclusivo por amostra evita alterar fixture-base; remoção da conta em finally limpa também importações aprovadas e livro materializado. Preparação/limpeza não entram na latência das ações.
- Leitura posterior exige preservação de identidade na reconciliação, valores/descrições distintos, quantidade de compras e principal integral nas parcelas. Orçamento de aprovação/reconciliação continua 1 s; parsing mantém 15 s.
- Testes controlados cobrem lote e falhas de identidade, principal, aprovação e limpeza. Hooks normais passaram. Primeira captura release falhou antes dos cenários por HTTP 503 na autenticação/orçamento Redis, com load average ~60.
- Captura corrigida da reconciliação concluiu cinco amostras sem erros financeiros: parsing p95 2.571 ms/76 queries, reconciliação 1.359 ms/56 queries, aprovação 2.651 ms/141 queries, leitura 1.285 ms/13 queries. Metas CRUD permanecem reprovadas. Alvo manual é criado após parsing para evitar reconciliação automática.
- Aprovação de mil itens excedeu deadline de 60 s; limpeza/preparação seguintes sofreram timeout SQL e espera de lock. Relatório invoice-journeys-reference-0018.json conserva falhas, amostras e recursos; host sobrecarregado impede atribuir regressão ou ganho por tempo. Investigar persistência/locks em ambiente estável antes de nova matriz. Nenhum aceite global inferido.

### Moeda padrão sem SQL nas leituras quentes

- Dashboard e comparação resolviam moeda antes do cache, causando uma consulta mesmo em HIT/304. Resolução agora ocorre somente dentro do loader; chave distingue header de localização e versão do contexto. Preferência usa namespace currencies:preferences por usuário; fallback por localização continua fora do valor armazenado. HIT/304 também dispensam consulta ao cache auxiliar de moeda.
- PATCH de preferência passa pela transação/fence/outbox existentes e invalida preferência e dashboard. Sync global também invalida preferência. Leitura durante gravação ignora cache; rollback não publica moeda não confirmada.
- Integração dedicada passou três testes/16 assertions: uma consulta fria, zero consultas quentes, isolamento entre usuários, fallback USD, invalidação do dashboard, commit e rollback. Hooks de tipos, unidade/cobertura, lint e formatação passaram. Integração ampla passou 95 casos e parou em uma falha de abertura de conexão Redis no teste de autenticação; restante não executado. Build e geração OpenAPI/SDK passaram. Matriz continua pendente.
- Manifesto obrigatório passa a registrar também testes das jornadas de fatura, executados anteriormente pela suíte isolada de performance.

- Comparação ganha cenário HTTP próprio, com frio/quente/304 e mesmas metas do dashboard. Primeira captura desta retomada, sob carga alta, não publicava cache após esgotar orçamento Redis e foi interrompida; não representa aceite nem comparação controlada. Regeneração OpenAPI/SDK passou, sem alteração de contrato público.

- Captura release após mover resolução para loader confirmou dashboard quente p95 24 ms e 304 15 ms, zero SQL total; comparação quente 17 ms/zero SQL. Cenário novo detectou 304 da comparação virando HTTP 422 por validação do wrapper de status. Retorno passa a definir set.status=304 e retornar null, conforme demais rotas. Nova captura pendente. Frio continua reprovado (5.099 ms/46 queries no dashboard, 2.534 ms/44 queries na comparação), sem comparação controlada com diagnósticos antigos.

- Captura final após correção do 304: comparação quente p95 21 ms e 304 52 ms, ambos com zero SQL total e status corretos; dashboard 304 50 ms/zero SQL. Grupo quente do dashboard reprovou (11.763 ms/44 queries) por fallback Redis durante carga alta; frio reprovou nas duas rotas (16.406 ms/46 queries e 5.084 ms/44 queries). Relatório dashboard-currency-cache-reference-0018.json inclui amostras, telemetria, host e leitura intermediária em HIT. Nenhum resultado desfavorável removido do aceite.

### Índice diário de rendimentos no replay

- Perfil de cinco GETs frios identificou conversões repetidas de datas nas buscas de rendimentos por dia. Fixture de dez transações também contém 1.826 rendimentos, de 2021 a 2026. Pesos brutos do profiler incluem idle do pool; diagnóstico usa amostras ativas/callsites, sem atribuir tempo ocioso ao cálculo.
- Replay conectado agrupa rendimentos por dia uma vez. Mantém ordem original, manual excluído bloqueando automático e primeira ocorrência automática; feriados continuam escolhendo primeira ocorrência automática não excluída.
- Unidade passou 29 testes/41 assertions, incluindo limite linear de leituras de data para 10/10 mil/100 mil registros e precedência em fim de semana/dia útil. Captura anterior sem profiler: 4.288 ms, 205 ms SQL, 46 queries; corpo preservado para comparação integral. Validação release após índice e aplicação equivalente no visitante em andamento.

- Visitante aplica mesmo agrupamento por dia, sem alterar convenção de datas nem ordem dos lançamentos. Regressões combinadas passaram 73 testes/103 assertions: 29 backend e 44 frontend, incluindo 12 combinações de paridade conectado/visitante. Visitante também limita leituras de datas a trabalho linear em 10/10 mil/100 mil registros.

- Builds backend/frontend passaram (Vite com configLoader runner para evitar diretório temporário compartilhado sem permissão). Corpo integral do dashboard antes/depois conserva 180.223 bytes e SHA-256 idêntico. Captura única passou de 4.288 para 2.804 ms, com SQL variando de 205 para 353 ms; não constitui comparação p95 controlada.
- Diagnóstico release de cinco amostras: dashboard frio p95 1.488 ms/44 queries, comparação fria 702 ms/44 queries, contas frias 6.508 ms/7 queries; SQL domina consulta de contas e será investigado separadamente. Quente/304 das três rotas passou com zero SQL; sync p95 1.130 ms dentro de seu orçamento específico. Contagem de queries e demais metas mantidas; sem aceite global. Evidência em yield-day-index-reference-0018.json.

### Compilação SQL da projeção de regras do cartão

- Listagem de três contas gastava 7.814 ms em EXPLAIN ANALYZE, dos quais 7.719 ms compilando JIT/288 funções. Diagnóstico SET LOCAL jit=off em transação somente leitura levou 2,6 ms; nenhuma configuração global alterada.
- Projeção repetia cinco vezes toda resolução do perfil para extrair campos. CTE MATERIALIZED resolve regras uma vez por conta e preserva extração/casts/fallbacks existentes. Mesmo JIT padrão: 181 ms, 81 funções, sem inlining/otimização cara; contagem de contas e contrato permanecem iguais.
- Regressão SQL cobre perfil arquivado padrão, histórico efetivo/futuro, nulos, cashback ausente e taxa zero. Integração e captura HTTP em andamento. Evidência inicial em account-rules-jit-reference-0018.json; orçamento de 1 s e aceite global continuam pendentes.

### Isolamento do orçamento funcional do lote

- Integração detectou teste de mil compras excedendo 30 s porque somava preparação, aprovação com rollback e nova aprovação; Promise continuava após timeout e alterava faturas durante assertion seguinte. Aprovação individual registrada levou 13.833 ms/166 queries.
- Preparação passa ao beforeAll do grupo; rollback e retry da mesma importação têm testes próprios, cada operação com 30 s. Asserções de atomicidade, mil itens pendentes após falha, limite de 200 queries e preservação de pagamentos permanecem. Sem mudança no orçamento de performance de produção. Nova integração pendente.

- Materializar apenas expressão reduziu custo, mas p95 frio ainda ficou em 1.238 ms. EXPLAIN mostrou estimativa de 9.100 linhas na projeção tardia após joins, embora só existam três contas. Materializar contexto das contas antes dos joins levou custo estimado a 232 e execução a 2,8 ms, sem JIT escolhido pelo planejador padrão. Campo interno é removido do JSON; filtro de dono e ordenação preservados. Teste da consulta verifica owner e campos internos ausentes. Captura HTTP final e integração em andamento.

- Auditoria da fixture encontrou CreditCard/RewardsAccount com reltuples=-1: seed analisava somente parte das tabelas e repetia análise a cada usuário. Preparação agora analisa banco dedicado inteiro uma vez, após todas as identidades. Não altera configuração de produção nem encobre regressão da consulta: correção SQL foi medida antes dessa mudança de estatísticas.

- Auditoria da consistência temporal encontrou limite do runner: proxy Date fixa JavaScript, mas SQL CURRENT_DATE continua seguindo relógio real do PostgreSQL. Aceite com relógio fixo entre camadas permanece pendente; diagnósticos anteriores não comprovam essa invariância.

- Preflight agora consulta CURRENT_DATE antes de medir. Execução oficial recusa divergência com data JavaScript; diagnóstico preserva ambas as datas e clock.consistent=false. Não altera relógio/configuração do host ou banco. Regressões cobrem datas diferentes, ausentes, inválidas e diagnóstico explícito.

- Captura HTTP final conserva corpo integral de 4.739 bytes e SHA-256 idêntico. Diagnóstico de cinco amostras passou: contas frias p95 145 ms/7 queries totais, quente 42 ms/zero SQL, 304 35 ms/zero SQL. Host em load average ~23 e integração concorrente; resultado não representa comparação controlada nem matriz oficial. Executor passou 31 testes/131 assertions.
- Captura diagnóstica com auditoria temporal: frio p95 520 ms/7 queries, quente 55 ms/zero SQL, 304 110 ms/zero SQL (reprovado). Datas registradas: aplicação 04/10/2026, PostgreSQL 29/10/2026. Execução oficial recusada antes de medir, exit 1. Ambos diagnósticos permanecem no relatório; sem aceite global. Suíte controlada passou 34 testes/142 assertions.
- Integração ampla final passou 167 testes/1.569 assertions em 23 arquivos: projeções arquivadas, ownership/contexto, preferência/fences/rollback, importação de mil compras com rollback e retry separados, replay sem alteração de xmin, broker/retry/DLQ, Redis e recuperação de rendimentos. Execução finalizou exit 0; metas de latência globais permanecem pendentes.
- Após incorporar commit concorrente de impostos importados, builds backend/frontend, exportação OpenAPI e geração SDK passaram novamente. Inventário atualizado registra 230 operações (220 OpenAPI e dez Better Auth), 29 telas e 18 jornadas. Novas operações continuam pendentes até execução de cenário correspondente.

### Reuso do contexto de rendimentos

- loadYieldAccounts consultava contas, históricos, perfis e políticas antes de carregar novamente esses mesmos dados para replay dos lotes tributários. Agora retorna contas enriquecidas do próprio input do replay, acrescentando somente snapshots de lotes. Catálogo tributário continua carregado antes do cálculo.
- Regressão de integração compara contexto completo, histórico efetivo, país e lotes de duas contas do mesmo usuário; orçamento exige somente uma query adicional (catálogo tributário) sobre loader do replay. Lista vazia exige zero SQL. Validação em andamento após incorporar mudanças concorrentes de instituições.

- Integração após mudanças concorrentes detectou wrapper getImportTaxSources sem operação OpenAPI correspondente. Endpoint já está exportado; seletor passa a usar getCreditCardImportsByIdTaxSources gerado, mantendo codificação do ID e mesma resposta. Wrapper manual duplicado removido. Contrato será verificado novamente antes de aceite.

### Restauração da preferência entre amostras

- Reprodução real do cenário currencyPreference encontrou cleanup HTTP 500 ao restaurar null. Primeira amostra deixava BRL persistido e alterava contexto de moeda de cenários posteriores. DTO já admite null; validação passa a permitir remoção da preferência e manter validação de moedas não nulas.
- Executor também exige que resposta de restauração corresponda ao valor original, incluindo null. Regressão simula servidor que restaura corretamente e servidor que ignora reset mesmo retornando HTTP 200. Captura conectada após correção em andamento.

- Integração com schema e alterações concorrentes atuais passou 172 testes/1.612 assertions em 23 arquivos. Reuso do contexto passou regressão real de orçamento SQL e lotes. Regressões de executor/replay/perfis passaram 122 testes/275 assertions; após reforço de cleanup, executor passou 36 testes/148 assertions. Hooks normais passaram em todos os commits.
- Fixture de dez transações foi reconstruída com seed real e schema atual numa cópia temporária de migrações; referências do repositório preservadas. ANALYZE concluído: FinancialAccount=3, CreditCard=2, RewardsAccount=0. Builds backend/frontend release e OpenAPI passaram; inventário atual contém 231 operações, 29 telas e 18 jornadas.
- Captura após seed: contas frias p95 160 ms, quente 30 ms, 304 10 ms; dashboard frio 1.860 ms e comparação fria 1.721 ms reprovados; quente/304 zero SQL. Primeiras leituras também prepararam calendário/histórico, sem descarte das amostras.
- Preferência: reprodução anterior falhou em cleanup HTTP 500 e deixou BRL no banco. Após correção, cinco amostras concluíram sem erros, p95 de edição 136 ms; consulta independente confirmou preferência null após limpeza. Original null restaurado no banco dedicado antes da reprodução corrigida.
- Fixture recém-semeada não tem preferência e usa fallback USD; corpos preservados da comparação anterior de rendimentos usavam BRL. Falha de cleanup explicava mudança de contexto entre cenários. Não atribuir variação de tempo/queries somente à otimização de replay.
- Captura final preserva reprovações: contas frias p95 981 ms; dashboard frio 4.152 ms/61 queries, comparação fria 1.847 ms/107 queries; comparação quente 172 ms mesmo com zero SQL. Sync p95 3.510 ms dentro de 30 s. Datas continuam divergentes; relógio fixo, matriz oficial, falhas de infraestrutura e plataformas permanecem pendentes. Evidência completa em yield-context-and-fixture-reference-0018.json; nenhum aceite global.

### Calendário preparado sem locks nem gravações repetidas

- Leituras frias repetiam lock e INSERTs por país da moeda, mesmo com associações CLDR completas. Preparação agora verifica todos os intervalos da moeda numa consulta; falta ou versão antiga conserva caminho transacional existente. Não usa cache em memória que possa ocultar exclusões administrativas.
- Cobertura anual atual usa uma consulta sem lock; versão antiga ou cobertura ausente continua com lock, rechecagem e geração. Cobertura administrativa completa e estado indisponível da versão atual permanecem preservados.
- Regressões adicionadas: USD com múltiplos países, orçamento de uma consulta por preparação existente, xmin inalterado, recuperação após exclusão de vínculo/versão antiga, precedência administrativa e indisponibilidade. Integração e diagnóstico em andamento; aceite global permanece pendente.

- Preparação ausente também passa a gravar países, intervalos e moedas em três lotes, sob lock existente; calendário insere feriados em um lote preservando exclusões administrativas. Regressões impõem até sete queries na recuperação de moeda com muitos países e até dez na geração anual, incluindo transação. Quantidade de feriados/países não pode gerar SQL por registro.

### Cotações históricas carregadas em lote

- Dashboard consultava snapshots das duas bases por data histórica. Leitura nova reúne pares distintos em uma consulta; somente pares completos e válidos dispensam fluxo existente. Snapshot da moeda de destino continua obrigatório. Datas/pares ausentes conservam downloads, limites de concorrência e tratamento individual de falhas.
- Prefetch é local à chamada, sem cache global que esconda correções. Falha na leitura em lote retoma caminho anterior; cotação atual mantém data de publicação. Testes e comparação financeira em andamento.

- Calendário validado em integração completa: 175 testes/1.629 assertions; versão com lote de câmbio: 176 testes/1.633 assertions, 23 arquivos, zero falhas. Unidade direcionada: 17 testes/62 assertions, incluindo 10/10 mil/100 mil demandas, destino ausente, snapshots alterados entre leituras e fallback após falha. Hooks normais e build release backend passaram.
- Mesma fixture dedicada, sem seed nem alteração de preferência: base/calendário/calendário+câmbio retornam corpos completos idênticos por SHA-256. Última captura manteve checksums e quantidades de transações/compras/faturas antes/depois das leituras. Algoritmo do checksum antigo não foi preservado; não alegar equivalência de checksums persistidos entre todas as etapas.
- Diagnóstico de cinco amostras: dashboard frio base 2.055 ms/63 queries, calendário 2.168 ms/53, calendário+câmbio 1.577 ms/52. Comparação fria: 772 ms/107, 978 ms/97, 483 ms/50. Calendário isolado não demonstrou redução consistente de latência. Quente/304 finais com zero SQL e p95 abaixo de 100 ms. Dashboard frio e ambos os orçamentos SQL seguem reprovados.
- Evidência versionada em `backend/performance/reports/calendar-and-currency-batch-reference-0018.json`, com amostras, telemetria, ambiente, hashes e limitações. Inventário regenerado: 231 operações/29 telas/18 jornadas. Aceite global permanece falso: relógio PostgreSQL divergente, matriz oficial, cobertura integral de ações, falhas de infraestrutura, navegador e plataformas ainda pendentes.

### Restauração direta de fatura no frontend

- Relato de requests sequenciais `statements?limit=100` na tela de cartões reproduziu caminho de link antigo com `statement` sem `card`: frontend percorria cada cartão e paginava seu histórico até localizar a fatura. Novo endpoint resolve somente `creditCardId` por ID da fatura e titular autenticado, sem replay, paginação nem apresentação financeira.
- Frontend passa a fazer uma consulta de dono, valida cartão contra lista visível e abre somente histórico do cartão selecionado. Visitante consulta registros locais da identidade atual. Link com `card` continua dispensando resolução. Regressões de quantidade constante, ausência e erro adicionadas; HTTP/SDK/browser em validação.

### Retomada da validação de proprietário da fatura (08/11/2026)

- Endpoint validado com quatro cenários HTTP: sessão obrigatória, proprietário correto, ID ausente e fatura de outro usuário. Consulta autenticada exige exatamente uma query de negócio, separada da autenticação. Todos passaram também na repetição com serviços exclusivamente locais descartáveis.
- SDK regenerado e tipos de backend, frontend, SQL e finance aprovados pelo hook. Build release frontend aprovado. Fixture de navegador atualizada para fornecer o calendário exigido pelo bootstrap; capturas dos modais usam o próprio dialog para não omitir portais em screenshots de página inteira.
- Cenários de navegador passaram em 1440 e 390 px: lista sem históricos, lookup único, loading, abertura somente do cartão selecionado, ausência, erro e nova tentativa. Capturas inspecionadas em `/tmp/zaimu-owner-browser/`. Devido a ERR_NETWORK_CHANGED/ECONNRESET da máquina, a execução final forneceu os assets do mesmo build diretamente por interceptação Playwright em um script temporário; APIs permaneceram simuladas. Isso valida comportamento e apresentação, não latência de rede nem aceite de performance.
- Suíte ampla de integração não foi aprovada: a execução local avançou sem falhas de asserção até falhar preparando outro banco descartável por ECONNRESET. Primeira tentativa herdou URLs DEV do ambiente; repetição explicitou URLs vazias para Postgres/RabbitMQ e Redis dedicado em loopback. Não usar a tentativa herdada como evidência de ambiente local isolado.
- Merge de atualização passou tipos e testes do hook, mas o lint bloqueou exclusivamente no `turbo.jsonc` já presente na main (trailing commas). Esse merge usou a exceção documentada para falha preexistente; o commit da fixture passou todos os hooks normalmente. Logs locais: `/tmp/zaimu-owner-merge-hook.log`, `/tmp/zaimu-owner-local-integration-2.log`, `/tmp/zaimu-owner-static-final.log`.
- Esta entrega conclui a restauração direta de fatura. Plano 0018 permanece aberto: relógio PostgreSQL, leituras frias, matriz oficial, cobertura integral e plataformas nativas continuam sem aceite global.

### Relógio operacional do benchmark continua avançando

- Auditoria da retomada encontrou `Date.now()` congelado pelo proxy global. Isso distorcia idade do cache, TTL de sessões e qualquer deadline baseado no relógio civil, enquanto Redis e PostgreSQL continuavam avançando.
- Ambiente e profiler passam a instalar relógio deslocado: inicia no instante da fixture e avança por `performance.now()`, preservando construção explícita de datas, subclasses e restauração do relógio original nos testes. Não altera relógio do host nem do banco.
- Regressões verificam avanço do relógio, redução de TTL, término de polling, semântica de construtores e rejeição de referência inválida. Seis cenários direcionados passaram (29 assertions), incluindo bloqueio oficial por divergência PostgreSQL.
- Esta correção elimina congelamento operacional; não resolve ainda o relógio financeiro entre camadas. Sessões/timestamps JS continuam deslocados e SQL mantém tempo real. Capturas anteriores com congelamento não comprovam comportamento temporal de autenticação/cache. Aceite oficial permanece bloqueado; próxima etapa exige relógio de domínio explícito e evidência JS/SQL, preservando tempo real para autenticação, locks e auditoria.
