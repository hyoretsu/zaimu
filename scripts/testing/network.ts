/** Provider calls in service tests must use doubles; real HTTP stays on loopback. */
export function assertLocalHttpRequest(input: string | URL | Request) {
	const url = new URL(input instanceof Request ? input.url : String(input));
	if (
		!["http:", "https:"].includes(url.protocol) ||
		!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
	)
		throw new Error(`External HTTP disabled in disposable tests: ${url.origin}`);
}

const catalogUrls = new Set([
	"https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies.json",
	"https://latest.currency-api.pages.dev/v1/currencies.json",
]);
const currencyCatalog = Object.fromEntries(
	Intl.supportedValuesOf("currency").map(code => [code.toLowerCase(), code]),
);
const originalFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
	(input: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
		const url = input instanceof Request ? input.url : String(input);
		if (
			catalogUrls.has(url) &&
			(options?.method ?? (input instanceof Request ? input.method : "GET")) === "GET"
		)
			return Promise.resolve(Response.json(currencyCatalog));
		assertLocalHttpRequest(input);
		return originalFetch(input, options);
	},
	{
		preconnect: (
			url: Parameters<typeof fetch.preconnect>[0],
			options?: Parameters<typeof fetch.preconnect>[1],
		) => {
			assertLocalHttpRequest(url);
			return originalFetch.preconnect(url, options);
		},
	},
);
