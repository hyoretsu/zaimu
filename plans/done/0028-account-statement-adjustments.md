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
- [x] Integrar commits locais em main preservando alterações alheias.

Validação local: suíte financeira (237 testes), testes direcionados (50), cache (6), cadeia de ajustes IndexedDB e builds frontend/backend passaram. Hooks normais passaram com formatação, lint, type-check dos quatro pacotes e cobertura unitária do backend. Fixtures e manifesto de testes atualizados conforme falhas dos hooks.

Revisão automática de permissões voltou a aceitar commits em 16/10. Commit local criado; rebase sobre `46914bc2` concluído sem conflitos.

Migração reconstruída offline sobre `a1ae3881cd04135404e1bab46e48e087300ea0e14eb9127fbfe389cb529b2dba`, incluindo `invoicePaymentTiming` existente. Única operação nova: coluna anulável `manualTotalAmount`. Referência DB preservada em `0567ee71a30f4562462e07ff2776133815a39ed36b3807bdeafbfa0e1527e22e`.

## Entrega

- Funcionalidade `49a27d6c` integrada em `main` por fast-forward; identidade local preservada, com trailer Codex.
- Após rebase, 237 testes financeiros e 26 testes de saldo/armazenamento visitante passaram. Builds frontend/backend passaram novamente. Hooks da migração reconstruída passaram.
- Worktree da tarefa limpo após commit. Mudanças concorrentes preservadas; referência DB e `bunfig.toml` não foram alterados pela tarefa.
- Migração preparada, sem execução em banco. Sem push ou deploy.
