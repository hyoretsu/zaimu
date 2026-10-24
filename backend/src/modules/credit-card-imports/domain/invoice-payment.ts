/** Invoice settlements are never new card purchases, regardless of the bank sign. */
export function isInvoicePayment(description: string) {
	const normalized = description
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/gu, "")
		.trim()
		.replace(/\s+/gu, " ");
	return /^(?:pagamento\b|pag(?:to)?\.?\s+(?:de\s+|da\s+)?fatura\b|debito automatico(?:\s+(?:de|da))?\s+fatura\b)/iu.test(
		normalized,
	);
}
