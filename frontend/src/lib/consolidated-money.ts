export interface MoneyPosition {
	amount: number;
	currency: string;
}

export async function consolidateMoney(
	values: readonly MoneyPosition[],
	currency: string,
	rate: (from: string, to: string) => Promise<number>,
) {
	const totals = new Map<string, number>();
	for (const value of values) {
		if (!Number.isFinite(value.amount)) throw new Error("Valor monetário inválido");
		totals.set(value.currency, (totals.get(value.currency) ?? 0) + value.amount);
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
