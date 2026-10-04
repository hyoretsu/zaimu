# Suítes confiáveis, cobertura por risco e paralelismo nativo no Bun

## Objetivo e decisões

Corrigir lacunas encontradas na auditoria, preservar testes existentes e organizar execução escalável por pacote, domínio e tipo de teste.

Decisões aprovadas: Bun 1.4.2, metas por risco e infraestrutura descartável. Validação preliminar: paralelismo nativo passou nos 65 testes financeiros e eliminou interferência entre os seis testes de IndexedDB.

Plano versionável neste arquivo. Na implementação, atualizar etapas concluídas e criar commits locais atômicos com identidade Git do usuário e coautoria Codex. O salvamento inicial deste plano não incluiu commit, conforme solicitação do usuário naquela etapa.

## Organização e execução

- Fixar Bun 1.4.2 no `packageManager`, imagens Docker e configuração de testes do CI.
- Manter unitários junto ao código: `*.test.ts`; componentes: `*.test.tsx`. Integrações ficam em `tests/` dentro do módulo, com sufixo `*.integration.test.ts`; jornadas de navegador usam `*.e2e.test.ts`.
- Classificar cada teste exatamente uma vez. Migrações SQL, IndexedDB, contratos HTTP, Redis e RabbitMQ pertencem às integrações. Testes de componentes com DOM ficam separados de funções puras.
- Criar executor fino em `scripts/test-runner.ts`: selecionar arquivos, configurar ambiente, preparar recursos e delegar execução ao Bun. Usar paralelismo, isolamento, sharding e timings nativos; não implementar pool próprio de workers.

| Comando | Responsabilidade |
|---|---|
| `test:unit` | Funções e unidades sem serviços reais |
| `test:components` | Componentes React e interações em DOM |
| `test:integration` | IndexedDB, SQL, contratos HTTP, cache e broker |
| `test:e2e` | Jornadas reais no navegador |
| `test:coverage` | Coletar, consolidar e validar cobertura |
| `test:all` | Executar todas as suítes disponíveis |

Cada pacote expõe somente comandos correspondentes às suas suítes. `test` executa testes sem infraestrutura externa; `test:all` inclui fixtures descartáveis. Migrar testes HTTP do backend para `test:integration` e atualizar chamadas atuais de `test:e2e`.

Regras de execução:

- `--parallel=2` como padrão; parâmetro `--workers` permite ajuste. Isolamento por arquivo sempre ativo.
- Casos dentro do arquivo permanecem sequenciais. Usar `test.concurrent` somente quando fixtures e estado forem independentes.
- Aceitar `--shard=i/n`, `--seed` e filtro por domínio. Timings orientam balanceamento; ausência deles não impede execução.
- Produzir logs, JUnit, timings e cobertura em diretórios exclusivos por pacote, suíte e shard.
- Falha de preparação, suíte esperada vazia ou teste selecionado ignorado indevidamente resulta em erro. Retentativas automáticas ficam desativadas.

## Isolamento, infraestrutura e qualidade

### Estado local e componentes

- Extrair fixtures reutilizáveis para IndexedDB, DOM, autenticação e QueryClient.
- Criar ambiente próprio antes de importar módulos; fechar banco, remover dados e restaurar globais, mocks, timers e stores ao terminar.
- Dividir testes extensos de armazenamento em cenários independentes. Nenhum caso depende da execução anterior para inicializar estado.
- Adicionar Happy DOM, Testing Library e `user-event` para componentes. Validar comportamento visível, acessibilidade, preenchimento, submissão, descarte, carregamento, erros e bloqueio restrito ao registro pendente.
- Preservar verificações estáticas úteis; evitar assertions dependentes de classes CSS ou estrutura incidental do HTML.

### Integrações e fixtures

- Criar Compose exclusivo de testes: PostgreSQL 17, Redis 8.2 e RabbitMQ 4.1, serviços sem volumes persistentes e portas locais disponíveis automaticamente.
- Identificar recursos por execução e arquivo: banco PostgreSQL próprio, namespace Redis próprio e broker exclusivo quando teste reinicia serviço.
- Remover nomes fixos de bancos, portas e containers dos testes atuais; fornecer recursos pela fixture.
- Aplicar migrações somente aos bancos descartáveis, usando cópia temporária dos arquivos de controle para preservar referências versionadas.
- Aguardar healthchecks; encerrar conexões e remover recursos em sucesso, falha ou interrupção. Timeout precisa identificar serviço e suíte.
- Ambiente de teste recebe URLs explícitas locais. SMTP e chamadas ao Banco Central usam doubles; nenhum worker que consulta serviços externos é iniciado.
- Integrações exigidas pelo comando não podem terminar verdes por ausência de variável de ambiente.

