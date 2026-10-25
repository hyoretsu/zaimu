import { createHash } from "node:crypto";
import type { StatementProvider, StatementTransaction } from "./statement";

export type IdentifiedStatementTransaction = StatementTransaction & { externalId: string };

const normalizeDescription = (value: string) =>
	value.normalize("NFKC").toLocaleLowerCase("pt-BR").replace(/\s+/gu, " ").trim();

export function assignStableExternalIds(
	transactions: StatementTransaction[],
	{
		financialAccountId,
		provider,
		userId,
	}: { financialAccountId: string; provider: StatementProvider; userId: string },
): IdentifiedStatementTransaction[] {
	const occurrences = new Map<string, number>();
	return transactions.map<IdentifiedStatementTransaction>(transaction => {
		if (transaction.externalId) return { ...transaction, externalId: transaction.externalId };
		const cents = Math.round(transaction.amount * 100);
		const signature = [
			transaction.date,
			transaction.type,
			cents,
			normalizeDescription(transaction.description),
		].join("|");
		const occurrence = (occurrences.get(signature) ?? 0) + 1;
		occurrences.set(signature, occurrence);
		const source = [
			"transaction-import",
			provider,
			"v1",
			userId,
			financialAccountId,
			signature,
			occurrence,
		].join("|");
		return {
			...transaction,
			externalId: `${provider.toLowerCase()}:v1:${createHash("sha256").update(source).digest("hex")}:${occurrence}`,
		};
	});
}

export function statementImportId(
	userId: string,
	accountId: string,
	provider: string,
	externalIds: string[],
) {
	const hash = new Bun.CryptoHasher("sha256")
		.update(JSON.stringify(["statement-import-v1", userId, accountId, provider, externalIds.toSorted()]))
		.digest("hex");
	return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}
