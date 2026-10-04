# Reparo do histórico de CDI/Selic

Execute no diretório `backend`, com ambiente do banco desejado configurado:

```bash
bun run rates:repair --status-only
bun run rates:repair
bun run rates:repair --apply
```

`--status-only` consulta taxas, cobertura dos últimos dez anos e doze comandos mais recentes no namespace atual. Sem opções, o script consulta também as séries oficiais do BCB em intervalos anuais e compara os dias publicados com o banco. Ambos os modos não gravam dados.

`--apply` completa diretamente os dias publicados ausentes com `ON CONFLICT DO NOTHING`. Preserva valores divergentes e timestamps existentes, inclusive diante de inserções concorrentes. Cada intervalo confirmado registra cobertura pelo fluxo existente. Falha não registra cobertura daquele intervalo; intervalos anteriores permanecem concluídos. Uma nova execução pode conferir e completar tudo novamente. Dias sem publicação não recebem taxa artificial. Ano inicial é coletado inteiro; médias usam somente a janela móvel de dez anos, até ontem.

Preenchimento usa Redis para invalidar caches e transação por intervalo. Taxas inseridas enfileiram recálculos pelo fluxo existente; worker precisa processar esses recálculos. Script não depende do consumidor RabbitMQ para buscar taxas. Usa `DATABASE_URL`, `REDIS_URL` e `SERVICE_NAMESPACE` do ambiente, sem trocar automaticamente entre produção e desenvolvimento.

## Interpretar diagnóstico

Comando publicado não comprova coleta: confira conclusão, lease e erro do consumidor. Lease pode estar vencido e não comprova progresso. Compare contagem, última atualização e conclusões entre consultas. Retries esgotados deixam a coleta sem conclusão; reiniciar worker não garante reenvio de comandos com a mesma chave de deduplicação. Reparo direto evita depender desses comandos.

Em 04/10/2026, banco configurado na máquina tinha 1.686 taxas por índice, de 02/01/2020 a 18/09/2026, com última atualização em 21/09/2026. Worker local estava ativo, mas comandos do namespace `zaimu_dev` falharam seis vezes com `getaddrinfo ENOTFOUND api.bcb.gov.br`. Consulta posterior manteve mesmas contagens; resolução DNS local do endereço também falhou. Isso explica coleta incompleta nesse ambiente, sem comprovar estado de outro ambiente. Corrigir resolução/acesso ao BCB antes de aplicar reparo.

## Testes locais

Teste de integração `backend/src/modules/reference-rates/tests/reference-rate-repair.test.ts` exige PostgreSQL descartável, socket com prefixo `/tmp/zaimu-reference-rate-repair-`, porta `55440` e variável `REFERENCE_RATE_REPAIR_TEST_SOCKET` apontando para esse socket. Verifica preservação de valor/timestamp, preenchimento, idempotência e comportamento padrão do worker.
