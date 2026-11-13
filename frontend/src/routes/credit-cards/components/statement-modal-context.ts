export const statementViewParameters = ["statement", "next", "previous", "radius"];

/** Statement-only links resolve directly; never enumerate card statement histories. */
export async function findStatementCard(
	cardIds: string[],
	statementId: string,
	loadOwner: (statementId: string) => Promise<string | null>,
) {
	const owner = await loadOwner(statementId);
	return owner && cardIds.includes(owner) ? owner : null;
}
