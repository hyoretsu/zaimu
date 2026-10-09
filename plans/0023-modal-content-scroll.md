# Modal compartilhado com conteúdo rolável

## Objetivo
Header e footer visíveis; apenas conteúdo central rola usando ScrollArea, no desktop e mobile.

## Progresso
- [x] Inspecionar componente compartilhado e composições existentes.
- [x] Adicionar DialogBody e migrar modais, preservando formulários e estados.
- [x] Validar layout, submissão e scrollbar; concluir commit local.

## Validação
Modais curtos/longos, formulários, importações, listagens, telas pequenas, foco e paginação. Hooks validam tipos, lint e formatação no commit.

## Resultado
- Build frontend e checks dos hooks aprovados.
- Playwright local: 1280x800, 390x844 e 360x480; header/footer estáveis, submit por botão/Enter, select e append sem alterar scroll.
- Modal curto mantém altura compacta. Auditoria: 61 áreas centrais sem header/footer ou ScrollArea duplicado dentro delas.
- Revisões de importação preservam itens em falhas de paginação; extrato preserva dados dependentes durante mudança de intervalo.
