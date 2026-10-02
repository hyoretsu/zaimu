# Investigação: integração pessoal com Meu Pluggy

Pesquisa em 02/10/2026. Fontes públicas oficiais consultadas, sem cadastro, conexão bancária ou teste autenticado. Tempos abaixo são estimativas de experiência, não medições.

## Conclusão

Viável para uso pessoal, inclusive ferramenta self-hosted, com configuração inicial de dificuldade média para usuários técnicos e alta para usuários comuns. Depois da configuração, atualização bancária automática a cada 24 horas reduz bastante o trabalho recorrente. Não oferece experiência inicial de simplesmente clicar em conectar banco dentro do Zaimu.

Credenciais próprias por usuário não comprovam que o plano gratuito pode atender um Zaimu hospedado para vários usuários. A página do Meu Pluggy restringe uso em produtos para terceiros; a FAQ de preços admite tecnicamente o conector gratuito para produtos, destacando limitações. Falta confirmação explícita sobre esse modelo específico antes de adotá-lo como integração gratuita do serviço hospedado.

## Caminho do usuário

1. Criar conta no `meu.pluggy.ai`.
2. Conectar cada banco e concluir autorização no aplicativo/site bancário. Conferir saldo e extrato no Meu Pluggy antes de continuar.
3. Criar outro cadastro no `dashboard.pluggy.ai`, preferencialmente com mesmo e-mail. Site institucional descreve dois cadastros; guia técnico diz usar a mesma conta. Não foi validado se existe reaproveitamento efetivo do login.
4. Criar aplicação no Dashboard e copiar `Client ID` e `Client Secret`. Uma aplicação basta para vários bancos.
5. Habilitar conector `MeuPluggy` se ausente. Abrir Demo da aplicação, conectar via MeuPluggy e autorizar cada banco já conectado no portal. Escolher banco diretamente ou Sandbox não corresponde ao caminho pessoal gratuito.
6. Copiar `itemId` de cada conexão na Demo. Guia pessoal informa que `GET /v2/items` não está disponível para essas contas; não depender de descoberta automática de conexões por esse endpoint.
7. Informar credenciais e conexões no Zaimu e selecionar manualmente contas/cartões locais correspondentes.

Estimativa sem falhas: 10-20 minutos para usuário técnico com um banco; reservar 20-40 minutos para usuário comum seguindo tutorial. Vários bancos adicionam autorizações em dois lugares. Falhas bancárias podem estender significativamente esses tempos.

Principais obstáculos: dois portais com funções diferentes, termos técnicos, aviso comercial de trial de 15 dias que não limita uso pessoal, conector MeuPluggy eventualmente oculto e necessidade de vincular bancos já conectados. Adicionar banco depois exige nova conexão no portal e nova autorização na aplicação.

## Custos e limites confirmados

| Aspecto | Uso pessoal gratuito |
| --- | --- |
| Prazo | Sem expiração pelo trial comercial |
| Conexões | Até 5 ativas, contas do mesmo titular |
| Dados | Saldos, extratos, cartões e investimentos, conforme cobertura |
| Atualização bancária | Automática a cada 24 horas |
| Atualização manual do proxy | Não permite `PATCH` para forçar atualização |
| Webhooks | Disponíveis também para itens proxy |
| Suporte | Comunidade no Discord; sem SLA comercial |
| Enriquecimento | Não presumir categorização automática, merchants ou KYC do plano empresarial |

Conexões não equivalem necessariamente à quantidade de contas/cartões retornados. Confirmar cobertura de cada instituição e produtos efetivamente disponibilizados. Histórico de transações é divulgado como até 12 meses, sem garantir essa extensão para todo banco.

Página de preços anuncia plano empresarial de Dados a partir de R$ 2.500/mês. Trata-se de alternativa comercial, não custo obrigatório do uso pessoal.

## Como reduzir fricção no Zaimu

Fluxo inicial mais previsível: tutorial em etapas com links diretos, campos `Client ID`/`Client Secret`, inclusão de `itemId` por conexão, validação e seleção das contas locais. Mostrar problemas específicos: credenciais inválidas, item inexistente, autorização pendente ou ausência de contas.

