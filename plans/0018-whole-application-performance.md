# 0018 - Validação e otimização de performance da aplicação inteira

## Objetivo e diagnóstico

Concluir aceite pendente do plano 0012 e ampliar cobertura para backend, autenticação, workers, frontend, modo visitante, IndexedDB, sincronização e Tauri desktop/mobile.

Plano versionado em `plans/0018-whole-application-performance.md`. Salvamento e commit local não iniciam a execução das etapas abaixo.

Evidências encontradas:

| Evidência | Implicação |
|---|---|
| Dashboard: 35,2 s com quatro queries e 224 ms SQL | Investigar esperas de cache, autenticação, CPU, serialização e bloqueio do event loop. |
| Eventos de dívida: 32,2 s com duas queries | Poucas queries não garantem resposta rápida. bypass precisa informar causa e tempo de infraestrutura. |
| Cartões/transações: 419/833 queries nos logs | Confirmar atribuição por request. loadCreditBook possui N+1 real: consulta rateio por compra. |
| Espera de conexão 17,6 s numa request de 3,5 s | Instrumentação precisa separar tempo acumulado, operações concorrentes e duração da request. |
| Uma consulta de revisão de estorno por cartão | Tela voltou a ter requests proporcionais à quantidade de cartões. |
| Histórico/detalhe de faturas lê livro inteiro | Paginação atual limita resposta, mas mantém trabalho integral antes do corte. |
| Baseline versionado: cinco amostras, cartões ~10 s e dashboard ~15,5 s | Captura diagnóstica; não constitui aceite. Vários hits também excedem 100 ms. |
| Adapter de autenticação consulta fora dos contadores atuais | queryCount: 0 ainda não comprova zero SQL total. |
| Shell mobile importa telas diretamente; guest usa leituras integrais | Bundle, CPU, memória e IndexedDB precisam entrar na validação. |

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

| Cenário | Meta |
|---|---|
| GET cacheável frio | p95 < 1.000 ms, incluindo autenticação e corpo completo |
| GET quente e resposta 304 | p95 < 100 ms; zero SQL total, incluindo autenticação |
| Entrada numa tela | Requests iniciais justificados por responsabilidade; sem limite artificial quando prejudicar divisão lógica; assets medidos separadamente |
| Listagens e detalhes paginados | Nenhum request/query por registro; orçamento constante com tamanho de página fixo |
| CRUD individual comum | p95 < 1.000 ms até confirmação |
| Navegação/abertura de detalhe com cache quente | p95 < 1.000 ms até conteúdo utilizável |
| Experiência web | LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1 |
| Startup utilizável | p95 ≤ 3 s web/desktop; ≤ 4 s mobile |
| Importação de referência | Até 15 s para arquivo local ≤ 10 MB e ≤ 1.000 itens |
| Sync de referência | Até 30 s para snapshot de 100 mil lançamentos |
| Materialização | SLA existente de até dois minutos |
| Falha do Redis | Até 100 ms adicionais de espera de cache por request antes do fallback |

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
