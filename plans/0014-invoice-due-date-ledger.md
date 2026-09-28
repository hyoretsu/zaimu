# Faturas vencidas e pagamentos por data de vencimento

## Regras aprovadas

- Pagamentos pertencem ao cartão e aparecem na primeira fatura com vencimento igual ou posterior à data do pagamento.
- Saldo não pago passa ao ciclo seguinte após vencimento. Origem conserva histórico e recebe situação `Saldo transposto`.
- Principal transposto não vira despesa. Somente encargos reais informados/importados são cobrados.
- Reconstrução cronológica preserva datas históricas, crédito excedente e dívida contada uma única vez.
- Corrigir migração original ainda não aplicada; preservar pagamentos e itens pendentes. Migrar visitante/cache por proprietário.
- Executar somente testes e migrações em banco local descartável. Criar commit local com hooks.

## Progresso

- [x] Cálculo compartilhado por vencimento, transferência de principal e crédito em centavos.
- [x] Integração backend, dashboard, importações, sync e visitante.
- [x] Histórico com saldo anterior, encargos, total exigível e saldo transposto.
- [x] Migração corrigida com backfill estruturado antes de remover vínculo antigo.
- [x] Artefato `ops.json` executado em PostgreSQL local: preservação de IDs, valores, datas, horários, conta e vínculos de conciliação.
- [x] Migração de pagamentos no armazenamento local preservando proprietário e metadados; referências não resolvidas preservadas.
- [x] Documentação das regras e da investigação.
- [x] Testes do cálculo compartilhado, frontend e armazenamento IndexedDB.
- [x] `migration:check` e builds backend/frontend.
- [x] Commit final com hooks.

## Validação

- PostgreSQL descartável local: execução de todas as operações emitidas, incluindo prechecks e postchecks; comparação completa dos registros e replay SQL versus cálculo compartilhado.
- IndexedDB isolado: atualização v5 -> v6, visitante/cache por proprietário, metadados, órfãos, limite, exibição dos pagamentos, edição e exclusão.
- Suite backend ampla: 182 testes passaram; falha preexistente em `CacheInvalidationConsumer.test.ts`, expectativa de namespaces de dívidas desatualizada. Testes dos módulos de cartões/importações passam.

- Verificação final: 71 testes relevantes passaram, incluindo artefato SQL e IndexedDB. Type-check de SQL e cálculo compartilhado passou; backend mantém três erros anteriores em respostas 304 e tipagem de empréstimos.
