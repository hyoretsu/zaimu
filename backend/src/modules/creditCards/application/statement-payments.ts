import { replayCreditBook } from "@zaimu/finance/credit-book";
import {
	currentDateKey,
	type FinancialDate,
	normalizeCardCalendar,
	statementCycles,
	type StatementInput,
} from "@zaimu/finance/credit-card";
import { accountCardRules } from "~/modules/accounts/application/institution-card-rules";
import { db, queryRaw, queryRows, type SqlExecutor } from "~/shared/infra/sql";
import { mutateCreditBook, readCreditBook } from "./normalized-credit-book";

export async function withStatementPayments<T extends StatementInput & { creditCardId: string }>(
	statements: T[],
	executor?: SqlExecutor,
	asOf: FinancialDate = currentDateKey(),
) {
	if (!statements.length) return [];
	const ids = [...new Set(statements.map(s => s.creditCardId))];
	const owners = await queryRows(
		db.sql.public.CreditCard.innerJoin(db.sql.public.FinancialAccount, (fields, functions) =>
			functions.eq(fields.CreditCard.financialAccountId, fields.FinancialAccount.id),
		)
			.select(fields => ({ id: fields.CreditCard.id, userId: fields.FinancialAccount.userId }))
			.where((fields, functions) => functions.in(fields.CreditCard.id, ids))
			.build(),
	);
	const dateKey =
		asOf instanceof Date
			? `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}-${String(asOf.getDate()).padStart(2, "0")}`
			: asOf.slice(0, 10);
	return (
		await Promise.all(
			owners.map(async owner => {
				const book = await readCreditBook(owner.userId, owner.id);
				const template = statements.find(s => s.creditCardId === owner.id)!;
				return replayCreditBook(book, dateKey).statements.map(statement => ({
					...template,
					...statement,
					dueDate:
						template.dueDate instanceof Date
							? new Date(`${statement.dueDate}T12:00:00Z`)
							: statement.dueDate,
					statementDate:
						template.statementDate instanceof Date
							? new Date(`${statement.statementDate}T12:00:00Z`)
							: statement.statementDate,
				}));
			}),
		)
	).flat();
}

export async function recalculateStatementPayments(transaction: SqlExecutor, cardIds: string[]) {
	if (!cardIds.length) return;
	const owners = await queryRaw<{ id: string; userId: string }>(
		`SELECT c."id", a."userId" FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" WHERE c."id"=ANY($1) ORDER BY c."id"`,
		[cardIds],
	);
	for (const owner of owners) await mutateCreditBook(owner.userId, owner.id, () => undefined);
	await transaction.executeStatement(
		transaction.db.sql.public.CreditCard.update({ updatedAt: new Date() })
			.where((f, fn) => fn.in(f.id, [...new Set(cardIds)].sort()))
			.build(),
	);
	const statements = await transaction.queryRows(
		transaction.db.sql.public.CreditCardStatement.select(
			"id",
			"creditCardId",
			"statementDate",
			"dueDate",
			"totalAmount",
			"paidAmount",
			"isPaid",
		)
			.where((f, fn) => fn.in(f.creditCardId, cardIds))
			.build(),
	);
	const cards = await transaction.queryRows(
		transaction.db.sql.public.CreditCard.select(
			"id",
			"currency",
			"financialAccountId",
			"calendarHistory",
			"statementDay",
			"dueDay",
			"workingDueDate",
			"ignoreStatementsBefore",
		)
			.where((f, fn) => fn.in(f.id, cardIds))
			.build(),
	);
	const payments = await transaction.queryRows(
		transaction.db.sql.public.Transaction.select("paymentCreditCardId", "date", "amount", "paymentAmount")
			.where((f, fn) => fn.in(f.paymentCreditCardId, cardIds))
			.build(),
	);
	for (const card of cards) {
		card.workingDueDate = (await accountCardRules(card.financialAccountId)).workingDueDate;
		const cycles = statementCycles(
			statements.filter(s => s.creditCardId === card.id),
			normalizeCardCalendar(card),
			payments
				.filter(p => p.paymentCreditCardId === card.id)
				.map(p => ({ ...p, amount: p.paymentAmount ?? p.amount })),
			dates => ({
				creditCardId: card.id,
				dueDate: dates.dueDate,
				id: `cycle-${dates.statementDate}`,
				isPaid: false,
				paidAmount: 0,
				statementDate: dates.statementDate,
				totalAmount: 0,
			}),
		);
		for (const cycle of cycles.filter(s => s.id.startsWith("cycle-"))) {
			const created = await transaction.queryFirst(
				transaction.db.sql.public.CreditCardStatement.insert([
					{
						creditCardId: card.id,
						currency: card.currency,
						dueDate: cycle.dueDate,
						statementDate: cycle.statementDate,
						totalAmount: "0",
					},
				])
					.returning("id")
					.build(),
			);
			if (created) statements.push({ ...cycle, id: created.id });
		}
	}
	const stored = new Map(statements.map(statement => [statement.id, statement]));
	const changed = (await withStatementPayments(statements, transaction)).filter(statement => {
		if (statement.id.startsWith("cycle-") || statement.isForecast) return false;
		const previous = stored.get(statement.id);
		return (
			previous &&
			(Number(previous.paidAmount) !== statement.paidAmount || previous.isPaid !== statement.isPaid)
		);
	});
	if (changed.length)
		await queryRaw(
			`UPDATE "CreditCardStatement" s SET "isPaid"=v."isPaid", "paidAmount"=v."paidAmount", "updatedAt"=CURRENT_TIMESTAMP FROM jsonb_to_recordset($1::jsonb) AS v(id text, "isPaid" boolean, "paidAmount" numeric) WHERE s.id=v.id AND (s."isPaid" IS DISTINCT FROM v."isPaid" OR s."paidAmount" IS DISTINCT FROM v."paidAmount")`,
			[
				JSON.stringify(
					changed.map(statement => ({
						id: statement.id,
						isPaid: statement.isPaid,
						paidAmount: statement.paidAmount,
					})),
				),
			],
		);
}
