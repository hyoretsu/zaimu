import type { CreditCard, FinancialAccount, FinancialInstitution } from "@/lib/api";
import { normalizeInstitutionName } from "@/lib/financial-institution";

const providerNames = {
	BRADESCO: ["Bradesco"],
	INTER: ["Inter", "Banco Inter"],
	MERCADO_PAGO: ["Mercado Pago"],
	NUBANK: ["Nubank"],
	PICPAY: ["PicPay"],
} as const;

export function getCreditCardImportProvider(institution?: FinancialInstitution | null) {
	if (!institution) return undefined;
	const name = normalizeInstitutionName(institution.name);
	return (Object.keys(providerNames) as (keyof typeof providerNames)[]).find(provider =>
		providerNames[provider].some(alias => normalizeInstitutionName(alias) === name),
	);
}

export function getCreditCardImportInstitution(
	card: Pick<CreditCard, "financialAccountId">,
	accounts: Pick<FinancialAccount, "id" | "institution">[],
) {
	return accounts.find(account => account.id === card.financialAccountId)?.institution;
}

export function getSelectableImportCards<T extends Pick<CreditCard, "financialAccountId">>(
	cards: T[],
	accounts: Pick<FinancialAccount, "id" | "institution">[],
	institutionId = "",
) {
	return cards.filter(card => {
		const institution = getCreditCardImportInstitution(card, accounts);
		return (
			!!getCreditCardImportProvider(institution) && (!institutionId || institution?.id === institutionId)
		);
	});
}