### Contratos HTTP e jornadas

- Dividir teste HTTP de mais de mil linhas em suítes por domínio: autenticação, contas/rendimentos, transações/importações, cartões/reembolsos, dívidas, empréstimos, recorrências, dashboard e sincronização.
- Compartilhar builders e helpers, mantendo dados e sessões independentes. Preservar assertions existentes, identificando qualquer substituição.
- Testar autorização entre usuários, validação de DTOs, paginação, idempotência, concorrência e rollback nos fluxos financeiros críticos.
- Executar navegador através de `bun:test` com biblioteca Playwright. Cada teste recebe contexto novo; cada suíte, aplicação e backend locais próprios.
- Cobrir importação pendente/aprovação/descarte, pagamentos, reembolsos, recorrências e sincronização após edição local. Incluir autenticação com 429 sem redirecionamento indevido.
- Usar Chromium em desktop e viewport móvel. Guardar screenshot e trace nas falhas.

## Cenários de borda, regressões e consistência em todos os módulos

Ampliação solicitada após auditoria de previsões em 04/10/2026. A suíte anterior podia passar com totais corretos e composição errada, ou sem executar períodos futuros e limites de fuso. Cobertura de linhas não substitui estes cenários. Esta seção registra trabalho a implementar; não declara novos testes concluídos.

### Método obrigatório por módulo

- Inventariar módulos backend, rotas/frontend, serviços locais, componentes compartilhados, `packages/finance`, `packages/sql` e infraestrutura. Cada área deve ter responsável lógico na matriz, arquivos de teste e lacunas registradas; módulos novos entram no inventário na mesma alteração.
- Derivar resultados esperados de `docs/business-rules.md` e fixtures com valores conhecidos. Não usar a função testada, a mesma consulta ou outro consumidor do mesmo cálculo para gerar o esperado. Testar regras, não reproduzir implementação.
- Para cada regra aplicável, cobrir caminho comum, limites, ausência de dados, erro e mudança de estado. Para dinheiro, cobrir zero, centavos, divisão com resto, pagamento parcial, saldo insuficiente e valores negativos somente quando permitidos. Para datas, cobrir ontem/hoje/amanhã, início/fim inclusivos, fim de mês/ano e ano bissexto.
- Executar cenários sensíveis a calendário em processos separados com `TZ=UTC` e `TZ=America/Recife`; acrescentar fuso com horário de verão para regras de calendário. Fixar relógio antes de importar código dependente de hoje. Não alterar `TZ` ou relógio global durante casos concorrentes.
- Comparar comportamento conectado e visitante com fixture financeira equivalente e esperado independente. Comparar valores por conta, saldos consolidados, classificação dos fluxos e efeitos persistidos; igualdade entre modos sozinha não prova correção.
- Validar contrato HTTP, serviço local e apresentação nos casos em que o bug pode surgir entre camadas. Mock de retorno final não substitui integração que exercita consulta, montagem do DTO ou seleção das parcelas.
- Todo bug corrigido ganha reprodução mínima que falha na revisão anterior e passa após correção. Para falhas já corrigidas, demonstrar isso em checkout temporário local ou alteração controlada e revertida, preservando workspace do usuário.
- Cada caso registra ID, prioridade, regra, pré-condições, entradas, ação, esperado explícito, camada, arquivo e status. Usar unitário para regra isolada, integração para persistência/contrato e componente/E2E para comportamento visível; evitar duplicar todas as combinações em todas as camadas.

### Matriz de módulos e resultados obrigatórios

Prioridades: P0 protege dinheiro, identidade e integridade; P1 protege apresentação, configuração e recuperação. As linhas agrupam módulos relacionados sem dispensar testes de cada módulo nomeado.

