# Recorrências com modelo e fluxo únicos

## Objetivo aprovado

Unificar salários, assinaturas e pagamentos em Recurrence. Suportar entradas,
saídas, transferências próprias, compras no cartão e pagamentos fixos de cartão.
Agenda DAY/WEEK/MONTH/YEAR com intervalo positivo, geração automática somente
até hoje e recomposição histórica explícita. Conta/cartão obrigatório; legados
sem vínculo ficam pendentes. Quitações por pessoa mantêm valor após saldo zerar.

## Etapas

- [x] Agenda e contratos compartilhados, com testes de calendário.
- [x] Modelo SQL, conversão dos legados e serviço atômico de ocorrências.
- [x] API única, adaptadores antigos e integração de processamento/previsões.
- [x] Armazenamento local, conversão por proprietário e sincronização.
- [x] Formulário/listagem únicos, dashboard e faturas.
- [x] Testes de integração, builds, documentação e revisão final.

## Invariantes

Identidade por recorrência/data agendada independe do lançamento editável.
Exclusão concreta não permite recriação automática. Edições preservam passado;
cursor reinicia no dia anterior à alteração. Futuros não produzem registros,
recompensas ou dívidas. Transferências próprias e pagamentos de cartão não têm
rateio. Compra afeta cartão; pagamento afeta conta e crédito, sem dupla contagem.

## Migração e entrega

Preservar IDs, históricos, tags, rateios, vínculos e metadados locais. Colisões
exigem mapeamento por origem. Manter adaptadores antigos sem armazenamento
paralelo ativo. Conferir conversão antes de remover dados antigos. Sem migração
externa, push ou deploy. Commits atômicos, usuário local e coautoria Codex.

## Estado inicial

Alterações preexistentes preservadas: packages/sql/migrations/app/refs/db.json e
frontend/src/routes/recurring/components/RecurringListItem.test.tsx.

## Validação do modelo e API

Migração SQL executada somente em PostgreSQL descartável local: colisões de IDs, históricos, tags, rateios, vínculos, cursores e marcadores de exclusão preservados. Processador validado nas cinco movimentações, concorrência, troca de meio, rollback, recuperação após indisponibilidade, pausa/retomada e dívida com snapshot. Projeções compartilhadas verificam transferências e pagamento fixo sem dupla contagem. Próxima etapa: concluir armazenamento local, interface e validação de sincronização.

## Validação local e interface

Conversão local por proprietário preserva colisões, cursores, alterações pendentes e exclusões. IndexedDB valida commit atômico, concorrência de edição e exclusão sem recriação. Sincronização reconhece revisões enviadas sem sobrescrever edições posteriores. Cadastro de recebimento genérico com intervalo de dois meses e descarte de edição conferidos no navegador isolado. Modal móvel 390x844: sem overflow horizontal, scrollbar própria funcional e limites contidos. Faltam conferência HTTP/sync e builds finais.

## Conferência final

Builds backend e frontend passaram. Agenda/projeções/conversão: 12 testes, 35 verificações; IndexedDB: 2 testes, 13 verificações. Integração PostgreSQL descartável: 5 testes, 41 verificações, incluindo contrato HTTP, adaptador legado e sincronização repetida com rollback. Migração SQL validada em banco local e `migration:check` sem falhas. Cadastro e descarte conferidos em desktop e mobile, scrollbar contida.

Suíte backend: 197 passaram, 16 ignorados sem banco de integração, 1 falha preexistente em CacheInvalidationConsumer.test.ts (expectativa de namespaces desatualizada). Verificação de tipos permanece limitada por três erros preexistentes em debt-ledger-person.test.ts. Arquivos preexistentes preservados. Nenhuma migração externa, push ou deploy executados. Tabelas antigas mantidas para conferência do backfill; remoção depende da aplicação e auditoria pelo usuário.

## Correção das falhas anteriores

Teste de invalidação atualizado para exigir caches de eventos, convites e resumo de dívidas. Normalização do saldo declara substituição do campo original, evitando interseção impossível entre string e number; teste preserva estados literais. Suíte backend repetida: 198 passaram, 16 ignorados sem banco de integração, nenhuma falha. Build e verificação completa de tipos backend passaram.
