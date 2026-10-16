import type { FinancialAccount, FinancialInstitution } from "@/lib/api";
import { normalizeInstitutionName } from "@/lib/financial-institution";

const providerInstitutionNames = {
	BANCO_DO_BRASIL: ["Banco do Brasil"],
	INTER: ["Banco Inter", "Inter"],
	MERCADO_PAGO: ["Mercado Pago"],
	NUBANK: ["Nubank"],
	PICPAY: ["PicPay"],
} as const;

export type TransactionImportProvider = keyof typeof providerInstitutionNames;

export function getTransactionImportProvider(institution?: FinancialInstitution | null) {
	if (!institution) return undefined;
	const name = normalizeInstitutionName(institution.name);
	return (Object.keys(providerInstitutionNames) as TransactionImportProvider[]).find(provider =>
		providerInstitutionNames[provider].some(alias => normalizeInstitutionName(alias) === name),
	);
}

export function supportsTransactionImport(account: FinancialAccount) {
	return (
		account.type !== "CREDIT_CARD" &&
		account.type !== "REWARDS" &&
		!!getTransactionImportProvider(account.institution)
	);
}
