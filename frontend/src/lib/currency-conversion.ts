import { roundMoney } from "@zaimu/finance/money";
import type { FinancialFee } from "./api";

export async function guestRate(date: string, from: string, to: string) {
	if (from === to) return 1;
	const { readCurrencyRate } = await import("./financial-history");
	const snapshot = await readCurrencyRate(date, from, to);
	if (!snapshot || !Number.isFinite(snapshot.rate) || snapshot.rate <= 0)
		throw new Error(`Conversão de ${from} para ${to} indisponível`);
	return snapshot.rate;
}

export async function convertLocalMoney(
	amount: number,
	date: string,
	from: string,
	to: string,
	fees: FinancialFee[] = [],
	exchange: typeof guestRate = guestRate,
) {
	if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor maior que zero");
	const total =
		amount +
		fees.reduce((sum, fee) => {
			if (!Number.isFinite(fee.amount) || fee.amount < 0 || !fee.name.trim())
				throw new Error("Taxa inválida");
			return sum + (fee.type === "PERCENTAGE" ? (amount * fee.amount) / 100 : fee.amount);
		}, 0);
	const rate = from === to ? 1 : await exchange(date, from, to);
	return {
		amount: roundMoney(total * rate, to),
		bookingCurrency: to,
		currency: from,
		exchangeRate: rate,
		fees,
		originalAmount: amount,
	};
}
