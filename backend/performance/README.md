# Baseline de desempenho

Use somente banco e API locais. O seed recusa hosts não locais e bancos cujo nome não contenha `performance`, `benchmark` ou `test`.

```bash
cd backend
PERFORMANCE_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/zaimu_performance \
  bun run performance:seed
```

O dataset determinístico contém 100 mil transações em cinco anos, 20 cartões, 1.200 faturas, 12 mil compras canônicas com planos, parcelas e referências normalizadas, 10 mil vínculos de tags, 5 mil eventos de dívida, 25 empréstimos com 1.500 parcelas, 240 recorrências unificadas (40 receitas e 200 despesas), rendimentos, categorias e lojas. Rodar novamente substitui somente os usuários locais `performance-user` e `performance-peer` e seus dados. As migrações locais são aplicadas sem avançar referências versionadas do banco.

Inicie a API apontando para o mesmo banco, com métricas de benchmark habilitadas:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/zaimu_performance \
PERFORMANCE_METRICS_HEADERS=true \
bun run dev
```

Autentique o usuário da fixture na API local e copie o header `Cookie` da sessão. Depois capture cold start, p95 quente e query count:

```bash
PERFORMANCE_ISOLATED_REDIS_URL=redis://127.0.0.1:6395 \
PERFORMANCE_COOKIE='better-auth.session_token=...' bun run performance:benchmark --write
```

Use Redis dedicado na porta local 6395, também configurado como `REDIS_URL` da API. O runner limpa somente esse banco Redis antes de cada uma das 25 amostras frias. Não use instância compartilhada. Três requests aquecem o cache; os próximos 25 concorrentes formam o p95 quente. `PERFORMANCE_ITERATIONS` permite reduzir amostras em diagnósticos (mínimo cinco); aceite oficial usa 25. `--write` cria `performance/baseline.json`, inclusive se algum endpoint falhar. Reinicie API e pool antes de captura oficial.
