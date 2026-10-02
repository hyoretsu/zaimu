# Suítes confiáveis, cobertura por risco e paralelismo nativo no Bun

## Objetivo e decisões

Corrigir lacunas encontradas na auditoria, preservar testes existentes e organizar execução escalável por pacote, domínio e tipo de teste.

Decisões aprovadas: Bun 1.4.2, metas por risco e infraestrutura descartável. Validação preliminar: paralelismo nativo passou nos 65 testes financeiros e eliminou interferência entre os seis testes de IndexedDB.

Plano versionável neste arquivo. Na implementação, atualizar etapas concluídas e criar commits locais atômicos com identidade Git do usuário e coautoria Codex. O salvamento deste plano não inclui commit, conforme solicitação do usuário.

## Organização e execução

- Fixar Bun 1.4.2 no `packageManager`, imagens Docker e configuração de testes do CI.
- Manter unitários junto ao código: `*.test.ts`; componentes: `*.test.tsx`. Integrações ficam em `tests/` dentro do módulo, com sufixo `*.integration.test.ts`; jornadas de navegador usam `*.e2e.test.ts`.
- Classificar cada teste exatamente uma vez. Migrações SQL, IndexedDB, contratos HTTP, Redis e RabbitMQ pertencem às integrações. Testes de componentes com DOM ficam separados de funções puras.
- Criar executor fino em `scripts/test-runner.ts`: selecionar arquivos, configurar ambiente, preparar recursos e delegar execução ao Bun. Usar paralelismo, isolamento, sharding e timings nativos; não implementar pool próprio de workers.

| Comando | Responsabilidade |
|---|---|
| `test:unit` | Funções e unidades sem serviços reais |
| `test:components` | Componentes React e interações em DOM |
| `test:integration` | IndexedDB, SQL, contratos HTTP, cache e broker |
| `test:e2e` | Jornadas reais no navegador |
| `test:coverage` | Coletar, consolidar e validar cobertura |
| `test:all` | Executar todas as suítes disponíveis |

Cada pacote expõe somente comandos correspondentes às suas suítes. `test` executa testes sem infraestrutura externa; `test:all` inclui fixtures descartáveis. Migrar testes HTTP do backend para `test:integration` e atualizar chamadas atuais de `test:e2e`.

Regras de execução:

- `--parallel=2` como padrão; parâmetro `--workers` permite ajuste. Isolamento por arquivo sempre ativo.
- Casos dentro do arquivo permanecem sequenciais. Usar `test.concurrent` somente quando fixtures e estado forem independentes.
- Aceitar `--shard=i/n`, `--seed` e filtro por domínio. Timings orientam balanceamento; ausência deles não impede execução.
- Produzir logs, JUnit, timings e cobertura em diretórios exclusivos por pacote, suíte e shard.
- Falha de preparação, suíte esperada vazia ou teste selecionado ignorado indevidamente resulta em erro. Retentativas automáticas ficam desativadas.

## Isolamento, infraestrutura e qualidade

### Estado local e componentes

- Extrair fixtures reutilizáveis para IndexedDB, DOM, autenticação e QueryClient.
- Criar ambiente próprio antes de importar módulos; fechar banco, remover dados e restaurar globais, mocks, timers e stores ao terminar.
- Dividir testes extensos de armazenamento em cenários independentes. Nenhum caso depende da execução anterior para inicializar estado.
- Adicionar Happy DOM, Testing Library e `user-event` para componentes. Validar comportamento visível, acessibilidade, preenchimento, submissão, descarte, carregamento, erros e bloqueio restrito ao registro pendente.
- Preservar verificações estáticas úteis; evitar assertions dependentes de classes CSS ou estrutura incidental do HTML.

### Integrações e fixtures

- Criar Compose exclusivo de testes: PostgreSQL 17, Redis 8.2 e RabbitMQ 4.1, serviços sem volumes persistentes e portas locais disponíveis automaticamente.
- Identificar recursos por execução e arquivo: banco PostgreSQL próprio, namespace Redis próprio e broker exclusivo quando teste reinicia serviço.
- Remover nomes fixos de bancos, portas e containers dos testes atuais; fornecer recursos pela fixture.
- Aplicar migrações somente aos bancos descartáveis, usando cópia temporária dos arquivos de controle para preservar referências versionadas.
- Aguardar healthchecks; encerrar conexões e remover recursos em sucesso, falha ou interrupção. Timeout precisa identificar serviço e suíte.
- Ambiente de teste recebe URLs explícitas locais. SMTP e chamadas ao Banco Central usam doubles; nenhum worker que consulta serviços externos é iniciado.
- Integrações exigidas pelo comando não podem terminar verdes por ausência de variável de ambiente.

