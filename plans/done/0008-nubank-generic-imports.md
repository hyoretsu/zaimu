# Importação Nubank e Banco do Brasil

## Progresso

- [x] Criar contrato comum, registry e IDs sintéticos versionados.
- [x] Implementar parsers Nubank e Banco do Brasil.
- [x] Expor providers, migration e testes.

## Limitação conhecida

Operações perfeitamente idênticas sem ID nativo no mesmo dia usam a ocorrência ordenada. Um recorte que omita parte dessas ocorrências não permite identificar cada uma individualmente.
