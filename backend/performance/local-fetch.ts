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
