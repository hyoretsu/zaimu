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
		currency: string;
		isHidden: boolean;
		institution: { name: string } | null;
	}>(
		`SELECT a."id",a."name",a."type",a."currency",a."isHidden",
 CASE WHEN i."id" IS NULL THEN NULL ELSE jsonb_build_object('name',i."name") END AS institution
 FROM "FinancialAccount" a LEFT JOIN "FinancialInstitution" i ON i."id"=a."institutionId"
 WHERE a."userId"=$1 AND ($2::text IS NULL OR a."type"::text=$2) ORDER BY a."name",a."id"`,
		[userId, type ?? null],
	);
}
