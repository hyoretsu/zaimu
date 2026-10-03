# Previsão financeira, recorrências e sugestões de pagamento

## Escopo aprovado
Motor diário compartilhado servidor/visitante; consumo ordenado de reservas; projeções sem dupla cobrança; médias oficiais CDI/Selic dos últimos dez anos; conta primária e conta pagadora; sugestões revisáveis; gráfico com centavos, segmentos recorrentes e investimentos.

## Etapas
- [x] Motor diário, contratos, integrações e testes de previsão.
- [x] Histórico móvel de taxas, bootstrap retomável, médias SQL e visitante offline.
- [x] Preferências, sugestões, confirmação segura e paridade visitante.
- [x] Gráfico com centavos, barras empilhadas, tooltips e subtotais recorrentes.
- [x] Regras de negócio, verificação integrada, builds e commits locais.

## Limite local
Preservar alterações prévias em packages/sql/migrations/app/refs/db.json e frontend/src/routes/recurring/components/RecurringListItem.test.tsx. Não executar migrações, cargas ou publicações externas.

## Progresso
Implementação iniciada. Frentes independentes em andamento.

Taxas: bootstrap anual móvel com retomada de lacunas, conclusão durável em OutboxEvent, média aritmética SQL sem zeros artificiais e cache visitante offline. Testes BCB/janela: 8 passaram; rendimentos projetados: 4 passaram. Build backend passou. Carga externa não executada.

## Carga histórica externa - execução pelo usuário
Após aplicar migração aditiva e configurar PostgreSQL, RabbitMQ e Redis de destino, executar `bun run --cwd backend src/worker.ts`. Inicialização e agendamento periódico publicam intervalos anuais faltantes; consumidor grava taxas oficiais e marcador de conclusão. Reiniciar o mesmo comando retoma lacunas sem apagar histórico. Manter worker ativo para atualização diária. Antes de disponibilizar previsão pós-fixada, verificar `GET /reference-rates/averages`: `ready` deve ser `true` para CDI e Selic completos na janela obrigatória. Nenhum desses comandos foi executado contra serviços externos pelo agente.

Verificação adicional de taxas: média/janela/cobertura SQL aprovadas em PostgreSQL descartável local via socket Unix, sem banco externo. Cache visitante: 3 testes aprovados (rede offline, médias indisponíveis e cache inválido). Banco descartável encerrado após teste.

Motor e interface: 120 testes relevantes passaram. Desktop 1280 px e mobile 390 px verificados no navegador com API simulada, sem tráfego externo. Gráfico inclui centavos, tooltip e segmentos. Correção de cashback monetário aplicada na revisão final.

## Migração externa - execução pelo usuário
Migração aditiva: `20261003T1952_financial_payment_preferences`, partindo do contrato `0b65cd30af28a84c140bdbd4e2dc1648e2e5b18cc6ae78f08b06f0a3002e161e`. Após revisar cadeia local, avançar ref db para snapshot `cefc24e812413f0dc86f6896aafa5b1e75287baca760266bf194f867c2421e96` e executar `bun run --cwd packages/sql migrate:deploy`. Aplicar também `packages/sql/scripts/financial-payment-preferences-constraints.sql` no banco escolhido para unicidade da conta primária. Ref db prévio foi preservado; nenhum comando externo executado.

Preferências e sugestões implementadas em servidor e visitante. Migração aditiva preparada, sem aplicação externa. Teste visitante cobre concorrência, repetição, data editada, saldo insuficiente e isolamento. Locks compartilhados incluem pagamento manual e importação.

Verificação final: 126 testes passaram em 26 arquivos. Builds frontend/backend passaram. Verificação de tipos encontrou duas incompatibilidades corrigidas (valor numérico em idempotência e contrato recorrente da fatura); nova execução aprovada nos quatro pacotes. Testes de concorrência do servidor ainda precisam de banco integrado; lógica revisada, cobertura concorrente executada no visitante.

Entrega local concluída. 126 testes aprovados; check-types aprovado; builds frontend/backend aprovados; hooks normais aprovados. Workspace conserva somente duas alterações prévias. Concorrência backend não validada em integração real de pagamentos; essa verificação permanece limitação de cobertura.
