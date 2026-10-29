# Pagamentos vinculados ao cartão

## Regras aprovadas

- Pagamento pertence ao cartão. Data define ciclo de exibição pela regra de fechamento.
- Valores quitam faturas da mais antiga para a mais recente; excedente vira crédito futuro.
- Consulta preserva faturas pagas. Formulários selecionam cartão, permitindo antecipação.
- Backend, dashboard, importações, sync e visitante compartilham resultado financeiro.
- Migração preparada offline; nenhuma operação externa.

## Progresso

- [x] Contrato e migração com preservação dos pagamentos existentes.
- [x] Distribuição financeira, exibição por ciclo e integração backend.
- [x] Formulários, armazenamento local e modo visitante.
- [x] Testes unitários focados e verificação da migração local.
- [x] Validação por hooks e commit local.
