# Remoção do legado da aplicação

## Objetivo e decisões aprovadas

Eliminar modelos duplicados, APIs antigas, adaptadores e código morto. Preservar dados, histórico financeiro, edições offline e exclusões.

Exceções explícitas: redirecionamentos de `/salaries` e `/subscriptions`, autenticação existente, migrações históricas e conversores isolados de upgrade. Aplicação atual passa a operar exclusivamente com contratos atuais.

Registrar execução em `plans/0017-remove-application-legacy.md`, com progresso atualizado por etapa.

## Implementação, em ordem

### 1. Preparar conversão e conferência

- Inventariar consumidores de modelos, campos, endpoints, stores e exports antigos. Classificar cada ocorrência como legado ativo, código morto, histórico ou exceção aprovada.
- Criar auditoria local de contagens, valores, IDs, vínculos, históricos e tombstones. Conferir equivalência financeira antes de remover qualquer estrutura.
- Extrair `legacySource` e `legacyId` de recorrências para registro exclusivo de upgrade. Preservar mapeamento por proprietário, origem e ID antigo, incluindo destinos excluídos.
- Disponibilizar resolução autenticada desses IDs apenas ao conversor de upgrade. Necessário porque IndexedDB usou UUIDs em colisões, enquanto SQL usou IDs determinísticos diferentes.
- Preparar arquivo de auditoria para dados históricos sem representação atual. Remoção nunca pode depender de descarte silencioso.

### 2. Isolar upgrades do armazenamento local

- Retirar conversão da inicialização comum de `localStorage`. Carregar módulo de upgrade somente quando versão ou marcador indicar dados antigos.
- Concentrar conversões de stores sem proprietário, pagamentos de cartão, compras, recorrências, rendimentos, cashback e empréstimos nesse módulo.
- Converter atomicamente por proprietário; preservar clocks, alterações pendentes, exclusões, IDs e vínculos. Reexecução deve produzir mesmo resultado.
- Resolver colisões e referências antes de liberar sincronização. Proprietário ambíguo exige revisão explícita; nunca atribuir dados à conta atualmente conectada.
- Manter originais recuperáveis até conferência. Remover stores antigos em upgrade de schema posterior, somente após conversão completa de todos os registros.
- Banco novo cria somente stores atuais. Banco já convertido não carrega nem executa conversores.

### 3. Concluir unificação das recorrências

- Remover controllers de salários e assinaturas, adaptador de recorrências, serviços frontend antigos e processadores de compatibilidade sem consumidores.
- `/recurring` aceita somente DTOs atuais. Remover uniões com payload antigo e respostas contendo proveniência da migração.
- Unificar referências como `recurrenceId` e `recurrenceOccurrenceDate` em transações, compras, rateios, projeções, dashboard e sincronização.
- Renomear referências de compras hoje chamadas `subscriptionId` e de rateios hoje chamadas `recurringPaymentId`. Atualizar FKs, índices, triggers e views.
- Transferir exclusão de compras vinculadas ao módulo de recorrências antes de eliminar módulo de assinaturas.
- Simplificar interface para `movement`, `unit` e `interval`. Remover conversores visuais de salário/assinatura, drafts antigos e renderizações condicionais entre modelos.
- Após conferir conversão, remover tabelas `Salary`, `Subscription`, `RecurringPayment` e seus históricos já transferidos para `RecurrenceHistory`.
- Preservar cursores, ocorrências excluídas e recorrências pendentes de configuração. Remoção não gera lançamentos retroativos.

### 4. Eliminar gravação paralela de dívidas

- Substituir armazenamento visitante em `Debt` por eventos manuais associados a `DebtPerson`. Criação, edição, exclusão e dashboard usam mesmo modelo de livro do backend.
- Converter dívidas antigas em eventos de origem; dívidas pagas recebem compensação histórica, preservando saldo líquido e datas conhecidas.
- Acrescentar grupo `debtEvents` tipado ao sync. Aceitar apenas eventos manuais do proprietário e compensações provenientes do upgrade; eventos de transações e compras continuam derivados das respectivas origens.
- Preservar idempotência, exclusões, edição concorrente e privacidade bilateral. Sync nunca permite editar eventos de terceiros ou duplicar efeitos financeiros.
- Remover grupo `debts`, métodos CRUD antigos, identificação de pessoas por fallback textual e consultas às tabelas antigas.
- Arquivar histórico não representado pelo livro atual; depois remover `Debt` e `DebtHistory`.

### 5. Remover compatibilidade financeira restante