| Área e módulos | Prioridade | Cenários e resultados esperados |
|---|---|---|
| Autenticação (`auth`), sessão e exclusão de conta | P0 | Sessão ausente/expirada, 401/403, 429 e indisponibilidade distintos; 429 mantém sessão/rota. Troca de usuário não reutiliza cache ou IndexedDB alheio. Logout e exclusão limpam somente dados do proprietário; cancelamento de exclusão não produz efeito. Emails usam servidor local falso. |
| Contas (`accounts`), instituições e padrões | P0 | Corrente, dinheiro, poupança, investimento, cashback monetário, pontos e cartão entram somente nos grupos permitidos. Oculta/excluída não reaparece em totais ou seletores. Primária/padrão de faturas/conta do cartão respeitam precedência e proprietário. Exclusão limpa vínculos; saldo insuficiente não consome reserva real. |
| Ajustes de saldo e rendimentos (`accounts`) | P0 | Ajuste fixa fechamento sem receita/despesa fictícia; editar lançamento anterior altera diferença, não saldo fixado. Um ajuste por conta/data; cartão e pontos rejeitados. Rendimento depois de entradas/saídas e antes do ajuste; saldo não positivo, fins de semana, feriados, impostos, faixas e vigências com valores exatos. Edição/exclusão manual permanece soberana ao recalcular. |
| Taxas de referência (`reference-rates`) | P0 | Janela móvel de dez anos, hoje excluído, dias sem publicação sem zero artificial, CDI/Selic independentes. Histórico incompleto torna parcela pós-fixada indisponível, mantendo prefixada. Correção, retomada de carga e repetição não duplicam taxas. Banco Central simulado. |
| Transações (`transactions`) | P0 | Entrada/saída/transferência/estorno, mesma data com/sem horário, limites da página e filtros combinados. Transferência muda duas contas sem fluxo consolidado. Editar data, valor ou conta recalcula consumidores; exclusão não deixa efeito órfão. Busca/paginação não perde nem repete itens com datas iguais; pendências importadas ficam fora. |
| Importação de extratos (`transaction-imports`) | P0 | Lote pendente, aprovação parcial, descarte e retomada; saldo só muda após aprovação. ID externo por conta, identidade sintética com ocorrências iguais, reimportação e aliases sem duplicação. Sugestão de transferência exige contas distintas, valores/data iguais e horários válidos com limite de um minuto; recusa persistente e concorrência não recriam par. |
| Cartões (`creditCards`), compras e faturas | P0 | Compra no fechamento, vencimento em fim de semana, mês curto, parcelas concretas/importadas e projeções sem persistência. Soma das parcelas em centavos igual ao total. Pagamentos antes/depois do fechamento, parciais, fixos recorrentes, excedentes e principal transportado entram uma vez. Fatura mista reparte assinaturas proporcionalmente; estorno/reembolso parcial/total e antecipação preservam saldo e limite. |
| Importação de faturas (`credit-card-imports`) | P0 | Parcela posterior identifica raiz; total não inferido multiplicando parcela. Preservar centavos importados e repartir restante desconhecido. Diferença de até R$ 1,00 sugere conciliação sem aprovar sozinha; ambiguidades, senha inválida, crédito sem compra e parcelas incompatíveis exigem revisão. Aprovar/retomar/conciliar repetidamente não duplica compra. |
| Recorrências (`recurring`) | P0 | Todas as movimentações e unidades/intervalos, dia 31 e 29/02 recuperam âncora. Pausa/edição/retomada não reescrevem passado; dia da edição elegível. Cursor recupera dias perdidos uma vez; antecipação usa identidade agendada e não reaparece em previsão. Exclusão mantém marcador; operação atômica inclui dívida/recompensa/cursor. Compra/pagamento no cartão não duplicam saída da fatura. |
| Legados (`salaries`, `subscriptions`) e redirecionamentos | P1 | Inventariar código remanescente sem ressuscitar endpoints removidos. Rotas antigas redirecionam para recorrências; payload legado inválido é rejeitado. Dados migrados preservam valores/identidades e deixam de aparecer em fontes legadas de saldo e previsão. |
| Dívidas (`debts`), rateios e convites | P0 | Cotas/percentuais/fixos com centavo restante, titular incluído/excluído e destinatário do restante. Eventos privados por pessoa, total conservado, descrição atual da compra e raiz parcelada gerando dívida uma vez. Convite/aceite/recusa repetidos, pagamento que zera/inverte saldo e edição/exclusão recalculam sem duplicar eventos; ordenação `pt-BR` não muda arredondamento. |
| Empréstimos (`loans`) | P0 | Cronograma e amortização com valores conhecidos, parcelas pagas/pendentes, antecipação frontal/final e última parcela. Lista e fluxo previsto usam `totalPaid` de cada parcela futura não paga, não `firstDueDate`/valor nominal após pagamentos. Vencimentos passados/hoje ficam fora da previsão; cancelar revisão não altera dívida. |
| Dashboard (`dashboard`) e gráficos | P0 | Períodos passados, atuais, exclusivamente futuros e personalizados; incluir movimentações entre amanhã e início futuro no saldo inicial, mas não no fluxo daquele intervalo. Hoje é saldo real, previsão começa amanhã. Contas, patrimônio, reservas, rendimentos, receitas/despesas e composição das barras/tooltips devem bater com esperado independente; ajustes não geram fluxo, nem faturas/assinaturas dupla contagem. Filtros do gráfico não mudam indicadores. |
| Categorias (`categories`) e estabelecimentos (`stores`) | P1 | Nomes vazios/equivalentes, caixa/acentos, isolamento por usuário, paginação e seleção dinâmica pesquisável. Editar/excluir vínculos preserva transação e saldo; filtros/listagens refletem mudança sem duplicação. Concorrência na criação mantém unicidade prevista. |
| Open Finance (`open-finance`) | P0 | Com doubles Pluggy: PENDING/confirmado, aliases bancário/Pluggy, reconexão, reconsulta, correção sem edição local versus conflito local. Dados exatos materializam uma vez; ambíguos vão à revisão. Pagamento vincula cartão sem despesa duplicada; ausência remota não exclui histórico. Pausa/desvínculo durante execução impede efeitos; 429 não encerra sessão. Credenciais não vazam em DTO/log. |
| Sincronização (`sync`), IndexedDB e serviços locais | P0 | Offline/retomada, conflito de edição/exclusão, clocks iguais, resposta fora de ordem, retry e duas sessões. Troca de proprietário e logout durante requisição nunca gravam no cache de outro usuário. Aliases e ocorrências antecipadas mantêm identidade; transação falha por inteiro; invalidação atualiza todos os consumidores afetados. |
| Upgrades (`upgrades`), conversores locais e `packages/sql` | P0 | Migrar dados legados, parcialmente migrados, inválidos e IDs em colisão em banco descartável; repetição não duplica nem perde valores/vínculos. Arquivo dos originais e marcador pendente preservados na falha; sincronização bloqueada até resolver referências. Constraints e rollback observados via SQL, sem alterar refs versionadas ou banco compartilhado. |
| Motor compartilhado (`packages/finance`) | P0 | Invariantes de conservação de centavos, transferência interna sem fluxo, consumo de contas/reservas pela ordem definida, déficit na origem/primária e rendimentos só no saldo restante positivo. Projeção não modifica entradas/livros. Gerar combinações determinísticas de calendários, pagamentos, reembolsos e rateios; seeds reproduzíveis e exemplos mínimos para falhas. |
| Infraestrutura compartilhada (`shared`) e worker | P0 | Redis/RabbitMQ isolados por ambiente em cache, locks, fences, registries, exchanges, filas, retry e DLQ. Outbox e consumidor repetidos aplicam efeito uma vez; lease expirada, crash entre publicação/ack, mensagem fora de ordem e falha de transação são recuperáveis. Cache nunca publica dado anterior após mutação/invalidação concorrente. |
| Componentes, hooks, stores, configurações e navegação frontend | P1 | Skeleton até todas as consultas necessárias terminarem, erro/empty só após resolução; ação pendente bloqueia somente registro conflitante. Salvar/descartar restaura estado, debounce preserva texto/undo e submissão captura último valor. Seletores pesquisáveis e especiais no topo, confirmação destrutiva expira, toast final visível. Rotas filhas, deep links, tema, mobile/touch, scrollbars contidas e acessibilidade por teclado; páginas de termos/privacidade e menu continuam acessíveis. |

