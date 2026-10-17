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