- Transferir créditos órfãos de `CreditPurchaseLegacyEntry` para fila atual de revisão, com proprietário, cartão, ID e dados originais. Preservar endpoints de revisão e aprovação sem consultas ao arquivo legado.
- Remover `CreditPurchaseLegacyEntry` após conferir referências e pendências. Manter `CreditEntryReference`, tombstones e projeções financeiras atuais, pois ainda têm consumidores.
- Converter categoria única para associações de tags em transações, compras e itens de importação. Depois remover campos escalares redundantes e fallbacks visuais.
- Manter `Category`, `TagAssignment.categoryId` e filtros de categoria: continuam conceitos atuais.
- Retirar normalização de `yieldRate`, `cashbackYieldRate` e formatos antigos de salário do fluxo normal; conversões ficam no upgrade.
- Mover revisão de empréstimos antigos para fluxo de upgrade. Preservar pagamentos concretos e contadores derivados; SACRE exige escolha explícita, sem conversão financeira automática.
- Substituir heurística de financiamento antigo por referências persistidas ou conciliação explícita. Ambiguidade não pode criar compra duplicada.
- Remover cliente HTTP `api` sem consumidores, `LegacyDashboard`, helpers, exports e testes exclusivos de código eliminado. Remover dependências somente após confirmar ausência de uso em código, scripts e configuração.

## Contratos e persistência

- Sync passa a usar exclusivamente recorrências atuais, livros de cartão e eventos de dívida; elimina coleções e campos antigos.
- Endpoints removidos deixam de ser registrados. Payloads antigos nos endpoints atuais retornam erro de validação, sem conversão silenciosa.
- DTOs novos usam TypeBox; contratos frontend manuais acompanham mudanças. Repositório atual não possui scripts de exportação OpenAPI e geração de SDK citados nas instruções gerais.
- Emitir contrato Prisma atualizado e adicionar novas migrações à cadeia existente. Preservar migrações aplicadas, snapshots, arquivo Prisma 7 e planos concluídos.
- Alterações destrutivas exigem conferência transacional prévia. Divergências abortam remoção, mantendo dados recuperáveis.
- Atualizar regras de negócio para descrever contratos finais e exceções de upgrade.

## Validação e critérios de aceite

- **SQL:** instalação limpa e atualização de fixtures antigas em PostgreSQL descartável local; conferir históricos, colisões, vínculos, valores, constraints e rollback após falha tardia.
- **IndexedDB:** upgrades de formatos antigos, múltiplos proprietários, dados ambíguos, interrupção, reexecução, abas concorrentes, tombstones e edições durante sync.
- **Recorrências:** cinco movimentações, intervalos, meses curtos, pausa, retomada, recomposição e exclusão sem recriação.
- **Cartões:** parcelas importadas, reembolsos parciais, órfãos, encargos, financiamento, cashback, rateios e equivalência de faturas.
- **Dívidas:** equivalência visitante/servidor, origens pagas, saldo cruzando zero, sync repetido, exclusões e privacidade.
- **Interface e acesso:** CRUD atual, revisões de upgrade, redirecionamentos antigos e login com senhas existentes.
- Atualizar E2Es que ainda exigem contratos removidos. Executar testes relevantes e builds dos pacotes afetados; conferir tipos pelos checks existentes, incluindo `tsc -b` do frontend.
- Aceite final: nenhuma leitura ou gravação normal usa estruturas antigas; nenhuma diferença financeira; nenhuma perda de pendências; referências antigas restritas ao histórico e às exceções aprovadas.

## Entrega

Commits locais atômicos por etapa, usuário local como autor e committer, trailer de coautoria Codex e hooks normais. Atualizar plano junto de cada etapa concluída.

Execução e testes somente locais. Aplicação em banco externo, push e deploy ficam com usuário, mediante pedido específico.

## Progresso de execução

- [x] Etapa 1: inventário em `docs/application-legacy-inventory.md`; auditoria local somente leitura em `packages/sql/scripts/audit-application-legacy.ts`; migração aditiva de arquivo e mapeamento por proprietário; resolução autenticada exclusiva de upgrade em `/upgrades/recurrence-ids`.
- [ ] Etapa 2: isolar conversores IndexedDB e controlar marcadores de upgrade.
- [ ] Etapa 3: remover contratos e estruturas antigas de recorrências.
- [ ] Etapa 4: unificar eventos de dívida no visitante e sync.
- [ ] Etapa 5: remover compatibilidade financeira restante.

Etapa 1 conserva fontes antigas. Registro de upgrade preserva destinos excluídos, inclusive schedules removidos após a migração anterior. Arquivo conserva JSON original e históricos. Conferência em fixtures PostgreSQL locais cobre colisões, namespace por proprietário, somas preservadas e rollback após falha tardia. Auditoria dos dados reais permanece local e deve preceder qualquer remoção destrutiva.
