# Correção de distribuição de parcelas - 2026-10-11

Correção manual autorizada no banco `zaimu_dev`. Nenhuma migração ou alteração de produção foi executada.

## Diagnóstico

A soma dos planos já correspondia ao total contabilizado, mas sete compras preservavam distribuições antigas com diferenças concentradas na última parcela. Verificar somente soma das parcelas não identificava o problema.

A compra AliExpress mencionada no relato preservava valor original de R$ 218,33. Após uma edição, o total contabilizado estava em R$ 218,34. A correção restaurou R$ 218,33 e distribuiu cinco parcelas de R$ 18,20, seguidas de sete parcelas de R$ 18,19.

## Execução

Todas as compras parceladas foram comparadas com `distributePurchaseCents`, preservando valores importados tanto no plano quanto nos lançamentos concretos. Foram corrigidas sete compras: AliExpress, duas Amazon, Steam, MapleStory, Cyberpunk 2077 e MP*4PRODUTOS. Os demais totais foram preservados.

A aplicação ocorreu em uma transação, com bloqueios dos cartões e snapshot local anterior às alterações. A persistência compartilhada do livro recalculou as faturas e sincronizou os efeitos relacionados, sem criar novas parcelas ou alterar seus calendários.

## Validação

- 31 valores de parcelas alterados no plano e nos lançamentos concretos.
- 114 valores importados verificados e preservados.
- Quantidade, identidade, calendário e marcações das parcelas preservados.
- 170 faturas comparadas com a reprodução do livro, incluindo valores pagos e situação de pagamento.
- Nenhuma divergência entre total da compra e soma do plano.
- Nenhuma divergência entre valores do plano e lançamentos concretos.
- Nova varredura sem compras que exigissem correção adicional.

Snapshot local: `/tmp/zaimu-installment-repair-backup.json`. Contém dados financeiros e não integra o repositório. Arquivo temporário não substitui backup permanente do banco.
