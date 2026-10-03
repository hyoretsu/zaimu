import { matchesExistingCreditPurchase } from "~/modules/credit-card-imports/domain/credit-card-import-reconciliation";
import { queryRaw } from "~/shared/infra/sql";
import { bankDate, bankTime, exactMatch, type NormalizedRecord } from "../domain/normalize";
export interface Binding extends Record<string, unknown> {
	id: string;
	connectionId: string;
	remoteAccountId: string;
	financialAccountId: string | null;
	creditCardId: string | null;
	paused: boolean;
}
export interface Candidate {
	id: string;
	source: "LOCAL" | "REVIEW";
	importId: string | null;
	exact: boolean;
	amount: number;
	raw: Record<string, unknown>;
}
export async function findCandidates(
	userId: string,
	binding: Binding,
	remote: NormalizedRecord,
): Promise<Candidate[]> {
	const card = Boolean(binding.creditCardId);
	const rows = await queryRaw<Record<string, unknown>>(
		card && remote.operation === "CHARGE"
			? `SELECT ch.*, ch."chargeDate" AS "date", ch."amount" AS "installmentAmount", ch."amount" AS "totalAmount", 1 AS "installments", 1 AS "currentInstallment", true AS "hasImportedAmount", 'LOCAL' AS "source", NULL::text AS "importId" FROM "CreditStatementCharge" ch JOIN "CreditCardStatement" s ON s."id"=ch."statementId" JOIN "CreditCard" c ON c."id"=s."creditCardId" JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" WHERE a."userId"=$1 AND c."id"=$2`
			: card
				? `SELECT p.*, 'LOCAL' AS "source", NULL::text AS "importId", e."amount" AS "installmentAmount", e."hasImportedAmount", e."number" AS "currentInstallment", p."totalAmount" AS "totalAmount", (SELECT count(*)::integer FROM "CreditInstallmentPlan" x WHERE x."purchaseId"=p."id") AS "installments", p."purchaseDate" AS "date"
   FROM "CreditPurchaseRecord" p LEFT JOIN "CreditInstallmentPlan" e ON e."purchaseId"=p."id" AND e."number"=$3
   WHERE p."userId"=$1 AND p."creditCardId"=$2
`
				: `SELECT t.*, 'LOCAL' AS "source", NULL::text AS "importId" FROM "Transaction" t WHERE t."userId"=$1 AND (t."originFinancialAccountId"=$2 OR t."destinationFinancialAccountId"=$2)`,
		card
			? remote.operation === "CHARGE"
				? [userId, binding.creditCardId]
				: [userId, binding.creditCardId, remote.installmentNumber]
			: [userId, binding.financialAccountId],
	);
	const pending = await queryRaw<Record<string, unknown>>(
		card
			? `SELECT i.*, i."purchaseDate" AS "date", 'REVIEW' AS "source", b."id" AS "importId" FROM "CreditCardImportItem" i JOIN "CreditCardImport" b ON b."id"=i."creditCardImportId" WHERE b."userId"=$1 AND b."creditCardId"=$2 AND b."status"='PENDING'`
			: `SELECT i.*, 'REVIEW' AS "source", b."id" AS "importId" FROM "TransactionImportItem" i JOIN "TransactionImport" b ON b."id"=i."transactionImportId" WHERE b."userId"=$1 AND b."financialAccountId"=$2 AND b."status"='PENDING' AND NOT i."isReconciled"`,
		[userId, card ? binding.creditCardId : binding.financialAccountId],
	);
	const candidates: Candidate[] = [];
	for (const raw of [...rows, ...pending]) {
		if (card && raw.source === "REVIEW" && Boolean(raw.isStatementCharge) !== (remote.operation === "CHARGE"))
			continue;
		const date = bankDate(raw.date instanceof Date ? raw.date.toISOString() : String(raw.date));
		const amount = card
			? Number(raw.installmentAmount)
			: (raw.type === "EXPENSE" ? -1 : 1) * Number(raw.amount);
		const candidate: NormalizedRecord = {
			...remote,
			amount,
			date,
			description: String(raw.description ?? ""),
			installmentNumber: card ? Number(raw.currentInstallment ?? remote.installmentNumber) : 1,
			installments: card ? Number(raw.installments) : 1,
			time: bankTime(raw.time ? String(raw.time).slice(0, 8) : undefined),
		};
		const exact =
			exactMatch(remote, candidate) &&
			(!card || remote.totalAmount === Number(raw.totalAmount)) &&
			(card || raw.type !== "TRANSFER") &&
			(card ||
				(remote.operation === "PAYMENT" ? Boolean(raw.paymentCreditCardId) : !raw.paymentCreditCardId));
		const suggested = card
			? matchesExistingCreditPurchase(
					{
						description: remote.description,
						installmentAmount: remote.amount,
						installments: remote.installments,
						purchaseDate: remote.date,
						storeName: null,
						totalAmount: remote.totalAmount ?? 0,
					},
					{
						description: candidate.description,
						existingInstallments: candidate.installmentNumber,
						installmentAmount: Number(raw.installmentAmount),
						installments: candidate.installments,
						purchaseDate: date,
						storeName: null,
						totalAmount: Number(raw.totalAmount),
					},
				)
			: date === remote.date && Math.abs(amount) === Math.abs(remote.amount);
		if (exact || suggested)
			candidates.push({
				amount,
				exact,
				id: String(raw.id),
				importId: raw.importId ? String(raw.importId) : null,
				raw,
				source: raw.source as Candidate["source"],
			});
	}
	return candidates;
}
