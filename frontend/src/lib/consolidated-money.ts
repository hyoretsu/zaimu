import { isCryptoAsset } from "@zaimu/finance/money";

export interface MoneyPosition {
	amount: number | string;
	currency: string;
}

export async function consolidateMoney(
	values: readonly MoneyPosition[],
	currency: string,
	rate: (from: string, to: string) => Promise<number>,
	valueAsset?: (position: MoneyPosition, currency: string) => Promise<number>,
) {
	if (isCryptoAsset(currency)) throw new Error("Consolidação exige moeda fiduciária");
	const totals = new Map<string, number>();
	for (const value of values) {
		if (isCryptoAsset(value.currency)) {
			if (typeof value.amount !== "string" || !valueAsset)
				throw new Error("Cotação de ativo indisponível");
			const valued = await valueAsset(value, currency);
			if (!Number.isFinite(valued)) throw new Error("Cotação de ativo indisponível");
			totals.set(currency, (totals.get(currency) ?? 0) + valued);
			continue;
		}
		const amount = Number(value.amount);
		if (!Number.isFinite(amount)) throw new Error("Valor monetário inválido");
		totals.set(value.currency, (totals.get(value.currency) ?? 0) + amount);
	}
	const converted = await Promise.all(
		[...totals].map(async ([source, amount]) => {
			if (!amount || source === currency) return amount;
			const factor = await rate(source, currency);
			if (!Number.isFinite(factor) || factor <= 0) throw new Error("Cotação indisponível");
			return amount * factor;
		}),
	);
	return converted.reduce((sum, amount) => sum + amount, 0);
}
