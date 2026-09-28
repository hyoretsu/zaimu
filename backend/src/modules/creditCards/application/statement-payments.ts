import { db, numeric, queryRows, type SqlExecutor } from "~/shared/infra/sql";
import { applyStatementCredits } from "../domain/statement-balance";
import { getPaidAmountsByCard } from "../domain/statement-payments";
import { getStatementDates } from "./materialize-credit-card-schedules";

export async function withStatementPayments<
	T extends { id: string; creditCardId: string; paidAmount: number | string },
>(statements: T[], executor?: SqlExecutor) {
	if (!statements.length) return statements;
	const payments = await (executor?.queryRows ?? queryRows)(
		(executor?.db ?? db).sql.public.Transaction.select("amount", "paymentCreditCardId")
			.where((f, fn) => fn.in(f.paymentCreditCardId, [...new Set(statements.map(s => s.creditCardId))]))
			.build(),
	);
	const amounts = getPaidAmountsByCard(payments);
	const seen = new Set<string>();
	return statements.map(statement => {
		const paidAmount = seen.has(statement.creditCardId)
			? 0
			: (amounts.get(statement.creditCardId) ?? 0) / 100;
		seen.add(statement.creditCardId);
		return { ...statement, paidAmount };
	});
}

export async function recalculateStatementPayments(transaction: SqlExecutor, cardIds: string[]) {
	if (!cardIds.length) return;
	// Serialize recomputation for concurrent payments on the same card.
	await transaction.executeStatement(
		transaction.db.sql.public.CreditCard.update({ updatedAt: new Date() })
			.where((f, fn) => fn.in(f.id, [...new Set(cardIds)].sort()))
			.build(),
	);
	const payments = await transaction.queryRows(
		transaction.db.sql.public.Transaction.select("paymentCreditCardId", "date")
			.where((f, fn) => fn.in(f.paymentCreditCardId, cardIds))
			.build(),
	);
	const cards = await transaction.queryRows(
		transaction.db.sql.public.CreditCard.select("id", "statementDay", "dueDay")
			.where((f, fn) => fn.in(f.id, cardIds))
			.build(),
	);
	const existingDates = await transaction.queryRows(
		transaction.db.sql.public.CreditCardStatement.select("creditCardId", "statementDate")
			.where((f, fn) => fn.in(f.creditCardId, cardIds))
			.build(),
	);
	const knownDates = new Set(
		existingDates.map(item => `${item.creditCardId}:${item.statementDate.toISOString().slice(0, 10)}`),
	);
	for (const payment of payments) {
		const card = cards.find(c => c.id === payment.paymentCreditCardId);
		if (!card) continue;
		const { dueDate, statementDate } = getStatementDates(
			card,
			new Date(`${payment.date.toISOString().slice(0, 10)}T12:00:00`),
		);
		const key = `${card.id}:${statementDate.toISOString().slice(0, 10)}`;
		if (knownDates.has(key)) continue;
		await transaction.executeStatement(
			transaction.db.sql.public.CreditCardStatement.insert([
				{ creditCardId: card.id, dueDate, statementDate, totalAmount: "0" },
			]).build(),
		);
		knownDates.add(key);
	}
	const statements = await transaction.queryRows(
		transaction.db.sql.public.CreditCardStatement.select(
			"id",
			"creditCardId",
			"statementDate",
			"totalAmount",
			"paidAmount",
		)
			.where((f, fn) => fn.in(f.creditCardId, cardIds))
			.build(),
	);
	const groups = Map.groupBy(await withStatementPayments(statements, transaction), s => s.creditCardId);
	for (const group of groups.values())
		for (const statement of applyStatementCredits(group)) {
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
