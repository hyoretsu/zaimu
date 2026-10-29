# Zaimu UI, autenticação e fallback web

## Objetivo

Entregar experiência completa em pt-BR para web e Tauri, com identidade amarela/índigo, ShadCN, cartões e compras, Better Auth, recuperação por SMTP e fallback web via Universal/App Links.

## Etapas

- [x] Estabilizar Tailwind 4, ShadCN e tokens visuais.
- [x] Renomear `Account` financeira para `FinancialAccount` e criar migração preservadora.
- [x] Integrar Better Auth, SMTP, confirmação e recuperação de senha.
- [x] Implementar rotas de autenticação, links universais e fallback web.
- [x] Refazer shell e todas as telas financeiras.
- [x] Completar paridade convidado/remoto e sincronização.
- [x] Validar backend, frontend, Tauri e fluxos no navegador.

## Decisões

- Better Auth mantém tabelas padrão `user`, `session`, `account` e `verification`.
- A conta financeira se chama `FinancialAccount` em banco, API e TypeScript.
- E-mails usam URL HTTPS; aplicativo abre por associação de domínio quando instalado.
- Navegador executa o mesmo fluxo quando aplicativo não está disponível.
- Nenhuma migração externa, envio real, publicação ou push será executado.

## Progresso

Concluído localmente em 23/08/2026. Builds frontend/backend, testes Bun, `cargo check` e inspeção Playwright visível em 390, 768 e 1440 px aprovados. Configuração assinada de App/Universal Links permanece dependente das credenciais de produção descritas no plano; o gerador interrompe o build com erro claro quando ausentes.
