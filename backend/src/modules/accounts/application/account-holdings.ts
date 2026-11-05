import { decimalToUnits } from "@zaimu/finance/asset-amount";
import { registerAssetDecimals } from "@zaimu/finance/money";
import { HttpException } from "~/shared/errors";
import { queryRawDecimal } from "~/shared/infra/sql";
import { ensureAccountAssetCatalog } from "./account-assets";
import { monetaryBalancesSql } from "./monetary-balances-sql";

export interface AccountHoldingInput {
	assetCode: string;
	balance: string;
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
export async function saveAccountHoldings(
	accountId: string,
	assets: AccountHoldingInput[],
	yieldCurrency?: string | null,
) {
	if (new Set(assets.map(asset => asset.assetCode)).size !== assets.length)
		throw new HttpException("Ativos duplicados", 400);
	const current = await queryRawDecimal<{ assetCode: string }>(
		`SELECT "assetCode" FROM "FinancialAccountAsset" WHERE "financialAccountId"=$1`,
		[accountId],
	);
	if (
		assets.length &&
		current.some(holding => !assets.some(asset => asset.assetCode === holding.assetCode))
	)
		throw new HttpException("Preserve os ativos existentes da conta", 409);
	for (const holding of assets) {
		await ensureAccountAssetCatalog(holding.assetCode);
		const [asset] = await queryRawDecimal<{ kind: string; decimals: number }>(
			`SELECT "kind","decimals" FROM "Asset" WHERE "code"=$1`,
			[holding.assetCode],
		);
		if (!asset) throw new HttpException("Ativo inválido", 400);
		if (asset.kind === "CRYPTO") registerAssetDecimals(holding.assetCode, asset.decimals);
		const units = decimalToUnits(holding.balance, holding.assetCode);
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
				[accountId, holding.assetCode, crypto.randomUUID(), holding.balance],
			);
	}
	if (yieldCurrency) {
		const [fiat] = await queryRawDecimal(
			`SELECT holding."assetCode" FROM "FinancialAccountAsset" holding JOIN "Asset" asset ON asset."code"=holding."assetCode" WHERE holding."financialAccountId"=$1 AND holding."assetCode"=$2 AND asset."kind"='FIAT'`,
			[accountId, yieldCurrency],
		);
		if (!fiat) throw new HttpException("Selecione um ativo fiat da conta para rendimento", 400);
	}
}
