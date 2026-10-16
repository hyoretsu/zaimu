import type { CreditCardImport } from "./api";

type CreditCardImportProvider = CreditCardImport["provider"];

interface PdfPasswordConfiguration {
	placeholder: string;
}

interface CreditCardStatementProviderConfiguration {
	label: string;
	pdfPassword: PdfPasswordConfiguration | null;
}

const optionalPdfPassword = { placeholder: "Ex: 123456" } as const;

export const creditCardStatementProviders = {
	BRADESCO: { label: "Bradesco", pdfPassword: optionalPdfPassword },
	INTER: { label: "Inter", pdfPassword: optionalPdfPassword },
	MERCADO_PAGO: { label: "Mercado Pago", pdfPassword: optionalPdfPassword },
	MEUPLUGGY: { label: "MeuPluggy", pdfPassword: null },
	NUBANK: { label: "Nubank", pdfPassword: null },
	PICPAY: { label: "PicPay", pdfPassword: null },
} as const satisfies Record<CreditCardImportProvider, CreditCardStatementProviderConfiguration>;

export const creditCardStatementProviderOptions = Object.entries(creditCardStatementProviders)
	.filter(([value]) => value !== "MEUPLUGGY")
	.map(([value, { label }]) => ({ label, value }));

export function getCreditCardStatementPdfPasswordConfiguration(provider: CreditCardImportProvider | "") {
	return provider ? creditCardStatementProviders[provider].pdfPassword : null;
}
