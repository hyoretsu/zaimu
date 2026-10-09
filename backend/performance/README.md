# Performance reproduzível

Infra exclusiva local: PostgreSQL 55495, Redis 6395, RabbitMQ 56795 e API 3335. Nunca usar serviços compartilhados. Compose não baixa imagens; imagens precisam estar disponíveis na máquina.

```bash
docker compose -f backend/performance/compose.yml up -d --pull never
PERFORMANCE_DATABASE_URL=postgresql://performance:performance-local@127.0.0.1:55495/zaimu_performance \
PERFORMANCE_FIXTURE_SIZE=10000 PERFORMANCE_FIXTURE_USERS=20 bun run backend/performance/seed.ts
bun run --filter backend build
```

Fixtures: 10, 10 mil ou 100 mil transações por usuário; 1 a 20 identidades isoladas. Seed exige host, porta, usuário e nome da instância dedicada. Runner verifica identidades e conservação do principal nas parcelas antes de medir. API/worker usam namespace `zaimu_performance`, data financeira fixa em 2026-10-04, fornecedores BCB/câmbio simulados e bloqueio de HTTP externo.

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

Cobertura de aprovação/reconciliação de importações, sync incremental, offline completo/IndexedDB, falhas de infraestrutura, backlog, startup, jornadas de navegação e plataformas nativas ainda precisa completar matriz do plano 0018. Nenhum relatório HTTP pode aprovar essas áreas por inferência. Pendências ficam explícitas no inventário e impedem aceite global.

`statementImport` gera mil valores distintos; `statementImportDuplicates` preserva mil valores iguais, caso extremo de resposta com candidatos repetidos. Parsing tem orçamento de 30 s; revisão e descarte mantêm 1 s. `loanAdvance`, `recurrenceAdvance` e `recurrenceReplay` medem antecipação/materialização com limpeza dos efeitos criados.

Navegador inclui navegação nos oito módulos e diagnóstico de leitura/escrita IndexedDB com isolamento entre duas identidades. Teste de storage é diagnóstico, não substitui equivalência financeira e migração visitante. Relatório comparativo das ações corrigidas fica em `reports/financial-actions-reference-0018.json`.
