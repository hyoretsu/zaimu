/** Preserve credit signs before/after the currency symbol or after the amount. */
export function statementMoney(value: string) {
	const normalized = value.replaceAll("−", "-");
	const magnitude = Number(normalized.replace(/[^\d,]/gu, "").replace(",", "."));
	return normalized.includes("-") ? -magnitude : magnitude;
}
