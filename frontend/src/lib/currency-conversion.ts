import type { FinancialFee } from "./api";

async function guestRate(date: string, from: string, to: string) {
	const day = date.slice(0, 10);
	const load = async (base: string): Promise<Record<string, number>> => {
		const key = `zaimu:currency:${day}:${base}`;
		try {
			const cached = localStorage.getItem(key);
			if (cached) return JSON.parse(cached);
		} catch {
			/* Storage can be unavailable; fetching remains possible. */
		}
		for (const url of [
			`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${day}/v1/currencies/${base.toLowerCase()}.json`,
			`https://${day}.currency-api.pages.dev/v1/currencies/${base.toLowerCase()}.json`,
		]) {
			try {
				const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
				if (!response.ok) continue;
				const payload = await response.json();
				if (payload.date !== day || !payload[base.toLowerCase()]) continue;
				const rates: Record<string, number> = {};
				for (const [code, value] of Object.entries(payload[base.toLowerCase()]))
					if (/^[a-z]{3}$/.test(code) && typeof value === "number" && Number.isFinite(value) && value > 0)
						rates[code.toUpperCase()] = value;
				if (rates[base] !== 1) continue;
				try {
					localStorage.setItem(key, JSON.stringify(rates));
				} catch {
					/* Conversion remains usable without cache. */
				}
				return rates;
			} catch {
				/* Try the mirror. */
			}
		}
		throw new Error(`Cotação de ${base} indisponível em ${day}`);
	};
	const [rates] = await Promise.all([load(from), load(to)]);
	if (!rates[to]) throw new Error(`Conversão de ${from} para ${to} indisponível`);
	return rates[to];
}

export async function convertLocalMoney(
	amount: number,
	date: string,
	from: string,
	to: string,
	fees: FinancialFee[] = [],
) {
	if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor maior que zero");
	const total =
		amount +
		fees.reduce((sum, fee) => {
			if (!Number.isFinite(fee.amount) || fee.amount < 0 || !fee.name.trim())
				throw new Error("Taxa inválida");
			return sum + (fee.type === "PERCENTAGE" ? (amount * fee.amount) / 100 : fee.amount);
		}, 0);
	const rate = from === to ? 1 : await guestRate(date, from, to);
	return {
		amount: Math.round((total * rate + Number.EPSILON) * 100) / 100,
		currency: from,
		exchangeRate: rate,
		fees,
		originalAmount: amount,
	};
}
