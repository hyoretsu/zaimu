# Compras, parcelas e reembolsos normalizados

## Escopo aprovado

1. Separar compra, parcela e reembolso; migrar SQL, IndexedDB e sync. Compra concentra total e metadados; preservar IDs, histórico, conciliações, recompensas e rateios.
2. Herdar estabelecimento, categoria e tags pela compra, sem snapshots duplicados em parcelas/reembolsos.
3. Permitir múltiplos reembolsos parciais, limitados ao total da compra, em centavos e sob transação/controle de concorrência.
4. Separar crédito na data efetiva de restituição e gasto líquido no período da compra. Não contar pagamento do cartão como segunda despesa de consumo.
5. Política institucional: manter parcelas e creditar tudo, ou cancelar parcelas posteriores à fatura do crédito e creditar somente diferença. Perguntar uma vez por instituição, sem edição posterior na UI; cartão sem instituição pergunta a cada operação relevante. Parcial sempre vira crédito; completar total após parcial não cancela parcelas.
6. Editar reembolsos atomicamente, inclusive em faturas pagas. Recalcular cadeia histórica, saldos, pagamentos e créditos, sem excluir/recriar.
7. Importação negativa exige compra vinculada. Sem correspondência, revisar dados da compra antes de reconstruí-la e aprovar reembolso.

## Invariantes

- Preservar compra original e histórico depois da restituição.
- Valor informado é restituição total, incluindo parcelas canceladas. Compra de R$ 300 com R$ 200 cancelados recebe crédito de R$ 100, nunca R$ 300 adicionais.
- Futuro significa ciclo posterior ao ciclo do crédito; não significa parcela não paga.
- Agendas futuras são projeções; materializar somente ocorrências devidas ou recomposição histórica explícita.
- Reembolso tem tipo próprio na listagem, fora de entradas/despesas ordinárias.
- Aplicativo ainda não publicado: migração única, sem adaptador para clientes antigos depois da troca de contrato.
- Operações somente locais; alterações preexistentes pertencem ao usuário.

## Progresso

- [x] Modelo/cálculos compartilhados, testes de invariantes e transformação determinística dos registros legados.
- [ ] Schema e migração SQL com preservação de referências e verificação em PostgreSQL descartável local.
- [ ] Serviços transacionais, política institucional imutável, endpoints novos e reconstrução de faturas.
- [ ] IndexedDB, modo visitante e sync no contrato normalizado.
- [ ] UI de parcelas/reembolsos, edição atômica e filtros/relatórios.
- [ ] Importações com revisão de vínculo/reconstrução.
- [ ] Testes integrados, documentação de comportamento ativo e commits locais com hooks.

## Decisões de execução

- Crédito importado sem compra: exigir revisão de data, valor, parcelamento e metadados, sem inventar dívida automaticamente.
- Modelo novo será integrado por etapas; módulos de domínio isolados não significam migração concluída nem mudança já disponível na interface.
