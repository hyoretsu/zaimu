# Inventário do legado da aplicação

Referência: plano `0017-remove-application-legacy`. Inventário inicial em 2026-10-02.

| Estrutura | Consumidores | Classificação e destino |
| --- | --- | --- |
| `Salary`, `Subscription`, `RecurringPayment` e históricos | controllers, adaptador de recorrências, sync, Prisma | Legado ativo. Converter para `Recurrence` e `RecurrenceHistory`; arquivar originais antes de remover. |
| `Recurrence.legacySource/legacyId` | adaptador, sync, IndexedDB | Legado ativo. Mover para registro exclusivo de upgrade, por proprietário; conservar destinos excluídos. |
| `Transaction.salaryId/subscriptionId` e datas | criação, listagem, sync, busca | Legado ativo. Usar somente `recurrenceId/recurrenceOccurrenceDate`. |
| `CreditPurchaseRecord.subscriptionId` e `DebtSplit.recurringPaymentId` | materialização, projeções, exclusão, sync | Nomes antigos de conceitos atuais. Renomear para `recurrenceId`. |
| `Debt`, `DebtHistory`, `scoped-debts` | visitante, dashboard, sync, SQL | Legado ativo. Usar eventos manuais e compensações históricas em `DebtEvent`; preservar históricos no arquivo. |
| `CreditPurchaseLegacyEntry` | revisão de créditos órfãos | Legado ativo. Transferir pendências para fila de revisão atual antes de remover. |
| Categoria escalar | transações, compras, importação, DTOs, fallbacks visuais | Legado ativo. Converter para associações de tags. `Category` e `TagAssignment.categoryId` continuam atuais. |
| `yieldRate`, `cashbackYieldRate`, salário líquido antigo | normalização de contas, sync, armazenamento | Legado ativo. Conversão exclusiva do upgrade. |
| Empréstimos sem pagamentos e SACRE | inicialização IndexedDB, revisão | Exceção de upgrade. Revisão explícita; preservar pagamentos concretos. |
| Financiamento sem referência persistida | importação | Legado ativo. Conciliação explícita quando vínculo inequívoco faltar. |
| Cliente `api`, `LegacyDashboard`, conversores visuais antigos | exports e testes antigos | Código morto ou compatibilidade. Remover após conferir consumidores. |
| Stores IndexedDB sem proprietário | abertura do banco | Exceção de upgrade. Nunca atribuir automaticamente ao usuário conectado. |
| `/salaries`, `/subscriptions` frontend | links históricos | Exceção aprovada: redirecionamento. |
| Auth, migrações SQL aplicadas, snapshots, Prisma 7 e planos concluídos | autenticação, instalação/upgrade | Histórico ou exceção aprovada. Preservar. |
| `CreditEntryReference`, tombstones, projeções atuais | histórico, conciliação, exclusões, financeiro | Atual. Preservar. |

Auditoria SQL deve usar snapshot consistente e incluir IDs, valores, vínculos, históricos e tombstones. Contagens sozinhas não demonstram equivalência financeira. Arquivo de upgrade conserva o JSON original; divergência em conferência bloqueia remoção.