### Regressões concretas da auditoria de previsões

Concluir primeiro as lacunas abaixo, usando caminhos reais de montagem de dados. Reaproveitar regressões já adicionadas na auditoria, sem presumir que validam camadas que mockam.

| ID | Fixture e ação | Resultado obrigatório | Camadas |
|---|---|---|---|
| PREV-001 | Hoje em outubro; entrada/saída entre amanhã e novembro; selecionar somente novembro. | Saldo inicial de novembro inclui movimentações anteriores; fluxo de novembro as exclui. Backend e visitante iguais ao esperado. | Integração SQL/IndexedDB e comparação |
| PREV-002 | Selecionar fim do mês às 23:59:59 em Recife; executar também UTC, com transações no último dia e no primeiro seguinte. | Datas do intervalo preservadas; último dia incluído uma vez, próximo excluído. Dashboard e gráfico usam mesmo calendário. | Serviço local, contrato HTTP e componente |
| PREV-003 | Fatura de R$ 200,00: R$ 100,00 assinatura e R$ 100,00 compra comum; pagar R$ 50,00 antes do fechamento. | Pagamento contém R$ 25,00 de assinatura; restante R$ 150,00 contém R$ 75,00. Repetir com `CARD_PAYMENT` recorrente, histórico e projetado. | Financeiro, montagem backend/visitante e tooltip |
| PREV-004 | Empréstimo com primeira parcela paga, outra hoje, próximas com `totalPaid` diferente do nominal. | Previsão lista somente futuras não pagas, nas datas e valores das parcelas; dashboard/fluxo/lista concordam. | Contrato HTTP, serviço local e componente |
| PREV-005 | Recorrência antecipada com transação vinculada; histórico/marker carregados; estorno e transação de hoje. | Próxima ocorrência já vinculada não repete; estorno e hoje não viram despesa futura. Sem gravações na projeção. | Recorrência, serviço local e integração |
| PREV-006 | Cashback monetário futuro destinado a conta de recompensas distinta da primária; pontos separados. | Cashback entra na conta correta e no consolidado; pontos fora do patrimônio monetário. | Motor, contexto financeiro conectado/visitante |
| PREV-007 | Outubro: conta R$ 4.681,01 e renda fixa R$ 3.284,26. Novembro: entrada R$ 2.100,00; saída R$ 1.793,04, sendo R$ 69,90 fora do cartão, R$ 614,46 assinaturas e R$ 1.108,68 outras compras. | Novembro: conta R$ 4.987,97, patrimônio R$ 8.272,23, crescimento R$ 306,96. Segmentos somam saídas; faturas subtotal R$ 1.723,14 não soma novamente às suas partes. | Motor/contexto, DTO, barras e tooltip |

