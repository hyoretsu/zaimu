import { queryRaw } from "~/shared/infra/sql";
export type LocalKind = "TRANSACTION" | "PURCHASE" | "CHARGE" | "REFUND";
export async function localSnapshot(kind: LocalKind, id: string, userId: string) {
	const table =
		kind === "TRANSACTION"
			? "Transaction"
			: kind === "PURCHASE"
				? "CreditPurchaseRecord"
				: kind === "CHARGE"
					? "CreditStatementCharge"
					: "CreditRefundRecord";
	const [row] = await queryRaw<{ snapshot: Record<string, unknown> }>(
		`SELECT jsonb_build_object('entity', to_jsonb(e) ${kind === "CHARGE" || kind === "REFUND" ? `|| jsonb_build_object('creditCardId', (SELECT s."creditCardId" FROM "CreditCardStatement" s WHERE s."id"=e."statementId"))` : ""}, 'tags', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t."id") FROM "TagAssignment" t WHERE t."entityId"=e."id"), '[]'::jsonb),
   'plans', ${kind === "PURCHASE" ? `COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p."number") FROM "CreditInstallmentPlan" p WHERE p."purchaseId"=e."id"), '[]'::jsonb)` : `'[]'::jsonb`}, 'debt', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d."id") FROM "DebtSplit" d WHERE ${kind === "TRANSACTION" ? 'd."transactionId"' : 'd."creditPurchaseId"'}=e."id"), '[]'::jsonb)) AS snapshot
   FROM "${table}" e WHERE e."id"=$1 ${kind === "TRANSACTION" || kind === "PURCHASE" ? 'AND e."userId"=$2' : 'AND EXISTS (SELECT 1 FROM "CreditCardStatement" s JOIN "CreditCard" c ON c."id"=s."creditCardId" JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" WHERE s."id"=e."statementId" AND a."userId"=$2)'}`,
		[id, userId],
	);
	return row?.snapshot ?? null;
}
export function sameSnapshot(a: unknown, b: unknown): boolean {
	const sort = (value: unknown): unknown =>
		Array.isArray(value)
			? value.map(sort)
			: value && typeof value === "object"
				? Object.fromEntries(
						Object.entries(value)
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([key, item]) => [key, sort(item)]),
					)
				: value;
	return JSON.stringify(sort(a)) === JSON.stringify(sort(b));
}
