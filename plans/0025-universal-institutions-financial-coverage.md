# Instituições universais, perfis e cobertura financeira

Plano aprovado pelo usuário em 12/10/2026. Execução local, sem push, deploy, migrações em bancos compartilhados ou notificações externas.

## Escopo aprovado

- Separar instituição universal e vínculo pessoal. Propostas próprias utilizáveis antes da aprovação; demais usuários veem somente aprovadas. Revisão transacional, auditada, com aprovação, rejeição motivada e associação explícita. Versão desatualizada exige conferência. Notificações persistentes internas e contador.
- Perfil Padrão em todas as instituições. Regras versionadas por data, país e moeda. Histórico do perfil no vínculo usuário-instituição, incluindo passado/futuro. Ajustes particulares têm prioridade; lacunas deixam rendimento pendente. Mudanças retroativas recalculam sem apagar ajustes/exclusões do usuário.
- País ISO independente da moeda; nomes via Intl.DisplayNames. Preferência persistida e sugestão institucional sem restrição. CLDR oficial versionado, calendários nacionais public/bank de date-holidays, cobertura por país/ano, geração idempotente com bloqueio transacional, overrides administrativos e confirmação manual.
- Preservar instituições legadas privadas, políticas e resultados históricos. Candidatas por nome normalizado sem fusão automática. Fusão conserva diferenças privadas e exige resolução de conflitos de histórico. Inferir países apenas sem ambiguidade.
- Propagar contratos por APIs TypeBox, sincronização, Open Finance, cache e offline. Instituições aprovadas disponíveis offline; propostas globais exigem conexão.
- Cobertura financeira inclui juros/câmbio, associações CLDR, calendários, impostos, políticas e históricos de perfil. Consulta somente leitura; detalhes pessoais restritos. Admin preenche calendários e revisa lacunas.

## Progresso

- [x] Mapear instituições pessoais, cálculos e calendários existentes; identificar alterações prévias do usuário.
- [x] Modelos, migração e snapshot gerados offline; referência prévia preservada. Migração preserva dados legados e cria candidatos sem fusão automática. Testes de contrato e integridade da migração passaram.
- [x] Resolução temporal compartilhada e hidratação backend/local; testes de mudança futura, país/moeda e prioridade passaram.
- [x] Fixar CLDR 48.2.0/date-holidays 3.37.0; serviço de geração com lock e overrides; testes de fontes passaram.
- [ ] Finalizar publicação/rejeição/fusão, notificações e testes de revisão.
- [ ] Finalizar cobertura financeira e preferência/seleção de país; UI de perfis e revisão.
- [ ] Verificar sincronização, Open Finance e offline.
- [ ] Validar hooks, builds afetados e commits locais atômicos.

## Dados prévios do usuário

Preservar mudanças em frontend/src/components/ui/FormFieldRow.tsx e packages/sql/migrations/app/refs/db.json. A referência registrada aponta snapshot versionado existente; não avançar somente para corresponder ao snapshot mais recente.
