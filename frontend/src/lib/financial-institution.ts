import type { FinancialAccount, FinancialInstitution } from "./api";

export function normalizeInstitutionName(input: string) {
	return input.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("pt-BR");
}

export function getFinancialInstitutions(accounts: FinancialAccount[]): FinancialInstitution[] {
	const institutions = new Map<string, FinancialInstitution>();
	for (const account of accounts) {
		if (account.institution) institutions.set(account.institution.id, account.institution);
	}
	return [...institutions.values()].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

export function institutionOption(institution: FinancialInstitution) {
	return { keywords: institution.aliases ?? [], label: institution.name, value: institution.id };
}
