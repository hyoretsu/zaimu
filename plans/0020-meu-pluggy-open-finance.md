# MeuPluggy com configuração guiada e importação automática

Plano aprovado em 03/10/2026. Implementação local; sem push, deploy, migração externa ou chamadas de escrita a serviços externos.

## Comportamento

- Disponível para contas autenticadas, no navegador e aplicativo.
- Primeira conexão busca todo histórico disponibilizado pelo banco.
- Busca ao iniciar aplicativo, após login e ao retornar à aba/app. Intervalo mínimo de 15 minutos por usuário; configuração recém-concluída e botão “Buscar agora” podem antecipar consulta.
- Transações e compras completas, sem conflitos, entram automaticamente. Correspondências exatas são vinculadas sem duplicar; casos ambíguos seguem para revisão existente.
- Correções bancárias atualizam registros sem edições locais posteriores. Registros editados seguem para conciliação.
- Aplicativo permanece utilizável durante busca. Meu Pluggy continua responsável pela coleta bancária a cada 24 horas.

## Configuração e interface

- Adicionar acesso “Open Finance” em Ajustes, com página própria usando convenção de pastas do Router.
- Assistente com quatro etapas: conectar bancos no Meu Pluggy; criar aplicação no Dashboard; informar e validar `Client ID`/`Client Secret`; adicionar `itemId` e escolher contas/cartões locais.
- Incluir links e instruções para habilitar conector MeuPluggy. Usar fluxo documentado com IDs copiados; widget embutido fica fora desta versão.
- Buscar contas remotas de cada conexão e permitir vincular apenas destinos compatíveis pertencentes ao usuário. Contas sem vínculo ficam fora da importação.
- Mostrar progresso da primeira busca, registros importados, pendências, última consulta e última atualização bancária separadamente.
- Permitir editar credenciais, adicionar conexões, pausar/retomar vínculos, desvincular e desconectar integração. Desconectar remove segredos e vínculos, preservando histórico financeiro.
- Pendências abrem revisões existentes. Metadados incompletos de compras terão campos obrigatórios para resolução antes da aprovação.
- Usar componentes estabelecidos, seletores pesquisáveis, inputs com debounce, skeletons e ScrollArea. Progresso permanece na interface; toast informa resultado final.

## Backend, persistência e contratos

- Criar módulo Open Finance com cliente HTTP Pluggy, autenticação renovável, paginação e adaptadores para contas, transações e faturas.
- Armazenar credenciais cifradas com AES-256-GCM e chave específica `OPEN_FINANCE_ENCRYPTION_KEY`. Segredos nunca retornam pela API, entram em logs ou persistem no navegador. Integração fica indisponível quando chave não estiver configurada.
- Persistir configuração por usuário, conexões, vínculos, estado da sincronização e registros externos com identidade, snapshot remoto, referência local e resultado do processamento.
- Unicidade por usuário, conta remota e identidade externa; preservar aliases para IDs substituídos e registros descartados para impedir reaparecimento automático.
- Expor `/open-finance` com operações de consultar configuração, validar/salvar credenciais, consultar/adicionar conexões, configurar vínculos, desconectar e iniciar sincronização. Respostas nunca incluem segredos.
- Sincronização retorna identificador de execução; consulta de status entrega progresso, contagens, erros por conexão e referências às revisões. Executar coleta no worker existente.
- Bloqueio persistente por usuário impede buscas concorrentes entre abas/dispositivos. Falhas em uma conexão não impedem processamento das demais; retries retomam execução sem duplicar efeitos.
- DTOs TypeBox com respostas tipadas. Frontend integra pelo cliente existente em `frontend/src/lib/api.ts`.
- Alterar contrato SQL atual e preparar migração pelo mecanismo existente. Nenhuma migração externa, deploy ou push durante implementação local.

## Importação e conciliação

