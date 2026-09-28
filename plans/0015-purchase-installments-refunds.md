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
- Schema aditivo de compra, plano, parcela, reembolso e encargo criado. Migração de criação e constraints aplicada em PostgreSQL 18 descartável local; 65 migrações passaram. Backfill, remapeamento de referências e remoção do legado ainda pendentes.
- Serviço normalizado de reembolsos criado, ainda sem ligação aos endpoints ativos: criação limitada sob lock por cartão/compra, política institucional compare-and-set, edição preservando ID, exclusão lógica preservando histórico e replay na mesma transação.
- Testes de integração do serviço em PostgreSQL descartável local: limite sob concorrência, rollback após falha de replay e edição/exclusão. 66 migrações aplicadas no banco de teste. Integração de dívidas/recompensas ainda necessária antes de ativar endpoints.
- Backfill SQL transacional criado: preserva IDs concretos, centavos importados, snapshots de cashback, taxas, datas, histórico original e referências legadas; entradas negativas sem vínculo ficam marcadas para revisão. Tabela de proveniência liga cada ID legado à compra, parcela, reembolso ou encargo normalizado. O legado e suas FKs continuam intactos até remapeamento e troca do contrato ativo.
- Backfill rejeita dados impossíveis (duplicidade, valores incompatíveis, vínculos cruzados, reembolsos acima do total) antes de copiar. A aplicação real fica condicionada ao tratamento dos casos rejeitados; não usar a migração em banco compartilhado antes disso.

## Validação parcial

- `bun test packages/finance/src`: 30 testes passaram.
- Serviço normalizado em PostgreSQL local: 3 testes passaram, incluindo concorrência real e rollback.
- `migration check` offline passou para criação das tabelas; ambas as novas migrações executadas dentro da cadeia completa em banco local descartável.
- Build backend passou. Type-check do pacote financeiro passou.
- Type-check backend continua falhando nos três erros anteriores: `FinancialAccountYieldsController`, `DashboardController` e `LoansController`. Nenhum diagnóstico nos módulos novos.
- PostgreSQL temporário encerrado e diretórios dos testes removidos; nenhum banco remoto acessado, nenhum ref de banco avançado por esta tarefa.
- Hook local `git pull` removido com aprovação explícita do usuário; validações `lint-staged` mantidas.
- Migração de backfill aplicada com dados de exemplo em PostgreSQL descartável local: 1 migração, 10 operações. Sete testes SQL passaram, incluindo preservação das referências/dados, equivalência com transformação compartilhada, meses curtos, rejeição de dados inválidos e rollback após falha tardia. Nenhum banco remoto acessado.

- Agregado compartilhado de cartão concluído: planos completos, ocorrências somente devidas, metadados herdados, reembolsos múltiplos com tombstones, replay e distribuição proporcional cumulativa de rateios em centavos. Cinco testes novos passaram. Integração ativa continua pendente.
