# Cashback em criptomoedas

## Objetivo aprovado

Permitir criptomoedas em todas as contas e moeda própria para cashback. Mercado Pago configura 0,5% com destino MELI, identificado pelo usuário como Meli Dólar. Converter pela data da compra, preservar unidades históricas e oferecer apenas ativos cotados pelas fontes integradas. Não presumir paridade com USD.

## Progresso

- [x] Inspecionar catálogo, conversão, snapshots de cashback e criação automática de contas.
- [x] Consultar endpoints públicos gratuitos para verificar viabilidade MELI.
- [ ] Resolver acesso à cotação histórica diária MELI.
- [ ] Ampliar catálogo com identidade, tipo, precisão e identificador de provedor; manter preferência geral fiduciária.
- [ ] Integrar Coinbase, persistência com origem e conversão via USD na mesma data; preservar cache e concorrência.
- [ ] Ampliar campos de moeda, validações, máscaras, formatação e cálculos com limites seguros.
- [ ] Configurar moeda de cashback; reutilizar destino somente por instituição, tipo e moeda.
- [ ] Atualizar modo visitante, consolidações, DTOs, OpenAPI, SDK e traduções.
- [ ] Preparar migrations e snapshots locais, atualizar regras de negócio e testar fluxos.
- [ ] Validar hooks e builds afetados; criar commits locais sem push ou migrations remotas.

## Bloqueio de provedor

Consultas reais realizadas em 2026-10-12, sem alterações externas:

| Endpoint | Resultado |
| --- | --- |
| `https://api.coinbase.com/v2/prices/MELI-BRL/spot` | HTTP 404 |
| `https://api.coinbase.com/v2/prices/MELI-USD/spot?date=2026-10-01` | HTTP 404 |
| `https://api.coinbase.com/v2/exchange-rates?currency=MELI` | HTTP 400 |
| `https://api.coinbase.com/v2/currencies/crypto` | Nenhum registro correspondente a MELI |
| `https://api.coinbase.com/v2/prices/BTC-USD/spot?date=2026-10-01` | HTTP 200, preço `83556.145` USD |
| `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies.json` | Nenhum código/nome MELI ou Mercado |
| `https://www.coinbase.com/pt-br/converter/meli/brl` | HTTP 403, bloqueio Cloudflare |

Esses resultados demonstram indisponibilidade de MELI nos endpoints consultados, não ausência em todos os produtos Coinbase. Página de conversão fornecida pelo usuário não determina endpoint público gratuito nem disponibilidade histórica. Suporte Mercado Pago não pode ser concluído sem acesso diário comprovado. Próximo passo: identificar endpoint ou identificador alternativo oficial para o mesmo ativo e verificar histórico por data. Não substituir por outro token, preço atual ou paridade presumida.

## Aceitação

- R$ 1.000 a 0,5% credita equivalente de R$ 5 em unidades MELI pelo dia da compra.
- Precisão cripto preserva recompensas pequenas e códigos maiores que três caracteres.
- Parcelamento recompensa uma vez; edição, exclusão e estornos conservam histórico.
- Cobrir cache, concorrência, HTTP 429, resposta inválida, histórico ausente e ponte USD.
- Cobrir criação/reutilização de contas, dashboard e visitante offline.
- Preservar alterações preexistentes do usuário e referência versionada de migrations.
