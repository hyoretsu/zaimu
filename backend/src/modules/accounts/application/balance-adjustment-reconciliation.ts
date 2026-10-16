import { toCents } from "@zaimu/finance/credit-card";
import type { RawQuery } from "~/modules/creditCards/application/normalized-statement-replay";
import { monetaryBalancesSql } from "./monetary-balances-sql";

// Use the same ledger as balances/dashboard, excluding only this checkpoint.
const withoutCheckpointSql = monetaryBalancesSql
	.replace('WHERE checkpoint."userId"=$1 AND', 'WHERE checkpoint."id" <> $3 AND checkpoint."userId"=$1 AND')
	.replace('WHERE account."userId"=$1', 'WHERE account."userId"=$1 AND account."id"=$4');

export async function balanceBeforeAdjustment(
	query: RawQuery,
	userId: string,
	adjustment: { id: string; financialAccountId: string; date: Date | string },
) {
	const date =
		adjustment.date instanceof Date
			? adjustment.date.toISOString().slice(0, 10)
			: adjustment.date.slice(0, 10);
	const rows = await query<{ accountId: string; balance: number }>(withoutCheckpointSql, [
		userId,
		[date],
		adjustment.id,
		adjustment.financialAccountId,
	]);
	const row = rows.find(row => row.accountId === adjustment.financialAccountId);
	if (!row) throw new Error("Conta do ajuste não encontrada");
	return Number(row.balance);
}

/** Run only after actual yields settle, inside a transaction. Row locks protect edits. */
export async function reconcileBalanceAdjustments(
	query: RawQuery,
	userId: string,
	accountId: string,
	fromDate = "0001-01-01",
) {
	const adjustments = await query<{
		id: string;
		financialAccountId: string;
		date: string;
		balance: number;
		currency: string;
	}>(
		`SELECT "id", "financialAccountId", "date"::text, "balance", "currency"
		 FROM "BalanceAdjustment" WHERE "userId"=$1 AND "financialAccountId"=$2 AND "date"<=CURRENT_DATE AND "date">=$3::date
		 ORDER BY "date", "id" FOR UPDATE`,
		[userId, accountId, fromDate],
	);
	const removed: string[] = [];
	for (const adjustment of adjustments) {
		const calculated = await balanceBeforeAdjustment(query, userId, adjustment);
		if (toCents(calculated, adjustment.currency) !== toCents(adjustment.balance, adjustment.currency))
			continue;
		await query(`DELETE FROM "BalanceAdjustment" WHERE "id"=$1 AND "userId"=$2`, [adjustment.id, userId]);
		removed.push(adjustment.id);
	}
	return removed;
}

/** Snapshot changes include deletions and checkpoint edits, not only updated timestamps. */
export async function balanceAdjustmentSourceVersion(query: RawQuery, accountId: string) {
	const [row] = await query<{ version: string }>(
		`SELECT md5(concat(
	 (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."id"),'[]') FROM "Transaction" t WHERE t."originFinancialAccountId"=$1 OR t."destinationFinancialAccountId"=$1),
	 (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p."id"),'[]') FROM "LoanPayment" p WHERE p."financialAccountId"=$1),
	 (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a."id"),'[]') FROM "BalanceAdjustment" a WHERE a."financialAccountId"=$1),
	 (SELECT COALESCE(jsonb_agg(to_jsonb(y) ORDER BY y."id"),'[]') FROM "FinancialAccountYield" y WHERE y."financialAccountId"=$1 AND y."origin"='USER'),
	 (SELECT to_jsonb(a) FROM "FinancialAccount" a WHERE a."id"=$1)
	 )) AS version`,
		[accountId],
	);
	return row!.version;
}
