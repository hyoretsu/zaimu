import { decimalToUnits } from "@zaimu/finance/asset-amount";
import { roundMoney } from "@zaimu/finance/money";
import type { RawQuery } from "~/modules/creditCards/application/normalized-statement-replay";
import { businessDateSql } from "~/shared/infra/sql/business-date";
import { resolveAccountAsset } from "./account-assets";
import { monetaryBalancesSql } from "./monetary-balances-sql";

// Use the same ledger as balances/dashboard, excluding only this checkpoint.
const withoutCheckpointSql = monetaryBalancesSql
	.replace('WHERE checkpoint."userId"=$1 AND', 'WHERE checkpoint."id" <> $3 AND checkpoint."userId"=$1 AND')
	.replace('WHERE account."userId"=$1', 'WHERE account."userId"=$1 AND account."id"=$4');

export async function balanceBeforeAdjustment(
	query: RawQuery,
	userId: string,
	adjustment: { id: string; financialAccountId: string; date: Date | string; assetCode: string },
) {
	const date =
		adjustment.date instanceof Date
			? adjustment.date.toISOString().slice(0, 10)
			: adjustment.date.slice(0, 10);
	const rows = await query<{ accountId: string; assetCode: string; balance: string }>(
		withoutCheckpointSql,
		[userId, [date], adjustment.id, adjustment.financialAccountId],
	);
	const row = rows.find(
		row => row.accountId === adjustment.financialAccountId && row.assetCode === adjustment.assetCode,
	);
	if (!row) throw new Error("Conta do ajuste não encontrada");
	return String(row.balance);
}

/** Run only after actual yields settle, inside a transaction. Row locks protect edits. */
export async function reconcileBalanceAdjustments(
	query: RawQuery,
	userId: string,
	accountId: string,
	fromDate = "0001-01-01",
	/** Exclusive upper bound: only checkpoints before it have settled inputs. */
	beforeDate: string | null = null,
) {
	const adjustments = await query<{
		id: string;
		financialAccountId: string;
		date: string;
		balance: string;
		assetCode: string;
	}>(
		`SELECT "id", "financialAccountId", "date"::text, "balance"::text AS "balance", "assetCode"
		 FROM "BalanceAdjustment" WHERE "userId"=$1 AND "financialAccountId"=$2 AND "date"<=${businessDateSql} AND "date">=$3::date AND ($4::date IS NULL OR "date"<$4::date)
		 ORDER BY "date", "id" FOR UPDATE`,
		[userId, accountId, fromDate, beforeDate],
	);
	const removed: string[] = [];
	for (const adjustment of adjustments) {
		const calculated = await balanceBeforeAdjustment(query, userId, adjustment);
		const asset = await resolveAccountAsset(accountId, adjustment.assetCode, { userId });
		const matches =
			asset.kind === "FIAT"
				? roundMoney(Number(calculated), asset.assetCode) ===
					roundMoney(Number(adjustment.balance), asset.assetCode)
				: decimalToUnits(calculated, asset.assetCode) ===
					decimalToUnits(String(adjustment.balance), asset.assetCode);
		if (!matches) continue;
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
