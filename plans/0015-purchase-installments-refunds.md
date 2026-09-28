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
- [x] Schema e migração SQL com preservação de referências e verificação em PostgreSQL descartável local.
- [x] Serviços transacionais, política institucional imutável, endpoints novos e reconstrução de faturas.
- [x] IndexedDB, modo visitante e sync no contrato normalizado.
- [x] UI de parcelas/reembolsos, edição atômica e filtros/relatórios.
- [x] Importações com revisão de vínculo/reconstrução.
- [x] Testes integrados, documentação de comportamento ativo e commits locais com hooks.

## Histórico de execução

Registros abaixo descrevem marcos intermediários. Estado atual e validação final constam ao fim.

- Crédito importado sem compra: exigir revisão de data, valor, parcelamento e metadados, sem inventar dívida automaticamente.
- Modelo novo será integrado por etapas; módulos de domínio isolados não significam migração concluída nem mudança já disponível na interface.
- Schema aditivo de compra, plano, parcela, reembolso e encargo criado. Migração de criação e constraints aplicada em PostgreSQL 18 descartável local; 65 migrações passaram. Backfill, remapeamento de referências e remoção do legado ainda pendentes.
- Serviço normalizado de reembolsos criado, ainda sem ligação aos endpoints ativos: criação limitada sob lock por cartão/compra, política institucional compare-and-set, edição preservando ID, exclusão lógica preservando histórico e replay na mesma transação.
- Testes de integração do serviço em PostgreSQL descartável local: limite sob concorrência, rollback após falha de replay e edição/exclusão. 66 migrações aplicadas no banco de teste. Integração de dívidas/recompensas ainda necessária antes de ativar endpoints.
- Backfill SQL transacional criado: preserva IDs concretos, centavos importados, snapshots de cashback, taxas, datas, histórico original e referências legadas; entradas negativas sem vínculo ficam marcadas para revisão. Tabela de proveniência liga cada ID legado à compra, parcela, reembolso ou encargo normalizado. O legado e suas FKs continuam intactos até remapeamento e troca do contrato ativo.
- Backfill rejeita dados impossíveis (duplicidade, valores incompatíveis, vínculos cruzados, reembolsos acima do total) antes de copiar. A aplicação real fica condicionada ao tratamento dos casos rejeitados; não usar a migração em banco compartilhado antes disso.

## Validação dos marcos intermediários

- `bun test packages/finance/src`: 30 testes passaram.
- Serviço normalizado em PostgreSQL local: 3 testes passaram, incluindo concorrência real e rollback.
- `migration check` offline passou para criação das tabelas; ambas as novas migrações executadas dentro da cadeia completa em banco local descartável.
- Build backend passou. Type-check do pacote financeiro passou.
- Type-check backend continua falhando nos três erros anteriores: `FinancialAccountYieldsController`, `DashboardController` e `LoansController`. Nenhum diagnóstico nos módulos novos.
- PostgreSQL temporário encerrado e diretórios dos testes removidos; nenhum banco remoto acessado, nenhum ref de banco avançado por esta tarefa.
- Hook local `git pull` removido com aprovação explícita do usuário; validações `lint-staged` mantidas.
- Migração de backfill aplicada com dados de exemplo em PostgreSQL descartável local: 1 migração, 10 operações. Sete testes SQL passaram, incluindo preservação das referências/dados, equivalência com transformação compartilhada, meses curtos, rejeição de dados inválidos e rollback após falha tardia. Nenhum banco remoto acessado.

- Agregado compartilhado de cartão concluído: planos completos, ocorrências somente devidas, metadados herdados, reembolsos múltiplos com tombstones, replay e distribuição proporcional cumulativa de rateios em centavos. Cinco testes novos passaram. Integração ativa continua pendente.

- Cutover SQL criado e validado: referências estáveis remapeadas antes da remoção do legado, flags de quitação e calendários importados preservados, metadados herdados pela projeção somente leitura CreditEntry. Constraints diferidas conferem plano, limite de restituição e titularidade; política institucional imutável no banco. Cadeia completa de 69 migrações e três testes de remapeamento/rollback passaram em PostgreSQL descartável local. Callers ativos ainda em adaptação.