### Contratos HTTP e jornadas

- Dividir teste HTTP de mais de mil linhas em suítes por domínio: autenticação, contas/rendimentos, transações/importações, cartões/reembolsos, dívidas, empréstimos, recorrências, dashboard e sincronização.
- Compartilhar builders e helpers, mantendo dados e sessões independentes. Preservar assertions existentes, identificando qualquer substituição.
- Testar autorização entre usuários, validação de DTOs, paginação, idempotência, concorrência e rollback nos fluxos financeiros críticos.
- Executar navegador através de `bun:test` com biblioteca Playwright. Cada teste recebe contexto novo; cada suíte, aplicação e backend locais próprios.
- Cobrir importação pendente/aprovação/descarte, pagamentos, reembolsos, recorrências e sincronização após edição local. Incluir autenticação com 429 sem redirecionamento indevido.
- Usar Chromium em desktop e viewport móvel. Guardar screenshot e trace nas falhas.

## Cobertura, cache e CI

- Consolidar LCOV por caminho de origem, somando execuções correspondentes. Calcular percentuais ponderados por linhas e funções; não tirar média dos percentuais dos arquivos.
- Exibir separadamente cobertura instrumentada e inventário de arquivos nunca carregados. Arquivo ausente não conta como coberto; relatório não apresenta percentual instrumentado como cobertura global.
- Excluir testes, fixtures, declarações e código gerado. Imports indiretos de outros pacotes não alteram denominador do pacote avaliado.
- Acrescentar testes específicos de antecipação importada, hoje ausente da suíte financeira própria.
- Adotar metas: financeiro com 95% de linhas e 90% de funções; regras backend de saldo, rendimento, dívida, recorrência e fatura com 85%/80%; cálculos e conciliação frontend com 85%/80%.
- Registrar baseline após corrigir isolamento e consolidar suítes. Bloquear regressões nas áreas acompanhadas e novos arquivos críticos sem teste. Componentes e jornadas exigem cenários comportamentais explícitos.
- Corrigir entradas Turbo para incluir implementação, testes TS/TSX, fixtures, configurações e executor, além das dependências relevantes. Integrações e E2E ficam sem cache.
- Corrigir detecção de afetados por tarefa: usar pares pacote/tarefa retornados pelo Turbo. Mudança financeira precisa agendar testes dos consumidores afetados.
- CI executa unitários, componentes, integrações e cobertura dos pacotes afetados em qualquer PR. Integrações usam serviços efêmeros do runner, sem depender de secrets de banco.
- E2E executa em PRs destinados a `staging`/`main`. Backend/frontend usam dois shards para suítes com múltiplos arquivos; financeiro mantém um. Cada job usa dois workers.
- Publicar relatórios como artifacts do workflow; agregação aguarda todos os shards e falha se algum relatório esperado estiver ausente.
- Documentar comandos, classificação, fixtures e diagnóstico em `docs/testing.md`.

## Etapas e critérios de aceite

- [ ] **Corrigir execução:** alinhar Bun, criar comandos, ajustar CI/Turbo e eliminar interferência IndexedDB.
- [ ] **Organizar suítes:** classificação completa, fixtures comuns e divisão dos testes extensos.
- [ ] **Isolar integrações:** infraestrutura descartável e remoção dos skips dependentes de configuração ausente.
- [ ] **Ampliar proteção:** componentes, contratos HTTP e jornadas críticas.
- [ ] **Aplicar cobertura:** consolidação, inventário, metas, baseline e documentação.

Aceite obrigatório:

- Todos os testes existentes preservados ou substituídos por verificações equivalentes documentadas.
- Resultado equivalente com um e dois workers; cinco execuções com seeds diferentes sem falhas.
- Duas execuções simultâneas sem compartilhar dados ou destruir recursos uma da outra.
- Alterar implementação ou teste TSX invalida cache correspondente; alterar financeiro agenda consumidores.
- Todas as suítes selecionadas executam; falha de fixture ou shard nunca produz resultado verde.
- Cobertura paralela equivale à execução serial e respeita metas definidas.
- Recursos de teste removidos após falha e interrupção; relatórios preservados.
- Hooks normais passam nos commits; type-check e build passam nos pacotes afetados na validação final.

Implementação permanece local: sem push, disparo de CI, deploy ou acesso a banco compartilhado. Alterações preexistentes ficam preservadas.
