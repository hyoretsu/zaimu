const parseDate = (value: string | null) => {
	const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? "");
	if (!match) throw new Error("Invalid BCB fixture date");
	const date = new Date(`${match[3]}-${match[2]}-${match[1]}T12:00:00Z`);
	if (
		!Number.isFinite(date.valueOf()) ||
		date.getUTCDate() !== Number(match[1]) ||
		date.getUTCMonth() + 1 !== Number(match[2])
	)
		throw new Error("Invalid BCB fixture date");
	return date;
};

/** Known providers are simulated in memory; all other external HTTP fails before network I/O. */
export function createPerformanceFetch(original: typeof fetch): typeof fetch {
	const guarded = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
		const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
		const url = new URL(request.url);
		if (
			url.origin === "https://api.bcb.gov.br" &&
			/^\/dados\/serie\/bcdata\.sgs\.(11|12)\/dados$/.test(url.pathname)
		) {
			if (request.method !== "GET") throw new Error("BCB fixture accepts only GET");
			const start = parseDate(url.searchParams.get("dataInicial"));
			const end = parseDate(url.searchParams.get("dataFinal"));
			if (end < start || end.valueOf() - start.valueOf() > 3660 * 86400000)
				throw new Error("Invalid BCB fixture range");
			const rates: Array<{ data: string; valor: string }> = [];
			for (let date = start; date <= end; date = new Date(date.valueOf() + 86400000)) {
				if ([0, 6].includes(date.getUTCDay())) continue;
				rates.push({
					data: `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`,
					valor: "0.04",
				});
			}
			return Response.json(rates);
		}
		const jsdelivr =
			/^\/npm\/@fawazahmed0\/currency-api@(latest|\d{4}-\d{2}-\d{2})\/v1\/currencies(?:\/([a-z]{3}))?\.json$/.exec(
				url.pathname,
			);
		const cloudflare = /^(latest|\d{4}-\d{2}-\d{2})\.currency-api\.pages\.dev$/.exec(url.hostname);
		const cfPath = /^\/v1\/currencies(?:\/([a-z]{3}))?\.json$/.exec(url.pathname);
		if (
			request.method === "GET" &&
			((url.origin === "https://cdn.jsdelivr.net" && jsdelivr) ||
				(url.protocol === "https:" && cloudflare && cfPath))
		) {
			const requestedDate = jsdelivr?.[1] ?? cloudflare![1]!;
			const base = jsdelivr?.[2] ?? cfPath?.[1];
			const units: Record<string, number> = { brl: 5, eur: 0.9, jpy: 150, usd: 1 };
			if (!base)
				return Response.json({ brl: "Brazilian Real", eur: "Euro", jpy: "Japanese Yen", usd: "US Dollar" });
			if (!units[base]) return new Response(null, { status: 404 });
			return Response.json({
				date: requestedDate === "latest" ? "2026-10-04" : requestedDate,
				[base]: Object.fromEntries(
					Object.entries(units).map(([code, value]) => [code, value / units[base]!]),
				),
			});
		}

		if (
			!["http:", "https:"].includes(url.protocol) ||
			!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
			!["3335", "5173"].includes(url.port)
		)
			throw new Error("External HTTP blocked by performance environment");
		return original(new Request(request, { redirect: "error" }));
	};
	return Object.assign(guarded, {
		preconnect: (...args: Parameters<typeof fetch.preconnect>) => {
			const url = new URL(args[0]);
			if (
				!["http:", "https:"].includes(url.protocol) ||
				!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
				!["3335", "5173"].includes(url.port)
			)
				throw new Error("External preconnect blocked by performance environment");
			return original.preconnect(...args);
		},
	}) as typeof fetch;
}
