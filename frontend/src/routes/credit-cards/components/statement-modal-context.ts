export const statementViewParameters = ["statement", "next", "previous", "radius"];

/** Older shared links identify only the statement. Resolve it within the user's cards. */
export async function findStatementCard(
	cardIds: string[],
	statementId: string,
	loadStatements: (cardId: string) => Promise<Array<{ id: string }>>,
) {
	for (const cardId of cardIds) {
		const statements = await loadStatements(cardId);
		if (statements.some(statement => statement.id === statementId)) return cardId;
	}
	return null;
}
