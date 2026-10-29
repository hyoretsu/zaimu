# Consistência dos caches do frontend

## Objetivo

Isolar caches por identidade, centralizar chaves e invalidações, corrigir atualizações após mutações e tornar a persistência IndexedDB segura entre sessões sem alterar contratos HTTP.

## Restrições

- Manter `staleTime` de cinco minutos.
- Não limpar o cache global como estratégia de atualização.
- Não sincronizar dados remotamente durante a implementação.
- Não transferir dados de convidado para conta.
- Preservar preferências globais de tema.
- Preservar registros legados ambíguos, excluindo-os de leituras e sincronizações automáticas.

## Etapas

- [x] 1. Fundação: identidade estável, chaves tipadas e matriz central de invalidação.
- [x] 2. Persistência: particionamento IndexedDB, migração idempotente, snapshots e transações confiáveis.
- [x] 3. Sessões: cancelamento/remoção do cache anterior, bloqueio durante inicialização e reinício de estado visual.
- [x] 4. Consultas e mutações: migrar domínios para chaves/invalidações centralizadas e remover duplicidade de contas.
- [x] 5. Importações: pendências, detalhe, encerramento, skeleton/erro/retry e derivados financeiros.
- [x] 6. Seleções: guardar IDs e derivar objetos atuais sem perder rascunhos de edição.
- [x] 7. Validação: testes de identidade, IndexedDB, matriz de invalidação e fluxos de importação; build frontend.

## Progresso

### 2026-09-13

- Inventário iniciado.
- Confirmada chave duplicada para contas (`accounts` e `financial-accounts`).
- Confirmadas chaves sem identidade e invalidações distribuídas pelos componentes.
- Confirmado IndexedDB v4 com `localId` global e resolução antes do fechamento de transações.
- Implementadas identidade de cache, chaves tipadas por domínio/parâmetro e matriz central de dependências.
- Adicionados testes unitários da fundação, incluindo invalidação de variantes inativas e remoção de detalhe encerrado.
- IndexedDB atualizado para stores particionadas por proprietário, incluindo metadados e timestamps.
- Migração copia apenas registros com proprietário explícito ou relação unívoca; legado e registros ambíguos permanecem intactos.
- Escritas agora resolvem no fechamento da transação; snapshots completos removem somente dados remotos antigos e preservam alterações locais.
- Requisições remotas recusam respostas de identidade antiga; fallback offline aceita somente falha de conectividade na mesma identidade.
- Listagens completas substituem snapshots remotos; filtros atualizam apenas registros retornados.
- Listagens completas com escopo (faturas por cartão) substituem somente seu recorte, sem apagar outros cartões.
- Troca de identidade cancela e remove consultas anteriores e remonta a árvore privada, preservando tratamento de HTTP 429.
- Sincronização e limpeza local permanecem restritas ao proprietário capturado.
- Consultas migradas para chaves tipadas por identidade; contas agora usam uma única chave canônica.
- Famílias de mutações usam matriz central de invalidação, cobrindo saldos, dashboard, limites, faturas, rateios e rendimentos.
- Importações invalidam pendências na criação, preservam dados durante refetch, exibem skeleton/erro/retry e removem detalhes encerrados.
- Seleção de cartões guarda IDs e deriva objetos atualizados das consultas; rascunhos dos formulários permanecem locais.
- Matriz validada com consultas ativas, inativas e filtradas; detalhes encerrados são removidos.
- `bun test`: 81 testes aprovados, incluindo 5 casos dedicados de identidade e matriz de cache.
- `bun run build`: TypeScript e Vite aprovados. Aviso preexistente de chunk principal acima de 500 kB permanece.
- Revisão concluída sem mudanças HTTP, migrações remotas ou sincronização remota executada.
