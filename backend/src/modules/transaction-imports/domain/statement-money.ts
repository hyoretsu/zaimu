/** Currency signs belong to the value, before or after the currency symbol. */
export const statementCurrencyPattern = String.raw`[+−-]?[ \t]*R\$[ \t]*[+−-]?[ \t]*[\d.]+,\d{2}`;

export function statementCurrency(value: string) {
	const magnitude = Number(value.replace(/[^\d,]/gu, "").replace(",", "."));
	return /[−-]/u.test(value) ? -magnitude : magnitude;
}