- Projeção CreditConsumption ativa: compra aparece uma vez com gasto líquido; reembolso mantém tipo próprio e data efetiva. Transações raw/ORM compartilham a mesma conexão, incluindo tags e eventos de dívida no rollback.
- Exclusões normalizadas possuem tombstones persistentes por cartão/usuário. Sync rejeita recriação por cliente desatualizado; IndexedDB conserva exclusões e clocks na conversão.
- Validação de SQL: cutover e rollback passaram; migration check offline passou para contrato com tombstones. Serviço ativo passou seis integrações locais, incluindo HTTP autenticado, concorrência de importação e rollback de reconstrução.

- Cálculos compartilhados concluídos para gasto líquido, estorno cumulativo de recompensas em quatro casas, recomposição explícita de datas preservando IDs/calendários importados e reparcelamento sem principal cancelado. Nove testes do agregado passaram; 40 testes financeiros no total.

- Backend ativado: endpoints de livro e CRUD de reembolsos, política institucional imutável, lock por cartão, replay atômico, metadados herdados, rateios persistidos inclusive em compras futuras, estornos de dívidas/recompensas e invalidação de caches do titular e contrapartes.
- Aprovação de crédito importado exige vínculo ou reconstrução revisada; aprovação convencional/em lote mantém negativos pendentes. Revisão de órfãos migrados preserva ID antigo e dados originais. Transação protege aprovação concorrente, rateios e fechamento do lote.
- Leituras de dashboard e pagamentos usam replay normalizado completo, incluindo planos futuros. Materialização periódica cria somente parcelas devidas, mesmo em cartões sem assinaturas.

- IndexedDB v7 e sync normalizados concluídos: conversão atômica por proprietário, arquivo dos registros/clocks legados, revisão de créditos órfãos, tombstones e acknowledge que preserva edição concorrente. Livros criados depois da migração sobrevivem à recarga.
- Modo visitante materializa somente parcelas devidas na inicialização, retorno à janela e processamento periódico. Leituras permanecem sem efeitos de escrita.
- Interface concluída para múltiplos reembolsos, edição/exclusão com identidade preservada, saldo disponível, política institucional e revisão de créditos importados. Filtros exibem reembolso como tipo próprio. Controles pendentes bloqueiam somente a compra ou linha afetada.

## Conclusão e validação final

Escopo aprovado concluído em SQL, domínio compartilhado, backend, IndexedDB, sync e interface. Migrações aplicadas somente em PostgreSQL descartável local. Nenhuma operação em banco remoto, push ou deploy.

- Backend: `bun run check-types` e `bun run build` passaram. Erros de tipagem registrados nos marcos anteriores foram corrigidos.
- Frontend: `bun run build` passou, incluindo `tsc -b`. Vite informa aviso de tamanho do bundle, sem falha de build.
- Finance: 40 testes, 120 assertions passaram.
- Backend normalizado e invalidação de caches: 14 testes, 75 assertions passaram. Incluem HTTP autenticado, concorrência real, ownership, rollback de importação/replay, tombstones, rateios futuros, dívida conciliada e recompensas cumulativas.
- Cutover SQL: 3 testes, 13 assertions passaram, incluindo projeção de consumo, referências preservadas, constraints diferidas e rollback tardio.
- IndexedDB/visitante: 1 integração, 32 assertions passaram, incluindo upgrade, isolamento de proprietários, edição concorrente no acknowledge, múltiplos refunds e materialização idempotente.
- Playwright local: recarga do visitante, limite após compra, dois reembolsos e edição preservando ID passaram; capturas desktop e mobile revisadas.
- `bun run migration:check` offline passou para o contrato final. PostgreSQL descartável e servidor Vite de validação encerrados.
- Hooks normais executados em todos os commits. Mudanças preexistentes preservadas fora dos commits da tarefa.

A suíte E2E histórica geral tem contratos anteriores desatualizados de tags recorrentes e consultas de dívidas; não representa um gate aprovado nesta execução. A suíte integrada específica acima verifica o contrato normalizado ativo. Transferência de compra entre cartões exige fluxo próprio de revisão de calendário; edição atual não oferece esse controle e API rejeita tentativa explicitamente.
