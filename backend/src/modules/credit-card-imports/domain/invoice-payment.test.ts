import { expect, test } from "bun:test";
import { isInvoicePayment } from "./invoice-payment";

test("identifies invoice payments without swallowing purchases and other automatic debits", () => {
	for (const label of [
		"Débito automático da fatura de agosto/2026",
		"Débito automático de fatura",
		"DEBITO AUTOMATICO FATURA",
		"Pagamento recebido - Obrigado",
		"Pagamento on line",
		"Pag Fatura",
		"Pagto. de fatura",
	])
		expect(isInvoicePayment(label)).toBe(true);
	for (const label of [
		"Débito automático de seguro",
		"LOJA PAGAMENTO",
		"Crédito concedido",
		"Parcelamento de fatura",
		"MP*PAGSEGURO",
	])
		expect(isInvoicePayment(label)).toBe(false);
});
