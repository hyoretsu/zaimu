# Performance reproduzível

Infra exclusiva local: PostgreSQL 55495, Redis 6395, RabbitMQ 56795 e API 3335. Nunca usar serviços compartilhados. Compose não baixa imagens; imagens precisam estar disponíveis na máquina.

```bash
bun backend/performance/inventory.ts
docker compose -f backend/performance/compose.yml up -d --pull never
PERFORMANCE_DATABASE_URL=postgresql://performance:performance-local@127.0.0.1:55495/zaimu_performance \
PERFORMANCE_FIXTURE_SIZE=10000 PERFORMANCE_FIXTURE_USERS=20 bun run backend/performance/seed.ts
bun run --filter backend build
```

Inventário usa caminhos efetivamente montados no OpenAPI, incluindo controllers compostos, preferências e health; exportação lê declarações sem executar endpoints. Impressão SHA-256 cobre fontes backend, telas, gerador e orçamentos. Executor e matriz recusam inventário desatualizado antes de conectar serviços ou preparar fixtures. Após mudar essas fontes, regenere com `bun backend/performance/inventory.ts`. Rotas e telas novas permanecem pendentes até medição própria.

Fixtures: 10, 10 mil ou 100 mil transações por usuário; 1 a 20 identidades isoladas. Seed exige host, porta, usuário e nome da instância dedicada. Runner verifica identidades e conservação do principal nas parcelas antes de medir. API/worker usam namespace `zaimu_performance`, relógio JavaScript iniciado em 2026-10-04T12:00:00Z e avançando pelo relógio monotônico, fornecedores BCB/câmbio simulados e bloqueio de HTTP externo.

Iniciar API release a partir de `backend`:

```bash
bun run performance/start.ts > /tmp/zaimu-performance-api.jsonl 2>&1
```

Em outro terminal, a partir da raiz:

```bash
PERFORMANCE_API_LOG=/tmp/zaimu-performance-api.jsonl \
PERFORMANCE_REPORT_PATH=/tmp/zaimu-performance-result.json bun run backend/performance/acceptance.ts
```

Execução oficial: três rodadas, pelo menos 25 amostras por cenário/carga e cargas 1/5/20. Cada usuário conclui operação antes de iniciar próxima. Preparação e limpeza auxiliar não entram na duração da ação; criação, edição, exclusão e leitura após escrita têm percentis próprios. Falha de preparação/asserção/limpeza reprova cenário. Logs da API são obrigatórios no aceite oficial para associar spans, pool, CPU, event-loop e memória pelo requestId.

`--diagnostic` executa cinco amostras com um usuário. Diagnóstico nunca constitui aceite. `PERFORMANCE_SCENARIOS=purchase,purchase48,purchaseRefund` seleciona cenários conhecidos; valor vazio/desconhecido falha. `performance:benchmark` usa o mesmo executor seguro.

Leituras medem Redis frio, quente e 304, status, bytes, SQL total/auth/negócio e espera de conexão. Limpeza remove apenas chaves de dados `zaimu_performance:v2:*`; preserva sessão. Redis frio não significa startup frio. Escritas cobrem compras, 1/12/48 parcelas, tags/loja, retroatividade, câmbio, rateio, encargos, reembolsos, transferência de cartão, reparcelamento, transações/transferências, categorias, contas, recorrências, empréstimos, pessoas, ajustes e preferências. Respostas e leitura posterior verificam invariantes dos cenários. Empréstimos não têm endpoint de exclusão; limpeza auxiliar usa exclusivamente banco dedicado e registros identificados pelo cenário.

Metas mantidas: CRUD e leitura fria p95 < 1 s; leitura quente/304 p95 < 100 ms com zero SQL total. Métrica ausente nunca vira zero. Relatórios preservam amostras, erros e percentis por ação. Inventário distingue rotas aprovadas, falhas e pendências de telas/jornadas; aprovação de cenários selecionados não representa aceite global.

## Matriz e navegador

```bash
bun run backend/performance/matrix.ts
```

Executa fixtures 10/10 mil/100 mil com worker parado/ativo, API release reiniciada e relatórios em `/tmp/zaimu-performance-matrix`. Requer porta 3335 livre e builds locais atualizados. `PERFORMANCE_MATRIX_DIR` altera diretório de artefatos. Ambiente da máquina e atividade de outros processos devem ser registrados; evitar builds/testes concorrentes na captura oficial.

Navegador usa API dedicada e frontend release. Construir com destino local antes de executar:

```bash
VITE_API_URL=http://127.0.0.1:3335 VITE_PUBLIC_WEB_URL=http://127.0.0.1:5173 bun run --filter frontend build
bun run --cwd frontend performance:test
```

Servidor preview sobe automaticamente na porta 5173. Browser mede confirmação persistida e atualização visual separadamente, mantém data fixa e bloqueia destinos externos. `PERFORMANCE_CHROMIUM_PATH` permite Chromium já instalado; em máquina sem display usar `xvfb-run -a`. `PERFORMANCE_DIAGNOSTIC=true` reduz captura a cinco amostras. Traces e relatório JSON ficam nos artifacts Playwright em `/tmp/zaimu-browser-performance`.

