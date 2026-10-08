# Testes backend e SQL

`bun run test` na raiz executa unitários, integrações e E2E dos pacotes backend e SQL. Cada pacote também aceita `bun run test`, `bun run test:unit`, `bun run test:integration` e `bun run test:e2e`. Unitários aceitam `--coverage` e não iniciam serviços. `bun run test:runner` verifica limites, classificação, relatórios, falhas de preparação e limpeza.

```sh
bun run test
bun run --filter backend test:integration
bun run --filter sql test
bun run --filter backend test:unit --coverage
```

Integrações e E2E exigem Docker funcionando e imagens `postgres:16`, `valkey/valkey:latest` (Redis compatível) e `rabbitmq:latest` já disponíveis localmente. O runner nunca baixa imagens. Ausência de Docker, imagem ou disponibilidade de serviço resulta em falha, sem ignorar testes.

O runner compartilhado em `scripts/test-runner.ts` cria containers exclusivos por execução, publica portas dinâmicas somente em loopback e prepara bancos e namespaces separados por suíte. Portas escolhidas permanecem fixas durante reinícios do container. URLs herdadas são substituídas por conexões locais; namespaces Redis e RabbitMQ também são exclusivos. Migrações que usam CLI executam em cópia temporária, preservando referências versionadas. Containers e volumes temporários são removidos no sucesso, erro e interrupção.

Prontidão tem timeout de 60 segundos, ajustável por `TEST_SERVICE_TIMEOUT_MS`. Catálogo de moedas usa um double local determinístico; snapshots cambiais dos cenários são fixtures explícitas. Outros requests HTTP externos são bloqueados. SMTP usa transporte JSON e os testes não iniciam workers de provedores.

Arquivos estão classificados explicitamente em `scripts/testing/test-manifest.json`. Ao adicionar, mover ou remover um teste, atualize o manifesto. Arquivo não classificado, classificação duplicada, dependência indisponível ou relatório com testes ignorados resulta em falha. Integrações executam em processos separados para isolar mocks, conexões e estado global.

Execução direta de testes que exigem serviços falha sem fixture validada do runner. Use o comando do pacote em vez de configurar URLs de bancos ou brokers compartilhados. Nunca aplique fixtures em ambientes de desenvolvimento ou produção.

Hooks executam somente unitários backend com cobertura, além das verificações de tipos e formatação existentes. Alterações no runner também verificam `scripts/tsconfig.json`. CI executa cada categoria dos pacotes afetados, sem secrets de banco ou restrição por branch. Jobs CI preparam imagens locais antes de chamar o mesmo runner; migrações são verificadas pela suíte SQL descartável.

## Verificação local - 08/10/2026

`bun run test` passou com 403 testes: 364 backend, 28 SQL e 11 regressões do runner. Zero falhas, skips ou testes pendentes. Migrações CLI percorreram as 27 etapas em cópias temporárias; E2E SQL verificou precisão monetária e views finais.

Uma execução completa e uma execução backend de integração passaram simultaneamente (403 e 44 testes), com containers, bancos, Redis e RabbitMQ exclusivos. Nenhum container de teste permaneceu após conclusão. Regressões verificaram Docker/imagem ausentes, timeout, interrupção, destinos externos, classificação incompleta e relatório ignorado. Hooks normais, tipos de backend/SQL/runner e build backend passaram. SQL não define tarefa de build; emissão do contrato passou no grafo de build afetado.