Evolução possível: abrir Pluggy Connect no Zaimu restrito ao conector MeuPluggy e capturar `itemId` pelo `onSuccess`. Documentação geral permite esse callback e configuração de conectores. Validar emissão de Connect Token e funcionamento com conta pessoal gratuita antes de prometer esse fluxo. Pode eliminar cópia manual do ID e parte da navegação na Demo, mas não elimina cadastro no Dashboard, aplicação, credenciais ou conexão bancária no portal.

Exibir última atualização bancária e última importação no Zaimu separadamente. Botão de buscar dados consulta o que já existe na Pluggy; não força coleta nova no banco. Problemas de autorização da conexão original precisam ser resolvidos no Meu Pluggy.

## Esforço técnico no repositório

Complexidade média para extratos em revisão; maior para sincronização financeira completa e cartões.

- Autenticação: trocar credenciais por API Key via `POST /auth`; chave dura 2 horas. Renovação deve ser automática, sem pedir nova configuração ao usuário.
- Segredos: execução no backend para conta hospedada; armazenamento cifrado, isolamento por proprietário e exclusão/rotação. Não guardar Client Secret em frontend, logs ou cache IndexedDB. Modelo local/self-hosted exige estratégia própria para guardar segredo.
- Vínculos: persistir usuário, aplicação, `itemId`, conta remota e conta/cartão local escolhido. Não inferir destino bancário automaticamente.
- Coleta: buscar contas e transações paginadas; consumir novas informações por webhooks ou consultar dados já coletados em intervalo adequado. Não criar rotina que tente atualizar o proxy no banco.
- Infraestrutura: `backend/src/worker.ts` já oferece processamento em segundo plano e mensageria. Webhooks exigem HTTPS acessível publicamente; instalação local pode consultar leituras ao abrir o aplicativo, sem expor endpoint. Aplicativo fechado não importa localmente, embora Pluggy continue coletando.
- Revisão: `transaction-imports` já possui lotes pendentes, conciliação e `TransactionExternalReference`. Entrada atual depende de PDF; extrair criação de lote para serviço reutilizável pela API. Adaptar metadados de origem, hoje limitados aos providers de arquivos.
- Idempotência: não confiar apenas no `id` Pluggy. Documentação admite mudança por exclusão/recriação e novos IDs ao reconectar. Priorizar `providerId` quando disponível, identificar origem e conta, conciliar atributos e preservar referências aos registros locais.
- Correções: tratar eventos de criação, atualização e exclusão, além de reentregas. Exclusão externa pode ser temporária; não apagar cegamente histórico aprovado ou edições do usuário. Deduplicar também itens pendentes, antes da aprovação.
- Cartões: mapear faturas, compras, parcelas, estornos e pagamentos separadamente. `totalAmount` do parcelamento não é retornado por conectores Open Finance segundo documentação; existem lançamentos `PENDING` que não podem virar histórico concreto automaticamente. Validar com amostras reais de cada banco.

Regras atuais em `docs/business-rules.md` exigem aprovação explícita de importações e seleção manual da conta. Primeira versão deve buscar automaticamente e preparar revisão. Materializar movimentos automaticamente requer decisão de produto e alteração explícita dessas regras.

## Recomendação

Priorizar integração opcional para uso pessoal/self-hosted, começando por contas e extratos com revisão existente. Tutorial claro é requisito de produto. Não usar como único caminho de onboarding para público amplo.

Para oferta hospedada com credenciais próprias de cada usuário, resolver primeiro enquadramento com Pluggy. Documentação pública não estabelece claramente uma exceção para esse desenho. Pesquisa não incluiu contato externo nem validação autenticada.

## Fontes

- [Meu Pluggy: roteiro completo, regras e FAQ](https://www.pluggy.ai/meu-pluggy).
- [Guia de acesso à API](https://meu.pluggy.ai/en/api-guide).
- [Guia técnico de uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use).
- [Dashboard: conectores, itemId e credenciais](https://docs.pluggy.ai/en/docs/guides/dashboard-connectors).
- [Item: comportamento do proxy e atualização](https://docs.pluggy.ai/en/docs/connections/item).
- [Autenticação e duração de tokens](https://docs.pluggy.ai/en/docs/authentication).
- [Transações, IDs e metadados de cartão](https://docs.pluggy.ai/en/docs/products/transactions).
- [Webhooks](https://docs.pluggy.ai/en/docs/developer-tools/webhooks-ref).
- [Consentimentos](https://docs.pluggy.ai/en/docs/connections/consents).
- [Preços e FAQ do conector gratuito](https://www.pluggy.ai/pricing).
