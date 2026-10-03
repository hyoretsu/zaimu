# Recomposição de recorrências ausentes

`schedule:replay` publica um comando no RabbitMQ e processa dias posteriores ao cursor `materializedThrough`. Não recupera lacunas anteriores ao cursor, por exemplo após migração ou edição de uma recorrência criada antes da fila.

`schedule:repair` acessa o banco indicado por `DATABASE_URL` diretamente. Sem `--apply`, consulta e lista as datas ausentes sem gravar. Execute os comandos dentro de `backend/`, no ambiente do banco que deseja reparar.

Para conferir o lançamento de setembro de Quadrinhos na Sarjeta:

```sh
bun run schedule:repair --from 2026-09-26 --through 2026-09-26 --name "Quadrinhos na Sarjeta"
```

Confira ID, usuário e data exibidos. Para gravar, use o ID encontrado:

```sh
bun run schedule:repair --from 2026-09-26 --through 2026-09-26 --recurrence-id ID --apply
```

Para conferir todas as lacunas de um usuário desde janeiro até hoje:

```sh
bun run schedule:repair --from 2026-01-01 --user-id ID
```

- `--from` é obrigatório. `--through` assume hoje; datas futuras são rejeitadas.
- `--name` compara o nome exato; filtros de nome, usuário e recorrência combinam entre si.
- Recorrências pausadas são ignoradas. `--include-inactive` inclui essas recorrências explicitamente.
- Recomposição usa agenda, valor, contas, cartão, tags e rateio atuais; não reconstrói configurações antigas nem períodos de pausa. Delimite o intervalo a recuperar.
- Identidade é recorrência/data agendada. Marcadores de ocorrência, inclusive exclusões manuais, e lançamentos concretos já vinculados impedem recriação. Ocorrências antecipadas mantêm a identidade original.
- Registros antigos podem ter identidade ausente ou igual à data financeira editada. O script consulta todos os vínculos, inclusive fora do intervalo solicitado, usando a data financeira somente quando não há identidade. Uma data fora da agenda mensal ou anual ocupa a ocorrência única do mesmo mês ou ano. Exemplo: compra mensal do dia 10 alterada para 12/07 impede recriação de 10/07. Identidades válidas prevalecem mesmo quando a data financeira muda para outro período. Essa compatibilidade não altera registros no banco.
- Vínculos sem correspondência inequívoca bloqueiam a recorrência inteira e aparecem na saída. As demais continuam sendo processadas; o comando termina com código 1 quando houver bloqueios. Revise esses vínculos antes de tentar recompor a recorrência bloqueada.
- Cursor permanece intacto. Cada recorrência é revalidada sob bloqueio e gravada em transação, usando a materialização existente, incluindo parcelas devidas, cashback e dívidas. Se houver falha, aquela recorrência sofre rollback; recorrências anteriores já concluídas permanecem gravadas. Reexecutar é seguro.
- Criação não depende de RabbitMQ ou worker. Eventos de atualização e recálculo de rendimentos ficam na outbox para processamento posterior pelo worker; caches de sessões abertas podem aguardar esse processamento.

`bun run schedule:repair --help` mostra todas as opções.

Se aparecer `relation "Subscription" does not exist`, o trigger de integridade de compras ainda referencia a tabela removida. Em `backend/`, execute `bun run schedule:repair-integrity` para conferir o SQL e `bun run schedule:repair-integrity --apply` para corrigir o trigger no banco configurado. A correção preserva as demais validações e não altera lançamentos. Depois, repita a simulação e o reparo. O modo `--apply` verifica esse problema antes de gravar qualquer recorrência. Se a função de integridade estiver ausente, a correção aborta; restaure as constraints do livro de crédito antes de recompor.
