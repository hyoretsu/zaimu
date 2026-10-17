# Migração completa para OpenAPI + Kubb

Branch original: `main`. Worktree: `/tmp/zaimu-openapi-kubb`.
Alteração prévia preservada: `packages/sql/migrations/app/refs/db.json`.
Entrega exclusivamente local; nenhum serviço externo pode ser alterado.

## Etapas aprovadas

- [ ] Completar contratos TypeBox, operationIds e tags; exportar rotas reais sem infraestrutura.
- [ ] Portar Kubb, cliente ky e pipeline Turbo do template, preservando contrato SQL.
- [ ] Migrar todos os consumidores para operações e tipos gerados, preservando modo convidado e offline.
- [ ] Centralizar invalidação tipada, com isolamento por identidade e moeda.
- [ ] Validar contratos, transporte, cache Turbo, invalidação e regressões.
- [ ] Criar commits atômicos com hooks e coautoria Codex; integrar na branch original.

## Progresso

- Inspeção inicial concluída. Plano ainda não existia no repositório.
- Worktree isolada criada após autorização do sandbox para escrita no Git local.
- Exportação/contratos, pipeline/transporte e Better Auth em implementação.

- Exportação local cobre 189 operações e passou teste de reprodução com banco, Redis e RabbitMQ indisponíveis.
- Normalização de respostas preserva números e datas JSON; multipart declarado nos controllers de importação.
- SDK gera 840 arquivos; validação estrita OpenAPI habilitada antes da geração.
- Transporte/invalidação: 13 testes passaram. Migração de sincronização e divergências de DTOs ainda pendentes.
- Commits de implementação ainda em validação pelos hooks; nenhuma integração na branch original.

- Commit backend `f0bc6625` concluído com hooks normais.
- Revalidação: 6 testes de contratos/exportação e 21 testes frontend passaram.
- Invalidação distingue moeda explícita de IDs de registros; tags geradas associadas às queries existentes.
- Build frontend em validação; sincronização concreta, cache Turbo e integração continuam pendentes.

- Commit `090e067d` corrigiu contratos de rendimento e resumo de fatura; hooks passaram.
- Sincronização agora possui schemas por entidade e valida serialização SQL; 3 testes de sincronização/exportação passaram.
- Build backend passou. Propostas institucionais descrevem payload concreto; endpoints de feriados bloqueados declaram HTTP 403.
- Cache Turbo: execução fria 3/3 tarefas; repetição 3/3 hits; exclusão/restauração de 841 artefatos preservou todos os hashes SHA-256.
- Alteração temporária de DTO mudou hashes de exportação, SDK, build e check-types frontend; fonte restaurada integralmente.
- Invalidação compartilhada cobre mutations e ações em segundo plano; 13 testes passaram, incluindo persistência e troca de identidade.
- Build frontend continua em validação; regressões ampliadas, commits frontend/pipeline e integração ainda pendentes.

- Histórico offline valida cache com schemas Zod gerados, sem cast de transporte: 3 testes passaram.
- Regressão ampliada: 353 testes passaram; 4 falhas de IndexedDB/mocks passam em processos isolados. Teste de assinatura falha igualmente na branch original por fixture sem conta do cartão.
- Paginação e sugestões agora reutilizam `TransactionReturn`, removendo contratos duplicados no backend.
