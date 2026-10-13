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

## Investigação adicional: MUSD

Usuário informou código MUSD para Meli Dólar. Consultas adicionais em 2026-10-12 (data local):

- Coinbase `GET /v2/prices/MUSD-USD/spot` responde `1` USD sem autenticação. Com `date=2026-10-01`, responde `0.9964139512448726` USD; par MUSD-BRL na mesma data responde `5.16202211581919506251300508346806` BRL. Isso comprova disponibilidade do ticker, mas não identidade Meli Dólar.
- [Busca de ativos Coinbase](https://www.coinbase.com/api/v2/assets/search?query=musd) identifica MUSD de Mezo, MetaMask, Meta USD, Mad USD e mStable. Nenhum registro retornado identifica Meli Dólar. Busca `meli%20dolar` não retorna ativo. Endpoint de busca do site foi usado apenas para investigar identidade, não como contrato de integração.
- [Documentação Coinbase](https://docs.cdp.coinbase.com/coinbase-app/track-apis/prices) confirma que spot dispensa autenticação e aceita data histórica UTC no formato `YYYY-MM-DD`.
- [Busca CoinGecko](https://api.coingecko.com/api/v3/search?query=musd) também retorna várias moedas homônimas. Buscas `meli`, `meli dollar`, `meli-dollar` e `mercado` não identificam Meli Dólar. MercadoLibre tokenizado representa ações e não serve como cotação desse cashback.
- Histórico CoinGecko em `2026-10-01`, consultado sem chave: `musd` é mStable USD (`0.9985555998648801` USD), `mezo-usd` é Mezo USD (`0.990419768561645` USD), `metamask-usd` é MetaMask USD (`0.9995519983651984` USD). Nenhum desses registros é identificado como Meli Dólar.
- [Ripio Get Last Market Rates](https://docs.ripio.com/crypto-as-a-service/rates/get-last-market-rates) documenta `GET https://b2b-api.ripio.com/api/v1/rates/`, com preços BUY/SELL dos pares habilitados para a conta. [Autenticação Ripio](https://docs.ripio.com/crypto-as-a-service/access-token/get-access-token) exige OAuth2 com `client_id` e `client_secret`. Consulta anônima retornou HTTP 403. Não foi comprovado acesso gratuito, par MUSD nem histórico diário disponível ao público.
- CoinPaprika e DexScreener retornaram HTTP 403; CryptoCompare retornou HTTP 401. Esses erros limitam a investigação e não comprovam ausência do ativo nessas fontes.

Conclusão: nenhuma API gratuita consultada foi confirmada como fonte do ativo específico Meli Dólar. Coinbase MUSD responde, mas ticker sozinho não permite vincular identidade. Antes de integrar, obter identificador inequívoco do emissor/contrato e validar correspondência no provedor, ou acesso documentado ao par da Ripio. Não tratar moedas MUSD homônimas como equivalentes nem assumir paridade USD.
