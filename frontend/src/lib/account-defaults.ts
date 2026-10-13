export interface AccountDefaultsDraft {
	primaryId: string;
	statementId: string;
}

interface AccountDefaultsPort {
	getAll: () => Promise<Array<{ id: string; isDefaultForStatements?: boolean; isPrimary?: boolean }>>;
	setPrimary: (id: string | null) => Promise<unknown>;
	update: (id: string, input: { isDefaultForStatements: boolean }) => Promise<unknown>;
}

export async function saveAccountDefaults(
	draft: AccountDefaultsDraft,
	accounts: AccountDefaultsPort,
): Promise<void> {
	const current = await accounts.getAll();
	const currentStatements = current.find(account => account.isDefaultForStatements)?.id ?? "none";
	const currentPrimary = current.find(account => account.isPrimary)?.id ?? "none";
	if (draft.statementId !== currentStatements) {
		if (draft.statementId !== "none")
			await accounts.update(draft.statementId, { isDefaultForStatements: true });
		else if (currentStatements !== "none")
			await accounts.update(currentStatements, { isDefaultForStatements: false });
	}
	if (draft.primaryId !== currentPrimary)
		await accounts.setPrimary(draft.primaryId === "none" ? null : draft.primaryId);
}
