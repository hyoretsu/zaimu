# MeuPluggy no Zaimu

## Configuração

1. Administrador prepara migração `20261003T0436_meu_pluggy_open_finance` pelo mecanismo Prisma Next do projeto. Implementação não aplica migrações a bancos externos.
2. Configure `OPEN_FINANCE_ENCRYPTION_KEY` no backend e worker: 32 bytes aleatórios codificados em 64 caracteres hexadecimais. Gere localmente com `openssl rand -hex 32`. Preserve a chave entre reinícios; troca de chave exige configurar credenciais novamente.
3. Execute worker existente, junto de PostgreSQL, RabbitMQ e cache existentes. Nova fila `open-finance-sync` é declarada pela topologia normal.
4. Usuário autenticado abre Ajustes - Open Finance. Assistente explica Meu Pluggy, Dashboard, aplicação, habilitação do conector MeuPluggy, credenciais, fotos ampliáveis e descoberta de conexões. Depois vincula destinos locais. Links abrem overview Meu Pluggy e aplicações Dashboard; no app, navegador externo preserva fluxo de cadastro.

Conexões MeuPluggy são descobertas por `GET /v2/items`, com paginação por cursor, quando habilitado para equipe Pluggy. Endpoint é opt-in e desativado por padrão; `LIST_ITEMS_FEATURE_NOT_ENABLED` retorna indicação específica na tela e mantém alternativa por itemId. Zaimu atualiza contas das conexões conhecidas mesmo sem acesso à listagem. Descoberta ocorre após validar credenciais, ao abrir tela, ao retornar do navegador e pelo botão Atualizar contas conectadas. Não cria vínculos locais automaticamente. Remoções são preservadas para impedir redescoberta; adição manual explícita permite reconectar. Falhas por conexão são isoladas. Não chama PATCH para atualizar bancos, não embute widget e não recebe webhooks nesta versão. Tutorial: https://meu.pluggy.ai/en/api-guide.

Edição de credenciais valida aplicação antes de substituir segredos. Segredo não é carregado de volta ao formulário; formulário limpa campo após salvar. Desconexão preserva importações, histórico, descartes e aliases.

## Contrato

- `GET /open-finance/`: disponibilidade, configuração, conexões, contas remotas, vínculos e última consulta.
- `PUT /open-finance/credentials`: valida e cifra Client ID/Client Secret.
- `POST /open-finance/connections/discover`: busca conexões e atualiza contas conhecidas, mantendo vínculos; responde configuração, disponibilidade da listagem e erros por itemId.
- `POST /open-finance/connections`: consulta conexão por itemId e suas contas.
- `PUT /open-finance/connections/:id/bindings`: configura, pausa ou remove vínculo; valida proprietário e compatibilidade.
- `DELETE /open-finance/connections/:id`: remove conexão local e vínculos.
- `DELETE /open-finance/`: remove segredos e vínculos, cancela execução ativa, preserva registros externos e financeiros.
- `POST /open-finance/sync`: retorna runId ou null; `force` antecipa intervalo, sem executar coleta bancária remota.
- `GET /open-finance/sync?runId=...`: progresso, contagens, erros por conexão e referências às revisões.

Execuções simultâneas reutilizam runId ativo. Registros e contagens são gravados atomicamente. Lease expirado volta à fila pelo worker; processamento confirmado não é repetido. API nunca devolve Client Secret, API Key ou envelope cifrado. Erros de autorização Pluggy usam 422, sem confundir com sessão Zaimu.

## Testes locais

Respostas Pluggy são simuladas. Nenhum banco real é consultado. Credenciais reais exigem fornecimento explícito para essa finalidade.

```sh
bun test backend/src/modules/open-finance/domain backend/src/modules/open-finance/infra
OPEN_FINANCE_TEST_URL=postgres://usuario@127.0.0.1:porta/zaimu_recurrence_test_open_finance bun test --timeout 120000 backend/src/modules/open-finance/tests
bun run --cwd frontend test:open-finance
```

Teste PostgreSQL exige banco descartável local cujo nome começa com `zaimu_recurrence_test`. Reconstrói contrato anterior nesse banco, aplica operações da migração preparada com pré-condições/pós-condições e usa Redis em `127.0.0.1:55440`, sem produção. Teste de navegador usa Playwright, servidor Vite local e respostas API simuladas; aborta requisições externas e WebSockets. Instale navegador com `bunx playwright install chromium` se necessário, ou informe `OPEN_FINANCE_CHROMIUM_PATH` para binário instalado. `OPEN_FINANCE_HEADLESS=true` permite execução sem janela. Artefatos ficam em `/tmp/zaimu-open-finance-browser-results`.

Dados faltantes de cartão aparecem na revisão e bloqueiam aprovação até resolução. Cobertura varia por banco; somente metadados bancários comprovados podem sustentar importação automática. Saldo remoto nunca cria ajuste.

Pagamentos bancários de fatura só vinculam automaticamente um pagamento exato já associado ao cartão. Sem esse vínculo, revisão exige escolher cartão antes da aprovação. Pendências intactas acompanham correções bancárias; rascunhos editados permanecem preservados. Conflitos financeiros desfazem efeitos parciais antes de criar revisão.
