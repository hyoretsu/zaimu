# Taxas de referência e rendimentos event-driven

## Objetivo
Persistir CDI e Selic diários, materializar rendimentos pós-fixados somente após a taxa existir e recuperar automaticamente atrasos, correções e falhas transitórias.

## Decisões
- SGS 12 representa CDI e SGS 11 representa Selic; ambos retornam percentual diário.
- Bootstrap consulta 01/01/2020–17/09/2026 em uma requisição por série.
- Worker embutido usa fila PostgreSQL, lease, deduplicação e retry persistente.
- Taxa fixa diária soma com a parcela diária da referência.
- Cashback e modo guest permanecem sem referências automáticas.
- Configurações numéricas legadas tornam-se CDI; lançamentos existentes tornam-se overrides do usuário.

## Etapas
- [x] Evoluir contrato SQL e migração compatível.
- [x] Implementar cliente BCB, fila, scheduler e bootstrap.
- [x] Materializar e recalcular rendimentos em resposta às taxas e mudanças retroativas.
- [x] Atualizar APIs, sincronização e interface CDI/Selic.
- [x] Cobrir cenários e validar pacotes afetados.
- [x] Criar commit atômico local.

## Estado atual
Implementação, validação e preparação do commit concluídas.

## Próximo passo
Aplicar migrações somente no ambiente desejado durante a publicação.
