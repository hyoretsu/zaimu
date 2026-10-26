import { workingDueDateSql } from "~/modules/accounts/application/institution-card-rules";
import { financialDate } from "~/shared/application/financial-date";
import { queryRaw } from "~/shared/infra/sql";
import { missingMonthlyStatements } from "./credit-card-schedule-periods";

type ScheduleCard = Record<string, unknown> & {
	calendarHistory?: import("@zaimu/finance/credit-card").CardCalendarPeriod[] | null;
	id: string;
	userId: string;
	preferredCountry: string | null;
	preferredTimeZone: string | null;
	createdAt: Date;
	dueDay: number;
	statementClosingInclusive: boolean;
	statementDay: number;
	workingDueDate: boolean;
};

export async function loadCreditCardScheduleCandidates(asOf: Date, cardIds?: string[]) {
	if (cardIds && !cardIds.length) return [];
	const cards = await queryRaw<ScheduleCard>(
		`SELECT c."id",a."userId",u."preferredCountry",u."preferredTimeZone",c."createdAt",c."dueDay",c."statementDay", c."calendarHistory",${workingDueDateSql("a")} AS "workingDueDate", COALESCE(i."creditStatementClosingInclusive", false) AS "statementClosingInclusive" FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" JOIN "user" u ON u."id"=a."userId" LEFT JOIN "FinancialInstitution" i ON i."id"=a."institutionId" WHERE ($1::varchar[] IS NULL OR c."id"=ANY($1))`,
		[cardIds ?? null],
	);
	if (!cards.length) return [];
	const ids = cards.map(card => card.id);
	const cutoffs = Object.fromEntries(
		cards.map(card => [card.id, financialDate(asOf, card.preferredCountry, card.preferredTimeZone)]),
	);
	const [statements, due] = await Promise.all([
		queryRaw<{ creditCardId: string; statementDate: Date }>(
			`SELECT "creditCardId","statementDate" FROM "CreditCardStatement" WHERE "creditCardId"=ANY($1)`,
			[ids],
		),
		queryRaw<{ creditCardId: string; occurrenceDate: string }>(
			`SELECT DISTINCT p."creditCardId",(p."purchaseDate"+make_interval(months=>plan."number"-1))::date::text AS "occurrenceDate" FROM "CreditPurchaseRecord" p JOIN "CreditInstallmentPlan" plan ON plan."purchaseId"=p."id" LEFT JOIN "CreditInstallmentRecord" item ON item."purchaseId"=p."id" AND item."number"=plan."number" WHERE p."creditCardId"=ANY($1) AND (p."purchaseDate"+make_interval(months=>plan."number"-1))::date <= ($2::jsonb->>p."creditCardId")::date AND item."id" IS NULL`,
			[ids, JSON.stringify(cutoffs)],
		),
	]);
	const byCard = Map.groupBy(statements, row => row.creditCardId);
	const dueByCard = Map.groupBy(due, row => row.creditCardId);
	return cards
		.map(card => {
			const through = financialDate(asOf, card.preferredCountry, card.preferredTimeZone);
			return {
				through,
				...card,
				dueInstallments: (dueByCard.get(card.id) ?? []).some(row => row.occurrenceDate <= through),
				missingStatements: missingMonthlyStatements(
					card,
					(byCard.get(card.id) ?? []).map(row => row.statementDate),
					new Date(`${through}T12:00:00Z`),
				),
			};
		})
		.filter(card => card.dueInstallments || card.missingStatements.length > 0);
}
