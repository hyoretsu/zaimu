import type { CreditCardImport } from "./api";

type CreditCardImportProvider = CreditCardImport["provider"];

interface CreditCardStatementProviderConfiguration {
	label: string;
}

export const creditCardStatementPdfPasswordPlaceholder = "Ex: 123456";

export const creditCardStatementProviders = {
	BRADESCO: { label: "Bradesco" },
	INTER: { label: "Inter" },
	MERCADO_PAGO: { label: "Mercado Pago" },
	MEUPLUGGY: { label: "MeuPluggy" },
	NUBANK: { label: "Nubank" },
	PICPAY: { label: "PicPay" },
	WILL_BANK: { label: "Will Bank" },
} as const satisfies Record<CreditCardImportProvider, CreditCardStatementProviderConfiguration>;

export const creditCardStatementProviderOptions = Object.entries(creditCardStatementProviders)
	.filter(([value]) => value !== "MEUPLUGGY")
	.map(([value, { label }]) => ({ label, value }));
