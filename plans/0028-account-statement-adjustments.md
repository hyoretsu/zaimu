# Ajustes de saldo e fatura com remoção automática

Branch original: `main`. Worktree: `/tmp/zaimu-adjustments`.

## Regras aprovadas

- Agrupar ajustes por conta; múltiplas datas, comparação por dia, adicionar data com conta pré-selecionada.
- Total manual de fatura inclui transporte e créditos anteriores, antes dos pagamentos.
- Remover ajustes redundantes de saldo e fatura na precisão da moeda, após cálculos reais concluídos; nunca em consultas/projeções.
- Preservar lançamentos e proteger edições concorrentes. Remoção permanente.
- Migração somente local; sem banco externo, push ou deploy.

## Progresso

- [x] Inspecionar rascunho existente e confirmar semântica com usuário.
- [x] Concluir agrupamento e criação por conta.
- [x] Implementar total final de fatura e remoção automática nas fronteiras de persistência.
- [x] Implementar remoção de ajustes de saldo após recálculos.
- [x] Validar testes, hooks e builds afetados; atualizar regras.
- [ ] Integrar commits locais em main preservando alterações alheias.

Validação local: suíte financeira (237 testes), testes direcionados (50), cache (6), cadeia de ajustes IndexedDB e builds frontend/backend passaram. Hooks normais passaram com formatação, lint, type-check dos quatro pacotes e cobertura unitária do backend. Fixtures e manifesto de testes atualizados conforme falhas dos hooks.

Revisão automática de permissões voltou a aceitar commits em 16/10. Commit local criado; rebase sobre `71880161` concluído sem conflitos.

Migração reconstruída offline sobre `a1ae3881cd04135404e1bab46e48e087300ea0e14eb9127fbfe389cb529b2dba`, incluindo `invoicePaymentTiming` existente. Única operação nova: coluna anulável `manualTotalAmount`. Referência DB preservada em `0567ee71a30f4562462e07ff2776133815a39ed36b3807bdeafbfa0e1527e22e`.

## Próximos passos

1. Concluir builds após rebase e hooks da migração reconstruída.
2. Integrar commit local em `main` por fast-forward.
3. Preservar `packages/sql/migrations/app/refs/db.json` e `bunfig.toml` preexistentes no worktree original.