### Jornadas entre módulos e prova de proteção

- Importar pendente -> aprovar parcialmente -> repetir importação -> editar valor/data -> atualizar contas, cartões, dívidas, dashboard e sincronização. Conferir saldo e fluxo em cada etapa contra fixture; descarte não deixa efeito financeiro.
- Recorrência no cartão -> rateio -> materialização/antecipação -> pagamento parcial/fixo -> reembolso -> próximo ciclo. Conferir calendário, principal, assinaturas, limite e dívida; nenhuma etapa duplica valor ou identidade.
- Empréstimo -> pagar parcela -> antecipar -> selecionar período futuro -> repetir offline/conectado. Conferir cronograma remanescente, listagem prevista e saldo projetado.
- Taxa/feriado/configuração retroativa -> rendimento real -> ajuste de fechamento -> previsão. Histórico respeita dados reais e override manual; previsão usa médias disponíveis e não altera persistência.
- Falha/rollback no meio da operação -> retomada/retry -> cache invalidado -> UI atualizada. Conferir ausência de efeitos parciais ou duplicados em SQL, IndexedDB, eventos e consumidores.
- Para casos P0, provar que teste detecta erro relevante: omitir dia/conta, atribuir pagamento inteiro a assinatura, duplicar evento ou trocar proprietário. Usar mutações locais pontuais; restaurar antes do commit. Percentual de cobertura alto não encerra lacuna sem assertion do resultado esperado.

## Cobertura, cache e CI

