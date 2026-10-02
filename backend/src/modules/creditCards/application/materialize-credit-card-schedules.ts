import { materializeBookInstallments } from "@zaimu/finance/credit-book";
import { purchaseStatementDates } from "@zaimu/finance/credit-purchase";
import { addMonths, format } from "date-fns";
import { HttpException } from "~/shared/errors";
import { db, param, queryFirst, queryRows } from "~/shared/infra/sql";
import { mutateCreditBook, readCreditBook } from "./normalized-credit-book";

const statementColumns = [
	"id",
	"creditCardId",
	"statementDate",
	"dueDate",
	"totalAmount",
	"paidAmount",
	"isPaid",
	"isFullySynced",
	"createdAt",
	"updatedAt",
] as const;

export function getStatementDates(
	card: { dueDay: number; statementDay: number; workingDueDate?: boolean },
	purchaseDate: Date,
) {
	const dates = purchaseStatementDates(card, purchaseDate.toISOString().slice(0, 10));
	return {
		dueDate: new Date(`${dates.dueDate}T12:00:00Z`),
		statementDate: new Date(`${dates.statementDate}T12:00:00Z`),
	};
}

export async function getOrCreateStatement(creditCardId: string, dueDate: Date, statementDate: Date) {
	await queryFirst(
		db.raw.sql`
			INSERT INTO "CreditCardStatement" ("creditCardId", "dueDate", "statementDate", "totalAmount")
			VALUES (
				${param(creditCardId, { codecId: "sql/varchar@1" })},
				${param(dueDate, { codecId: "pg/date@1" })},
				${param(statementDate, { codecId: "pg/date@1" })},
				0
			)
			ON CONFLICT ("creditCardId", "statementDate") DO NOTHING
			RETURNING "id"
		`
			.returnsRow({ id: db.sql.public.CreditCardStatement.columns.id })
			.build(),
	);
	const statement = await queryFirst(
		db.sql.public.CreditCardStatement.select(...statementColumns)
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.creditCardId, creditCardId),
					functions.eq(fields.statementDate, statementDate),
				),
			)
			.limit(1)
			.build(),
	);
	if (!statement) throw new HttpException("Statement not created", 500);
	return statement;
}

async function materializeMonthlyStatements(
	creditCardId: string,
	card: { createdAt: Date; dueDay: number; statementDay: number; workingDueDate?: boolean },
	today: Date,
) {
	const oldestStatement = await queryFirst(
		db.sql.public.CreditCardStatement.select("statementDate")
			.where((fields, functions) => functions.eq(fields.creditCardId, creditCardId))
			.orderBy("statementDate", { direction: "asc" })
			.limit(1)
			.build(),
	);
	const firstStatementDate =
		oldestStatement?.statementDate ?? getStatementDates(card, card.createdAt).statementDate;
	const lastStatementDate = getStatementDates(card, today).statementDate;
	let month = new Date(firstStatementDate.getFullYear(), firstStatementDate.getMonth(), 1);
	const lastMonth = new Date(lastStatementDate.getFullYear(), lastStatementDate.getMonth(), 1);
	while (month <= lastMonth) {
		const { dueDate, statementDate } = getStatementDates(card, month);
		await getOrCreateStatement(creditCardId, dueDate, statementDate);
		month = addMonths(month, 1);
	}
}

export async function materializeCreditCardSchedules(asOf = new Date()) {
	const cards = await queryRows(
		db.sql.public.CreditCard.select(
			"cashbackAccountId",
			"cashbackRate",
			"cashbackYieldPeriod",
			"cashbackYieldReferencePercentage",
			"cashbackYieldReferenceRate",
			"createdAt",
			"dueDay",
			"financialAccountId",
			"id",
			"statementDay",
			"workingDueDate",
		).build(),
	);
	const accounts = await queryRows(
		db.sql.public.FinancialAccount.select("id", "userId")
			.where((fields, functions) =>
				functions.in(
					fields.id,
					cards.map(card => card.financialAccountId),
				),
			)
			.build(),
	);
	const owners = new Map(accounts.map(account => [account.id, account.userId]));
	for (const card of cards) {
		await materializeMonthlyStatements(card.id, card, asOf);
		const owner = owners.get(card.financialAccountId)!;
		const book = await readCreditBook(owner, card.id);
		const before = book.installments.length;
		materializeBookInstallments(book, format(asOf, "yyyy-MM-dd"));
		if (book.installments.length !== before)
			await mutateCreditBook(owner, card.id, () => undefined, format(asOf, "yyyy-MM-dd"));
	}
	return { cards: cards.length, userIds: [...new Set(accounts.map(account => account.userId))] };
}
