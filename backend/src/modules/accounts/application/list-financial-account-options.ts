import { queryRaw } from "~/shared/infra/sql";

/** Selector data never loads balances, card books, profiles or yield history. */
export function listFinancialAccountOptions(
	userId: string,
	type?: "CHECKING" | "SAVINGS" | "INVESTMENT" | "CASH" | "CREDIT_CARD" | "REWARDS",
) {
	return queryRaw<{
		id: string;
		name: string | null;
		type: "CHECKING" | "SAVINGS" | "INVESTMENT" | "CASH" | "CREDIT_CARD" | "REWARDS";
		currency: string | null;
		yieldCurrency: string | null;
		assets: Array<{ assetCode: string; balance: string }>;
		isHidden: boolean;
		institution: { name: string } | null;
	}>(
		`SELECT a."id",a."name",a."type",a."yieldCurrency",a."isHidden",
 (SELECT CASE WHEN count(*)=1 THEN min(h."assetCode") END FROM "FinancialAccountAsset" h WHERE h."financialAccountId"=a."id") AS currency,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('assetCode',h."assetCode",'balance',h."balance"::text) ORDER BY h."assetCode") FROM "FinancialAccountAsset" h WHERE h."financialAccountId"=a."id"),'[]'::jsonb) AS assets,
 CASE WHEN i."id" IS NULL THEN NULL ELSE jsonb_build_object('name',i."name") END AS institution
 FROM "FinancialAccount" a LEFT JOIN "FinancialInstitution" i ON i."id"=a."institutionId"
 WHERE a."userId"=$1 AND ($2::text IS NULL OR a."type"::text=$2) ORDER BY a."name",a."id"`,
		[userId, type ?? null],
	);
}
