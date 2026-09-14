import type { CreditCardImportProvider } from "./credit-card-statement";

const passwordRequiredByProvider: Record<CreditCardImportProvider, boolean> = {
	BRADESCO: true,
	INTER: true,
	MERCADO_PAGO: false,
	NUBANK: false,
	PICPAY: false,
};

export function requiresCreditCardStatementPdfPassword(provider: CreditCardImportProvider) {
	return passwordRequiredByProvider[provider];
}
