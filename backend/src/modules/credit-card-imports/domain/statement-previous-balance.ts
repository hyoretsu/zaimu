/** A bank's reported principal is a comparison reference, never a new purchase. */
export function statementPreviousBalance(text: string) {
	const match = text.match(
		/^\s*(?:saldo\s+anterior|saldo\s+devedor\s+anterior|saldo\s+financiado)\s*:?\s*(?:R\$\s*)?(-?\s*[\d.]+,\d{2})\s*$/imu,
	);
	return match ? Number(match[1]!.replace(/[\s.]/gu, "").replace(",", ".")) : undefined;
}