## Regressões e limites de aceite

```bash
bun test backend/performance
bun run scripts/test-runner.ts backend integration
```

Testes do executor verificam seleção, percentis, concorrência, timeout configurado, redirects, headers inválidos, cobertura ausente, resultado financeiro e limpeza após falha. Testes de cache verificam contenção, invalidação concorrente e propriedade de locks; regressões de persistência verificam trabalho constante para edição isolada em históricos crescentes.

Cobertura de aprovação/reconciliação de extratos, sync incremental, offline completo/IndexedDB, falhas de infraestrutura, backlog, startup, jornadas de navegação e plataformas nativas ainda precisa completar matriz do plano 0018. Nenhum relatório HTTP pode aprovar essas áreas por inferência. Pendências ficam explícitas no inventário e impedem aceite global.

`statementImport` gera mil valores distintos; `statementImportDuplicates` preserva mil valores iguais, caso extremo de resposta com candidatos repetidos. Parsing tem orçamento de 15 s; revisão e descarte mantêm 1 s. `loanAdvance`, `recurrenceAdvance` e `recurrenceReplay` medem antecipação/materialização com limpeza dos efeitos criados.

Navegador inclui navegação nos oito módulos e diagnóstico de leitura/escrita IndexedDB com isolamento entre duas identidades. Teste de storage é diagnóstico, não substitui equivalência financeira e migração visitante. Relatório comparativo das ações corrigidas fica em `reports/financial-actions-reference-0018.json`.

WebView GTK local disponível via GI pode executar diagnóstico visitante separado:

```bash
# Com frontend release servido em 127.0.0.1:5173
xvfb-run -a /usr/bin/python3 frontend/tests/performance/native-webkit.py
```

Contexto ephemeral não acessa perfil do usuário. Proxy local indisponível bloqueia destinos externos; fetch externo é recusado e geolocalização é simulada. Relatório `/tmp/zaimu-native-webkit.json` identifica versão do engine e oito rotas. Esse diagnóstico não certifica bridge Tauri, startup nativo, deep links, mobile ou histórico grande; métricas não suportadas permanecem pendências explícitas. Playwright grava também `result.json` com falhas e anexos, mesmo quando um cenário para antes de completar medições.

Cenário `authSession` mede login, sessão autenticada, logout e sessão anônima. Cookie criado pertence somente ao cenário; cookie original da fixture permanece intacto. Identidade divergente reprova execução e encerra sessão criada. Intervalo de 3,5 s entre ciclos respeita limite de login e fica fora da latência de cada request. Signup, recuperação e revogação de outras sessões continuam pendentes.

Cada grupo concluído também é gravado em `<relatório>.journal.jsonl`, sem serializar todo o histórico a cada request. Interrupção conserva grupos anteriores e marca cenário ainda pendente. Recuperação local:

```bash
bun backend/performance/journal.ts /tmp/zaimu-performance-result.json.journal.jsonl
```

Journal contém resultados antes da associação final de telemetria. Recuperação sempre retorna `passed: false` e `complete: false`; nunca substitui relatório de aceite, mesmo quando runner chegou ao fim. Cauda incompleta fica explícita; registros internos inválidos, duplicados ou namespace incorreto são recusados.

`invoiceImportApproval` mede parsing e aprovação de mil compras; `invoiceImportReconciliation` vincula e aprova uma compra existente, exigindo preservação da identidade. Cada amostra cria cartão exclusivo e remove sua conta em `finally`, incluindo importação aprovada e livro materializado por cascade. Preparação e limpeza ficam fora das latências. Leitura posterior valida cada descrição/valor, quantidade de compras e conservação das parcelas. Aprovação e reconciliação mantêm orçamento CRUD de 1 s; parsing mantém 15 s. Esses cenários não cobrem reembolsos/reparcelamentos importados nem reconciliação de extratos.

`dashboardComparison` mede `/dashboard/comparison` em frio, quente e 304. Headers condicionais precisam retornar HTTP 304 real, além de cumprir meta de zero SQL total. Diagnósticos de preferência/rollback e capturas com fallback Redis ficam em `reports/dashboard-currency-cache-reference-0018.json`; grupos reprovados continuam explícitos.

Seed executa ANALYZE uma vez após preparar todas as identidades, incluindo tabelas pequenas de contas/perfis. Isso evita estimativas de cardinalidade desconhecidas entre rodadas. Estatísticas não substituem testes da consulta em banco recém-criado.

Preflight compara CURRENT_DATE do PostgreSQL com referência JavaScript antes de medir. Captura oficial recusa divergência; diagnóstico registra clock.consistent=false na fixture e permanece sem aceite. O relógio JavaScript é deslocado para o instante da fixture e continua avançando com `performance.now()`: cache, TTL de sessão e deadlines não ficam congelados. Isso não desloca nem congela o relógio PostgreSQL. Sessões e timestamps JavaScript permanecem no epoch da fixture; diagnósticos continuam sem comprovar equivalência temporal com defaults SQL. Até existir mecanismo determinístico entre camadas, matriz oficial fica bloqueada por esse requisito.