- Extrair criação, aprovação e conciliação de importações para serviços reutilizados pelos controllers de PDF e integração. Acrescentar origem MeuPluggy sem confundir conector com banco.
- Reaproveitar tolerâncias atuais para sugestões. Conciliação automática exige identidade bancária já conhecida ou candidato único com mesma conta/cartão, data, valor exato, descrição normalizada e parcelamento compatível.
- Horários reais, quando ambos disponíveis, precisam coincidir. Horário ausente não vira meia-noite nem impede sozinho comparação; valores aproximados ou candidatos múltiplos exigem revisão.
- Comparar também registros importados por PDF e itens pendentes. Remover restrição que exclui compras candidatas apenas por já possuírem ID externo; guardar múltiplas referências externas por compra.
- Preferir `providerId` quando disponível, mantendo também ID Pluggy. Reconexões e mudanças de ID passam por correspondência exata antes de criar registros.
- Converter datas com semântica bancária correta; preservar datas sem horário. Não usar timestamp técnico como horário da compra.
- Cartões: agrupar parcelas da mesma compra, vincular faturas e preservar valores concretos importados. Falta de total, calendário ou vínculo suficiente bloqueia aprovação automática; não inferir total multiplicando parcela quando resultado não for comprovado.
- Distinguir pagamentos de fatura, estornos, encargos e compras. Pagamentos não criam nova despesa; estornos sem compra original identificada ficam em revisão.
- Transações `PENDING` permanecem como dados externos acompanhados, sem materialização automática. Processar quando confirmadas; parcelas futuras continuam previsões pelas regras existentes.
- Correções comparam registro local ao snapshot aplicado anteriormente. Sem alterações locais, atualizar pelos serviços financeiros e recalcular efeitos associados; alterações locais, transferências combinadas ou vínculos incompatíveis exigem revisão.
- Ausência de registro numa consulta não apaga histórico. Correções e descartes permanecem rastreados; buscas repetidas não recriam pendências idênticas.
- Não transformar saldo remoto em ajuste automático. Após mudanças, invalidar caches de transações, importações, cartões, faturas, saldos, dashboard e dívidas afetadas.

## Validação e entrega

- Testes unitários: paginação, renovação de token, normalização, datas sem horário, identidade externa e classificação de operações.
- Testes de integração locais: repetição de busca, concorrência, retomada após falha, isolamento entre usuários, duplicados PDF/API, parcelas sucessivas, reconexão, correções com/sem edição e descartes.
- Testes de interface: assistente, erros de credenciais/conexão, vínculos, importação automática, revisão, pausa/desconexão e gatilhos de abertura/retorno.
- Verificar que falha Pluggy ou HTTP 429 não bloqueia aplicativo nem encerra sessão Zaimu.
- Atualizar regras de negócio: aprovação automática será exceção explícita para MeuPluggy nos critérios definidos; importações PDF mantêm comportamento atual.
- Criar plano versionado com próximo número disponível e atualizar a cada etapa concluída. Commits locais atômicos, usuário local como autor/committer e trailer Codex; preservar alterações preexistentes.
- Executar testes pertinentes e validação pelos hooks normais. Validar builds dos pacotes afetados e regeneração das rotas.
- Integração entregue desativada até usuário concluir configuração. Testes automatizados usam respostas simuladas; validação com bancos reais exige credenciais fornecidas para essa finalidade.

## Execução

- [x] 1. Persistência, migração preparada, criptografia e cliente Pluggy com adaptadores testados.
- [ ] 2. Serviços reutilizáveis de importação, identidade e conciliação.
- [ ] 3. API autenticada, sincronização persistente no worker e invalidação de caches.
- [ ] 4. Assistente, vínculos, revisões e gatilhos de abertura/retorno.
- [ ] 5. Testes locais, builds, regras de negócio e revisão final.

Alterações preexistentes preservadas: `packages/sql/migrations/app/refs/db.json` e `frontend/src/routes/recurring/components/RecurringListItem.test.tsx`.

Etapa 1: migração Prisma Next preparada offline; chave AES validada; 10 testes simulados passaram. Nenhuma credencial real usada.
