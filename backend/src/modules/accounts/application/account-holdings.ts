import { decimalToUnits } from "@zaimu/finance/asset-amount";
import { registerAssetDecimals } from "@zaimu/finance/money";
import { HttpException } from "~/shared/errors";
import { queryRawDecimal } from "~/shared/infra/sql";
import { ensureAccountAssetCatalog } from "./account-assets";
import { monetaryBalancesSql } from "./monetary-balances-sql";

export interface AccountHoldingInput {
	assetCode: string;
	balance?: string;
}

export async function accountHoldings(userId: string, accountId: string) {
	const rows = await queryRawDecimal<{ accountId: string; assetCode: string; balance: string }>(
		monetaryBalancesSql.replace(
			'WHERE account."userId"=$1',
			'WHERE account."userId"=$1 AND account."id"=$3',
		),
		[userId, [new Date().toISOString().slice(0, 10)], accountId],
	);
	return rows.map(row => ({ assetCode: row.assetCode, balance: String(row.balance) }));
}

/** Holdings are denomination declarations, never an alternative ledger write API. */
export async function saveAccountHoldings(accountId: string, assets: AccountHoldingInput[] | undefined) {
	const declared = assets ?? [];
	if (new Set(declared.map(asset => asset.assetCode)).size !== declared.length)
		throw new HttpException("Ativos duplicados", 400);
	const current = await queryRawDecimal<{ assetCode: string }>(
		`SELECT "assetCode" FROM "FinancialAccountAsset" WHERE "financialAccountId"=$1`,
		[accountId],
	);
	if (assets) {
		for (const holding of current.filter(
			holding => !assets.some(asset => asset.assetCode === holding.assetCode),
		)) {
			const [used] = await queryRawDecimal(
				`SELECT 1 FROM (
 SELECT 1 FROM "BalanceAdjustment" WHERE "financialAccountId"=$1 AND "assetCode"=$2
 UNION ALL SELECT 1 FROM "Transaction" WHERE ("originFinancialAccountId"=$1 AND "bookingCurrency"=$2) OR ("destinationFinancialAccountId"=$1 AND COALESCE("destinationCurrency","bookingCurrency")=$2)
 UNION ALL SELECT 1 FROM "FinancialAccountYield" WHERE "financialAccountId"=$1 AND "assetCode"=$2
 UNION ALL SELECT 1 FROM "LoanPayment" WHERE "financialAccountId"=$1 AND COALESCE("accountCurrency","currency")=$2
 ) history LIMIT 1`,
				[accountId, holding.assetCode],
			);
			if (used)
				throw new HttpException(
					`O ativo ${holding.assetCode} possui histórico na conta e não pode ser removido`,
					409,
				);
			await queryRawDecimal(
				`DELETE FROM "FinancialAccountAsset" WHERE "financialAccountId"=$1 AND "assetCode"=$2`,
				[accountId, holding.assetCode],
			);
		}
	}
	for (const holding of declared) {
		const balance = holding.balance ?? "0";
		await ensureAccountAssetCatalog(holding.assetCode);
		const [asset] = await queryRawDecimal<{ kind: string; decimals: number }>(
			`SELECT "kind","decimals" FROM "Asset" WHERE "code"=$1`,
			[holding.assetCode],
		);
		if (!asset) throw new HttpException("Ativo inválido", 400);
		if (asset.kind === "CRYPTO") registerAssetDecimals(holding.assetCode, asset.decimals);
		const units = decimalToUnits(balance, holding.assetCode);
		const [existing] = await queryRawDecimal(
			`SELECT "assetCode" FROM "FinancialAccountAsset" WHERE "financialAccountId"=$1 AND "assetCode"=$2`,
			[accountId, holding.assetCode],
		);
		await queryRawDecimal(
			`INSERT INTO "FinancialAccountAsset" ("financialAccountId","assetCode","balance") VALUES ($1,$2,0) ON CONFLICT ("financialAccountId","assetCode") DO NOTHING`,
			[accountId, holding.assetCode],
		);
		if (!existing && units !== 0n)
			await queryRawDecimal(
				`INSERT INTO "BalanceAdjustment" ("id","userId","financialAccountId","assetCode","balance","date","createdAt","updatedAt") SELECT $3,account."userId",account."id",$2,$4::numeric,CURRENT_DATE,now(),now() FROM "FinancialAccount" account WHERE account."id"=$1`,
				[accountId, holding.assetCode, crypto.randomUUID(), balance],
			);
	}
	await syncPrimaryYieldCurrency(accountId);
}

/** `yieldCurrency` is server-derived: the primary fiat holding (kept when still held, else the first one). Accounts without fiat holdings keep their value. */
export async function syncPrimaryYieldCurrency(accountId: string) {
	await queryRawDecimal(
		`UPDATE "FinancialAccount" account SET "yieldCurrency"=COALESCE(
 (SELECT holding."assetCode" FROM "FinancialAccountAsset" holding JOIN "Asset" asset ON asset."code"=holding."assetCode" AND asset."kind"='FIAT' WHERE holding."financialAccountId"=account."id" AND holding."assetCode"=account."yieldCurrency"),
 (SELECT holding."assetCode" FROM "FinancialAccountAsset" holding JOIN "Asset" asset ON asset."code"=holding."assetCode" AND asset."kind"='FIAT' WHERE holding."financialAccountId"=account."id" ORDER BY holding."assetCode" LIMIT 1),
 account."yieldCurrency") WHERE account."id"=$1`,
		[accountId],
	);
}
