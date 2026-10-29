# Rateio flexível de dívidas

## Objetivo

Permitir que transações, compras, assinaturas, pagamentos recorrentes e lançamentos manuais distribuam seu valor entre várias pessoas por cotas, percentuais ou valores fixos. Cada parcela externa gera um evento independente no livro da pessoa.

## Decisões

- Um rateio usa exclusivamente cotas, percentuais ou valores fixos.
- Titular começa excluído; quando incluído, absorve diferenças de arredondamento e o restante nos modos percentual/fixo.
- Percentuais sem titular somam 100%; valores fixos sem titular somam o total.
- Ocorrências concretas guardam snapshot do rateio da agenda. Previsões nunca alteram o livro.
- Associação legada vira uma cota externa de 100%, preservando saldo.
- Salários, transferências e pagamentos de fatura não ganham rateio.

## Etapas

- [x] Criar cálculo, esquema e migração dos rateios.
- [x] Integrar rateios ao livro, APIs, materialização e sync.
- [x] Criar editor compartilhado e integrar formulários/resumos.
- [x] Cobrir domínio, compatibilidade, materialização e UI com testes.
- [x] Validar pacotes afetados e concluir commits atômicos.

## Estado atual

Implementação concluída. Testes unitários, builds, tipos e verificação estática da migração passaram. E2E de
banco exige uma base local com o schema aplicado; a base encontrada estava vazia.

## Próximo passo

Aplicar a migração no ambiente desejado antes de publicar a aplicação.
