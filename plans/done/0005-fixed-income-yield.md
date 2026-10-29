# Rendimento completo de renda fixa

## Objetivo

Permitir rendimento prefixado, pós-fixado ou misto em contas, usando taxa de referência manual,
percentual sobre a referência, parcela fixa e periodicidade mensal ou anual.

## Decisões

- Taxa efetiva nominal = `referência × percentual / 100 + taxa fixa`.
- Uma periodicidade vale para todas as parcelas; conversão diária composta usa 21 ou 252 dias úteis.
- Campos opcionais determinam a modalidade, sem seletor adicional.
- Alteração vale amanhã por padrão; usuário pode recalcular hoje e remover override automático do dia.
- Cashback usa referência e percentual, sem parcela fixa, preservando snapshot por compra.
- Dados legados mantêm resultado: taxa de conta vira parcela fixa; taxa de cashback vira referência a 100%.

## Etapas

- [x] Evoluir contrato SQL e criar migração compatível.
- [x] Atualizar domínio, persistência, API e sincronização.
- [x] Atualizar tipos, cálculos e persistência guest no frontend.
- [x] Atualizar formulários de conta e cashback.
- [x] Cobrir cenários e validar pacotes afetados.
- [x] Criar commit atômico local.

## Estado atual

Implementação concluída. Testes unitários, migração e fluxo visual validados.

## Próximo passo

Aplicar migração no ambiente desejado durante a publicação.
