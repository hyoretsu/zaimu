import { db, numeric, queryRows, type SqlExecutor } from "~/shared/infra/sql";
import { getPaidAmountsByStatement } from "../domain/statement-payments";

const toCents = (amount: number | string) => Math.round(Number(amount) * 100);

export async function withStatementPayments<T extends { id: string; paidAmount: number }>(
	statements: T[],
): Promise<T[]> {
	if (!statements.length) return statements;
	const payments = await queryRows(
		db.sql.public.Transaction.select("amount", "creditCardStatementId")
			.where((fields, functions) =>
				functions.in(
					fields.creditCardStatementId,
					statements.map(statement => statement.id),
				),
			)
			.build(),
	);
	const paidByStatement = getPaidAmountsByStatement(payments);
	return statements.map(statement => {
		const paidAmount = (paidByStatement.get(statement.id) ?? 0) / 100;
		return { ...statement, paidAmount };
	});
}

export async function recalculateStatementPayments(transaction: SqlExecutor, statementIds: string[]) {
	if (!statementIds.length) return;
	const statements = await transaction.queryRows(
		transaction.db.sql.public.CreditCardStatement.select("id", "paidAmount", "totalAmount")
			.where((fields, functions) => functions.in(fields.id, statementIds))
			.build(),
	);
	const payments = await transaction.queryRows(
		transaction.db.sql.public.Transaction.select("amount", "creditCardStatementId")
			.where((fields, functions) => functions.in(fields.creditCardStatementId, statementIds))
			.build(),
	);
	const paidByStatement = getPaidAmountsByStatement(payments);
	for (const statement of statements) {
		const paidInCents = paidByStatement.get(statement.id) ?? 0;
		await transaction.executeStatement(
			transaction.db.sql.public.CreditCardStatement.update({
				isPaid: paidInCents > 0 && paidInCents >= toCents(statement.totalAmount),
				paidAmount: numeric<12, 2>(paidInCents / 100),
				updatedAt: new Date(),
			})
				.where((fields, functions) => functions.eq(fields.id, statement.id))
				.build(),
		);
	}
}
