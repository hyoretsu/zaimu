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
- [ ] Testes de integração, builds, documentação e revisão final.

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
