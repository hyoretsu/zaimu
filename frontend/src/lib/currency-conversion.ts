import { fetchCurrencySnapshot } from "@zaimu/finance/currency-provider";
import { roundMoney } from "@zaimu/finance/money";
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
		const { rates } = await fetchCurrencySnapshot(day, base);
		try {
			localStorage.setItem(key, JSON.stringify(rates));
		} catch {
			/* Conversion works without storage. */
		}
		return rates;
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
		amount: roundMoney(total * rate, to),
		currency: from,
		bookingCurrency: to,
		exchangeRate: rate,
		fees,
		originalAmount: amount,
	};
}
