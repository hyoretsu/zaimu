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
| Entrada numa tela | Até três requests iniciais de dados/sessão; assets medidos separadamente |
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
- [ ] Auditar mounting, modais fechados, abas ocultas, retries, foco e invalidação. Respeitar orçamento de três requests, incluindo validação inicial de sessão.
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
- Auditoria web identificou entradas com 4-6 requests: configuração automática Open Finance, imports e sugestões exigem redução adicional. Navegação ainda não constitui aceite.

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
