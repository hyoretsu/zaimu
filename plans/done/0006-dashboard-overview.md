# Dashboard como visão financeira completa

## Resumo

- Registrar em `docs/business-rules.md`: dashboard deve resumir todos os domínios financeiros relevantes. Novos domínios futuros também devem avaliar integração nela.
- Preservar três totais superiores. Remover movimentações recentes. Adicionar contas, cartões, previsões, dívidas e comparativo financeiro.
- Criar commits locais atômicos para documentação, backend e frontend. Nenhuma operação externa.

## Contrato e cálculos

- Evoluir `GET /dashboard` com query TypeBox opcional `startDate`/`endDate` e `DashboardReturn` TypeBox explícito.
- Retornar:
    - totais do período: saldo inicial/final, entradas, saídas e resultado;
    - contas `CHECKING` e `SAVINGS`, com saldo;
    - cartões com limite disponível, fatura atual e indicador de exclusão;
    - limite disponível total, ignorando cartões `excludeFromTotals`;
    - próxima ocorrência de cada salário, assinatura, pagamento recorrente, cartão/fatura e empréstimo;
    - todas as transações manuais futuras;
    - pessoas com dívida não zerada, direção e saldo;
    - 13 períodos comparativos: seis anteriores, selecionado e seis posteriores.
- Usar intervalos contíguos com mesma duração inclusiva do filtro. Filtro aberto ou “Todas as datas” usa mês atual como intervalo-base do gráfico.
- Para datas até hoje, usar valores concretos. Depois de hoje, combinar saldo atual com previsões, sem persistir ocorrências futuras.
- Evitar dupla contagem: despesas cobradas em cartão entram no fluxo consolidado pela fatura; transferências entre contas próprias não alteram total.
- Gráfico expõe saldo monetário final, entradas e saídas. Saldo exclui investimentos e pontos; inclui valores monetários, discriminando conta corrente e poupança no detalhe.
- Extrair cálculos puros reutilizáveis para datas de ocorrência, agregação por período e projeção. Manter paridade entre backend autenticado e armazenamento local guest.

## Interface

- Decompor dashboard em componentes próprios, um por arquivo, com skeletons estruturais antes de estados vazios/erro.
- Contas: mostrar quatro, somente corrente e poupança, ordenadas por nome. Modal lista todas, oferece `Extrato` e navegação para `/accounts`.
- Cartões: mostrar quatro, ordenados por nome, com limite disponível e fatura atual. Modal lista todos; cartões ocultos aparecem identificados, mas não entram no total. Cada linha abre modal existente de faturas.
- Previsões: mostrar quatro ocorrências cronológicas. Modal mostra todas as próximas ocorrências calculadas, com tipo, nome, valor, direção e data.
- Dívidas: mostrar quatro pessoas, priorizando maior saldo absoluto. Modal lista todas com total a pagar, a receber e saldo líquido; ação navega para `/debts`.
- Gráfico: adicionar componente Chart via CLI ShadCN, usando saldo final em linha e entradas/saídas em séries separadas. Tooltip discrimina corrente, poupança e demais valores monetários.
- Manter responsividade, modais com `ScrollArea`, acessibilidade, tooltips e botões com borda/cursor conforme padrões locais.

## Testes e aceite

- Testar próxima ocorrência para todas as frequências, agendas pausadas/encerradas, fechamento mensal, parcelas, empréstimos e transações futuras.
- Testar 13 intervalos de mesma duração, limites inclusivos, intervalo aberto, períodos que cruzam hoje e projeções sem materialização.
- Testar saldo por tipo, exclusão de investimentos/pontos, transferências neutras, despesas de cartão sem duplicidade e cartões excluídos do total.
- Testar limite de quatro itens nos blocos, modais completos, ordenação e ações de extrato, contas, faturas e dívidas.
- Testar igualdade de resultado entre usuário autenticado e guest.
- Validar testes backend/frontend e fluxo visual responsivo. Commits normais acionam hooks obrigatórios.

## Premissas

- “Só próxima ocorrência” significa uma ocorrência por agenda, cartão e empréstimo; transações futuras manuais são eventos únicos.
- Modal “completo” significa todos os registros resumidos; edição detalhada continua nas telas próprias.
- Nenhuma rota individual de conta será criada.
- Nenhuma migração de banco prevista.

## Progresso

- [x] Registrar regra de negócio.
- [x] Implementar contrato e cálculos do backend.
- [x] Implementar paridade do modo guest.
- [x] Implementar blocos, modais e gráfico.
- [x] Cobrir cenários e validar pacotes afetados.
- [x] Criar commits locais atômicos.

## Estado atual

Planejado. Implementação ainda não iniciada.

## Próximo passo

Plano concluído.
