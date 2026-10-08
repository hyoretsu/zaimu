/** MoneyField submits a pt-BR formatted native input, including currencies with zero decimals. */
export function parseMaskedMoney(value: string): number {
	const normalized = value
		.replace(/[^\d,.-]/g, "")
		.replaceAll(".", "")
		.replace(",", ".");
	return normalized ? Number(normalized) : Number.NaN;
}
