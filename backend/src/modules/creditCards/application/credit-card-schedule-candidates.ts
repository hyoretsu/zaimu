import { queryRaw } from "~/shared/infra/sql";
import { missingMonthlyStatements } from "./credit-card-schedule-periods";

type ScheduleCard = Record<string, unknown> & {
	id: string;
	userId: string;
	createdAt: Date;
	dueDay: number;
	statementDay: number;
	workingDueDate: boolean;
};

export async function loadCreditCardScheduleCandidates(asOf: Date, cardIds?: string[]) {
	if (cardIds && !cardIds.length) return [];
	const cards = await queryRaw<ScheduleCard>(
		`SELECT c."id",a."userId",c."createdAt",c."dueDay",c."statementDay",c."workingDueDate" FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" WHERE ($1::varchar[] IS NULL OR c."id"=ANY($1))`,
		[cardIds ?? null],
	);
	if (!cards.length) return [];
	const ids = cards.map(card => card.id);
	const [statements, due] = await Promise.all([
		queryRaw<{ creditCardId: string; statementDate: Date }>(
			`SELECT "creditCardId","statementDate" FROM "CreditCardStatement" WHERE "creditCardId"=ANY($1)`,
			[ids],
		),
		queryRaw<{ creditCardId: string }>(
			`SELECT DISTINCT p."creditCardId" FROM "CreditPurchaseRecord" p JOIN "CreditInstallmentPlan" plan ON plan."purchaseId"=p."id" LEFT JOIN "CreditInstallmentRecord" item ON item."purchaseId"=p."id" AND item."number"=plan."number" WHERE p."creditCardId"=ANY($1) AND (p."purchaseDate"+make_interval(months=>plan."number"-1))::date <= $2::date AND item."id" IS NULL`,
			[ids, asOf.toISOString().slice(0, 10)],
		),
	]);
	const byCard = Map.groupBy(statements, row => row.creditCardId);
	const dueIds = new Set(due.map(row => row.creditCardId));
	return cards
		.map(card => ({
			...card,
			dueInstallments: dueIds.has(card.id),
			missingStatements: missingMonthlyStatements(
				card,
				(byCard.get(card.id) ?? []).map(row => row.statementDate),
				asOf,
			),
		}))
		.filter(card => card.dueInstallments || card.missingStatements.length > 0);
}
