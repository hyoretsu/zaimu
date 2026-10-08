export type CurrencyRates = Record<string, number>;
export class CurrencyProviderError extends Error {
	constructor(
		message: string,
		readonly retryAfterMs = 0,
		readonly unavailable = false,
	) {
		super(message);
	}
}

export function currencyProviderUrls(date: string, endpoint: string): string[] {
	if (date !== "latest" && !/^\d{4}-\d{2}-\d{2}$/.test(date))
		throw new RangeError("Data de câmbio inválida");
	if (!/^(currencies|currencies\/[a-z]{3})$/.test(endpoint))
		throw new RangeError("Endpoint de câmbio inválido");
	return [
		`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/${endpoint}.json`,
		`https://${date}.currency-api.pages.dev/v1/${endpoint}.json`,
	];
}

/** Official mirror fallback applies to transport and payload validation alike. */
async function fetchDocument<T>(
	date: string,
	endpoint: string,
	validate: (payload: unknown) => T,
	request: typeof fetch,
): Promise<T> {
	let retryAfterMs = 0;
	let missing = 0;
	for (const url of currencyProviderUrls(date, endpoint)) {
		try {
			const response = await request(url, { signal: AbortSignal.timeout(10_000) });
			if (!response.ok) {
				if (response.status === 404) missing++;
				const retry = response.headers.get("retry-after");
				if (retry)
					retryAfterMs = Math.max(
						retryAfterMs,
						Number(retry) * 1000 || Math.max(0, Date.parse(retry) - Date.now()),
					);
				continue;
			}
			return validate(await response.json());
		} catch {
			/* Try the documented Cloudflare endpoint before reporting unavailable. */
		}
	}
	throw new CurrencyProviderError(
		`Cotação indisponível em ${date}. Tente novamente.`,
		retryAfterMs,
		missing === 2,
	);
}

export async function fetchCurrencySnapshot(date: string, currency: string, request: typeof fetch = fetch) {
	const base = currency.toLowerCase();
	return fetchDocument(
		date,
		`currencies/${base}`,
		payload => {
			if (
				!payload ||
				typeof payload !== "object" ||
				!("date" in payload) ||
				typeof payload.date !== "string" ||
				!/^\d{4}-\d{2}-\d{2}$/.test(payload.date) ||
				(date !== "latest" && payload.date !== date)
			)
				throw new Error("Data de câmbio incompatível");
			const values = (payload as Record<string, unknown>)[base];
			if (!values || typeof values !== "object" || Array.isArray(values))
				throw new Error("Snapshot inválido");
			const rates: CurrencyRates = {};
			for (const [code, value] of Object.entries(values)) {
				if (
					/^[a-z]{3}$/.test(code) &&
					typeof value === "number" &&
					Number.isFinite(value) &&
					value > 0
				)
					rates[code.toUpperCase()] = value;
			}
			if (rates[base.toUpperCase()] !== 1 || Object.keys(rates).length < 2)
				throw new Error("Snapshot incompleto");
			return { baseCurrency: base.toUpperCase(), date: payload.date, rates };
		},
		request,
	);
}

export async function fetchCurrencyCatalog(request: typeof fetch = fetch): Promise<string[]> {
	const national = new Set(Intl.supportedValuesOf("currency"));
	return fetchDocument(
		"latest",
		"currencies",
		payload => {
			if (!payload || typeof payload !== "object" || Array.isArray(payload))
				throw new Error("Catálogo inválido");
			const codes = Object.keys(payload)
				.map(code => code.toUpperCase())
				.filter(
					code =>
						national.has(code) &&
						!code.startsWith("X") &&
						!["CLF", "UYI", "UYW", "BOV", "CHE", "CHW", "COU", "USN", "MXV"].includes(code),
				);
			if (!codes.includes("USD")) throw new Error("Catálogo incompleto");
			return codes.sort();
		},
		request,
	);
}
