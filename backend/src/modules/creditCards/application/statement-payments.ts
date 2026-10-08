import { replayCreditBook } from "@zaimu/finance/credit-book";
import {
	currentDateKey,
	type FinancialDate,
	type StatementInput,
	statementCycles,
} from "@zaimu/finance/credit-card";
import { numeric, queryRaw, type SqlExecutor } from "~/shared/infra/sql";
import { readCreditBook } from "./normalized-credit-book";

export async function withStatementPayments<T extends StatementInput & { creditCardId: string }>(
	statements: T[],
	executor?: SqlExecutor,
	asOf: FinancialDate = currentDateKey(),
) {
	if (!statements.length) return [];
	const ids = [...new Set(statements.map(s => s.creditCardId))];
	const owners = await queryRaw<{ id: string; userId: string }>(
		`SELECT c."id",a."userId" FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" WHERE c."id"=ANY($1)`,
		[ids],
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
						template.dueDate instanceof Date ? new Date(`${statement.dueDate}T12:00:00Z`) : statement.dueDate,
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
		)
			.where((f, fn) => fn.in(f.creditCardId, cardIds))
			.build(),
	);
	const cards = await transaction.queryRows(
		transaction.db.sql.public.CreditCard.select(
			"id",
			"currency",
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
		const cycles = statementCycles(
			statements.filter(s => s.creditCardId === card.id),
			card,
			payments
				.filter(p => p.paymentCreditCardId === card.id)
				.map(p => ({ ...p, amount: p.paymentAmount ?? p.amount })),
			dates => ({
				creditCardId: card.id,
				dueDate: new Date(`${dates.dueDate}T12:00:00Z`),
				id: `cycle-${dates.statementDate}`,
				paidAmount: 0,
				statementDate: new Date(`${dates.statementDate}T12:00:00Z`),
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
	for (const statement of await withStatementPayments(statements, transaction)) {
		if (statement.id.startsWith("cycle-") || statement.isForecast) continue;
		await transaction.executeStatement(
			transaction.db.sql.public.CreditCardStatement.update({
				isPaid: statement.isPaid,
				paidAmount: numeric<12, 2>(statement.paidAmount),
				updatedAt: new Date(),
			})
				.where((f, fn) => fn.eq(f.id, statement.id))
				.build(),
		);
	}
}