- Consolidar LCOV por caminho de origem, somando execuções correspondentes. Calcular percentuais ponderados por linhas e funções; não tirar média dos percentuais dos arquivos.
- Exibir separadamente cobertura instrumentada e inventário de arquivos nunca carregados. Arquivo ausente não conta como coberto; relatório não apresenta percentual instrumentado como cobertura global.
- Excluir testes, fixtures, declarações e código gerado. Imports indiretos de outros pacotes não alteram denominador do pacote avaliado.
- Acrescentar testes específicos de antecipação importada, hoje ausente da suíte financeira própria.
- Adotar metas: financeiro com 95% de linhas e 90% de funções; regras backend de saldo, rendimento, dívida, recorrência e fatura com 85%/80%; cálculos e conciliação frontend com 85%/80%.
- Registrar baseline após corrigir isolamento e consolidar suítes. Bloquear regressões nas áreas acompanhadas e novos arquivos críticos sem teste. Componentes e jornadas exigem cenários comportamentais explícitos.
- Corrigir entradas Turbo para incluir implementação, testes TS/TSX, fixtures, configurações e executor, além das dependências relevantes. Integrações e E2E ficam sem cache.
- Corrigir detecção de afetados por tarefa: usar pares pacote/tarefa retornados pelo Turbo. Mudança financeira precisa agendar testes dos consumidores afetados.
- CI executa unitários, componentes, integrações e cobertura dos pacotes afetados em qualquer PR. Integrações usam serviços efêmeros do runner, sem depender de secrets de banco.
- E2E executa em PRs destinados a `staging`/`main`. Backend/frontend usam dois shards para suítes com múltiplos arquivos; financeiro mantém um. Cada job usa dois workers.
- Publicar relatórios como artifacts do workflow; agregação aguarda todos os shards e falha se algum relatório esperado estiver ausente.
- Documentar comandos, classificação, fixtures e diagnóstico em `docs/testing.md`.

## Etapas e critérios de aceite

- [ ] **Corrigir execução:** alinhar Bun, criar comandos, ajustar CI/Turbo e eliminar interferência IndexedDB.
- [ ] **Organizar suítes:** classificação completa, fixtures comuns e divisão dos testes extensos.
- [ ] **Isolar integrações:** infraestrutura descartável e remoção dos skips dependentes de configuração ausente.
- [ ] **Ampliar proteção:** componentes, contratos HTTP e jornadas críticas.
- [ ] **Inventariar bordas por módulo:** preencher arquivos/status para todas as áreas da matriz e separar regressões existentes de lacunas.
- [ ] **Fechar regressões de previsão:** executar PREV-001 a PREV-007 nas camadas indicadas, incluindo UTC/Recife e paridade conectado/visitante.
- [ ] **Cobrir todos os módulos:** implementar casos P0/P1 aplicáveis da matriz e jornadas entre módulos, com valores esperados independentes.
- [ ] **Aplicar cobertura:** consolidação, inventário, metas, baseline e documentação.

Aceite obrigatório:

- Todos os testes existentes preservados ou substituídos por verificações equivalentes documentadas.
- Resultado equivalente com um e dois workers; cinco execuções com seeds diferentes sem falhas.
- Duas execuções simultâneas sem compartilhar dados ou destruir recursos uma da outra.
- Alterar implementação ou teste TSX invalida cache correspondente; alterar financeiro agenda consumidores.
- Todas as suítes selecionadas executam; falha de fixture ou shard nunca produz resultado verde.
- Cobertura paralela equivale à execução serial e respeita metas definidas.
- Cada área da matriz tem cenários de borda implementados e rastreados por regra/arquivo; nenhuma fica coberta apenas por percentual, snapshot ou mock do resultado final.
- PREV-001 a PREV-007 passam nas camadas indicadas; casos de data passam em UTC/Recife e regras de calendário em fuso com horário de verão.
- Casos P0 detectam alterações incorretas controladas; paridade conectado/visitante inclui esperado independente e não só comparação entre modos.
- Recursos de teste removidos após falha e interrupção; relatórios preservados.
- Hooks normais passam nos commits; type-check e build passam nos pacotes afetados na validação final.

Implementação permanece local: sem push, disparo de CI, deploy ou acesso a banco compartilhado. Alterações preexistentes ficam preservadas.
