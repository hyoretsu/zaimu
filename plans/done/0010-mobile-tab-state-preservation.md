# Persistência das abas mobile

## Objetivo

Manter tela atual, estado React e scroll independentes nas cinco abas da navegação mobile durante a sessão. Ao tocar novamente na aba ativa, retornar à raiz e ao topo sem atualizar consultas explicitamente.

## Restrições

- Aplicar abaixo de `1024px` no navegador e nos WebViews Android/iOS.
- Preservar somente a tela atual de cada aba; navegação interna descarta a anterior.
- Manter histórico normal do TanStack Router.
- Não persistir estado após recarga, encerramento ou troca de identidade.
- Não alterar o comportamento desktop nem adicionar integração nativa Tauri.

## Etapas

- [x] 1. Implementar configuração tipada, host persistente, scroll por aba e reset visual da aba ativa.
- [x] 2. Validar classificação/memória, comportamento mobile e regressão desktop.
- [x] 3. Revisar alterações e preparar commit local atômico.

## Progresso

### 2026-09-14

- Plano aprovado; implementação iniciada.
- Adicionado host responsivo com `Activity`, montagem preguiçosa e `ScrollArea` independente por aba.
- Última tela de cada aba fica em memória; troca interna usa chave própria para descartar estado anterior e voltar ao topo.
- Toque na aba ativa retorna à raiz da aba e rola o viewport ao topo; não invalida nem refaz consultas explicitamente.
- Testes unitários: 20 casos aprovados.
- Build frontend aprovado; aviso preexistente de chunk principal acima de 500 kB permanece.
- Fluxo Playwright mobile anterior aprovado: estado e scroll preservados, histórico normal, tela interna remontada no topo e desktop inalterado.
- Revisão final sem alterações nativas, persistência durável ou mudanças no comportamento desktop.
- Ajustado toque repetido: telas internas, como Recorrências, retornam à raiz Mais; aba já na raiz retorna ao topo sem navegar.
