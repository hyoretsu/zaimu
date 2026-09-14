import type { CreditCardImport } from "./api";

type CreditCardImportProvider = CreditCardImport["provider"];

interface PdfPasswordConfiguration {
	placeholder: string;
}

interface CreditCardStatementProviderConfiguration {
	label: string;
	pdfPassword: PdfPasswordConfiguration | null;
}

const pdfPassword = { placeholder: "Ex: 123456" } as const;

export const creditCardStatementProviders = {
	BRADESCO: { label: "Bradesco", pdfPassword },
	INTER: { label: "Inter", pdfPassword },
	MERCADO_PAGO: { label: "Mercado Pago", pdfPassword: null },
	NUBANK: { label: "Nubank", pdfPassword: null },
	PICPAY: { label: "PicPay", pdfPassword: null },
} as const satisfies Record<CreditCardImportProvider, CreditCardStatementProviderConfiguration>;

export const creditCardStatementProviderOptions = Object.entries(creditCardStatementProviders).map(
	([value, { label }]) => ({ label, value }),
);

export function getCreditCardStatementPdfPasswordConfiguration(provider: CreditCardImportProvider | "") {
	return provider ? creditCardStatementProviders[provider].pdfPassword : null;
}
