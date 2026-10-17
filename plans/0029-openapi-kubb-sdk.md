# Migração completa para OpenAPI + Kubb

Branch original: `main`. Worktree: `/tmp/zaimu-openapi-kubb`.
Alteração prévia preservada: `packages/sql/migrations/app/refs/db.json`.
Entrega exclusivamente local; nenhum serviço externo pode ser alterado.

## Etapas aprovadas

- [x] Completar contratos TypeBox, operationIds e tags; exportar rotas reais sem infraestrutura.
- [x] Portar Kubb, cliente ky e pipeline Turbo do template, preservando contrato SQL.
- [x] Migrar todos os consumidores para operações e tipos gerados, preservando modo convidado e offline.
- [x] Centralizar invalidação tipada, com isolamento por identidade e moeda.
- [x] Validar contratos, transporte, cache Turbo, invalidação e regressões.
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

- Commit backend `af804cef` concluiu sincronização concreta com hooks normais.
- Build frontend passou; 34 testes focados passaram (101 assertions).
- Pipeline Kubb/Turbo concluído: exportação estrita, geração ignorada, grafo SQL -> OpenAPI -> SDK -> consumidores.

- Consumidores migrados para funções geradas; Better Auth usa cliente oficial. Auditoria não encontrou `fetchWithAuth` nem fetch manual da API Zaimu.
- Invalidação central cobre domínios financeiros, administração e ações persistidas em segundo plano; preserva identidade, moeda e esperas de revisão.
- Validação focada: 37 testes frontend (109 assertions), 17 regressões (59 assertions) e 9 contratos/exportação (692 assertions) passaram.
- Playwright local com respostas públicas simuladas passou modo convidado, sessão após recarga, modal por Back, scroll e viewport mobile, sem erros JavaScript.
- Hooks apontaram diferenças entre páginas remotas e entidades locais opcionais; composição mantém paginação gerada e campos locais separados.
- Builds backend/frontend passaram antes dos últimos ajustes de tipos/cache. Hooks finais e integração local continuam pendentes.

- Rebase sobre main atual preservou subdiálogo de ajustes por conta; invalidação central aplicada na nova estrutura.
- Hooks frontend passaram no commit completo; teste posterior à formatação passou 37 testes/111 assertions.
- Catálogo fiscal compartilhado ganha regra explícita de invalidação; queries de resolução de perfis incluem identidade.

- Gates após rebase passaram: hooks de tipos/lint/formatação e builds Turbo de backend/frontend (5/5 tarefas).
- Revalidação final: 38 testes SDK/cache/transporte passaram, com 113 assertions; exportação reproduzível e cobertura de consumidores passaram 2 testes/677 assertions.
- Auditoria de contratos agora vive em `backend/scripts/tests/consumed-contracts.test.ts`; testa operações importadas e schemas concretos.
- Limitação preexistente: fixture de assinatura em `recurrence-service.test.ts` não cria conta do cartão e também falha em main original. Quatro falhas por interferência global de IndexedDB/mocks passam em processos isolados.
- Integração local em main pendente apenas do commit de auditoria; alteração prévia em db.json preservada.
