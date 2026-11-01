# Pure asset quote provider

`@zaimu/finance/asset-quote-provider` exports `AssetQuoteProvider`, `AssetQuote`,
`AssetQuoteProviderError` and `createBrapiAssetQuoteProvider`.
No persistence, scheduling, fiat conversion or environment reads are included.

```ts
const provider = createBrapiAssetQuoteProvider({
	token: process.env.BRAPI_TOKEN ?? "",
});
const quotes = await provider.fetchQuotes("latest", ["BTC", "ETH"], "BRL");
const historical = await provider.fetchQuotes("2026-01-01", ["BTC"], "USD");
```

Configure `BRAPI_TOKEN` in the server/worker environment only. It is required and
sent through `Authorization: Bearer`, never a query parameter. Do not put it in
`VITE_*`, frontend bundles, logs or version control. The factory accepts injected
`request` (fetch) and `timeoutMs` (default 10000) for transport and testing.
The caller owns environment loading. No real token or live quote call is needed
for tests: `bun test packages/finance/src/asset-quote-provider.test.ts`.

Codes are uppercased and deduplicated. One nonempty batch makes exactly one request
to `/api/v2/crypto?coin=BTC,ETH&currency=BRL`; empty batches make none. The returned
array follows requested order. Missing/duplicate/unexpected assets, wrong currency,
invalid prices/timestamps, HTTP errors and malformed JSON fail the entire batch.
There is no retry, partial result, automatic batch splitting or fallback. HTTP
errors preserve `retryAfterMs`; `unavailable` marks HTTP 400/404 or absent history/assets.
HTTP 400 can also mean invalid parameters, so it is not proof of an unknown asset.
Provider error messages omit response bodies and transport error text.

Each quote contains `assetCode`, `quoteCurrency`, decimal `price`, UTC `date` and
ISO `sourceTime`. For `latest`, time comes from `regularMarketTime`, including any
stale day reported upstream. It is never relabeled with today's date. For an exact
date, the request sends inclusive `startDate=endDate` and `interval=1d`, and uses
only the matching UTC historical point's `close` and Unix-seconds `date`. That
source timestamp labels the candle, not a claimed exact trade execution time.
Missing, null or ambiguous history fails, even if a current price is present.
There is no previous-day substitution. Current/future exact dates may have no
complete daily candle and therefore fail.

Prices must be positive and fit 20 integer digits plus 18 fractional digits.
String inputs retain all significant decimal places; scientific notation is
expanded with string operations and positivity uses BigInt. No price arithmetic
or fiat-minor-unit rounding is performed. A string price with nonzero digits
beyond 18 places is rejected, not rounded. This module does not value holdings.
The public brapi schema supplies prices as JSON **numbers**: `Response.json()`
parses these through IEEE-754 before normalization. Already lost decimal digits
cannot be recovered. For example, `0.123456789012345678` as a number becomes
`0.12345678901234568`; an equivalent string retains all 18 places. String support
is defensive, not a promise that brapi supplies lossless decimal text.

Public documentation checked on 2026-11-01:
[crypto endpoint](https://brapi.dev/docs/criptomoedas) and
[OpenAPI schema](https://brapi.dev/swagger/latest.json).
Access currently requires Startup/Pro; do not assume free-tier crypto availability
or the plan's historical quota. Symbol coverage and history depend on the upstream
plan; unavailable symbols can fail the whole request with HTTP 400. Historical
fiat conversion is upstream and can reuse a preceding daily FX observation or
return null. No delay/freshness SLA is assumed. Stocks, ETFs and FIIs are outside
this implementation.
