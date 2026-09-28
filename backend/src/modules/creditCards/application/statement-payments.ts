import {
	calculateStatementBalances,
	currentDateKey,
	type FinancialDate,
	type StatementInput,
	statementCharges,
	statementCycles,
	toCents,
} from "@zaimu/finance/credit-card";
import { db, numeric, queryRows, type SqlExecutor } from "~/shared/infra/sql";

export async function withStatementPayments<T extends StatementInput & { creditCardId: string }>(
	statements: T[],
	executor?: SqlExecutor,
	asOf: FinancialDate = currentDateKey(),
) {
	if (!statements.length) return calculateStatementBalances(statements, [], asOf);
	const sql = executor?.db ?? db;
	const rows = executor?.queryRows ?? queryRows;
	const ids = [...new Set(statements.map(s => s.creditCardId))];
	const [payments, cards, charges] = await Promise.all([
		rows(
			sql.sql.public.Transaction.select("amount", "date", "paymentCreditCardId")
				.where((f, fn) => fn.in(f.paymentCreditCardId, ids))
				.build(),
		),
		rows(
			sql.sql.public.CreditCard.select("id", "statementDay", "dueDay", "ignoreStatementsBefore")
				.where((f, fn) => fn.in(f.id, ids))
				.build(),
		),
		rows(
			sql.sql.public.CreditPurchase.innerJoin(sql.sql.public.CreditCardStatement, (f, fn) =>
				fn.eq(f.CreditPurchase.statementId, f.CreditCardStatement.id),
			)
				.select(f => ({
					currentInstallment: f.CreditPurchase.currentInstallment,
					feeAmount: f.CreditPurchase.feeAmount,
					feeDescription: f.CreditPurchase.feeDescription,
					id: f.CreditPurchase.id,
					installmentAmount: f.CreditPurchase.installmentAmount,
					isSettled: f.CreditPurchase.isSettled,
					isStatementCharge: f.CreditPurchase.isStatementCharge,
					parentId: f.CreditPurchase.parentId,
					refinancingFeeAmount: f.CreditPurchase.refinancingFeeAmount,
					statementId: f.CreditPurchase.statementId,
				}))
				.where((f, fn) => fn.in(f.CreditCardStatement.creditCardId, ids))
				.build(),
		),
	]);
	const chargesByStatement = statementCharges(charges);
	return cards.flatMap(card => {
		const group = statements
			.filter(s => s.creditCardId === card.id)
			.map(s => ({
				...s,
				chargesAmount: (chargesByStatement.get(s.id) ?? 0) / 100,
				totalAmount: (toCents(s.totalAmount) - (chargesByStatement.get(s.id) ?? 0)) / 100,
			}));
		const cardPayments = payments.filter(p => p.paymentCreditCardId === card.id);
		const cycles = statementCycles(
			group,
			card,
			cardPayments,
			dates => ({
				...group[0]!,
				chargesAmount: 0,
				creditCardId: card.id,
				dueDate: new Date(`${dates.dueDate}T12:00:00Z`),
				id: `cycle-${dates.statementDate}`,
				isForecast: false,
				isFullySynced: false,
				isPaid: false,
				paidAmount: 0,
				statementDate: new Date(`${dates.statementDate}T12:00:00Z`),
				totalAmount: 0,
			}),
			asOf,
		);
		return calculateStatementBalances(cycles, cardPayments, asOf, card.ignoreStatementsBefore);
	});
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
		transaction.db.sql.public.CreditCard.select("id", "statementDay", "dueDay", "ignoreStatementsBefore")
			.where((f, fn) => fn.in(f.id, cardIds))
			.build(),
	);
	const payments = await transaction.queryRows(
		transaction.db.sql.public.Transaction.select("paymentCreditCardId", "date", "amount")
			.where((f, fn) => fn.in(f.paymentCreditCardId, cardIds))
			.build(),
	);
	for (const card of cards) {
		const cycles = statementCycles(
			statements.filter(s => s.creditCardId === card.id),
			card,
			payments.filter(p => p.paymentCreditCardId === card.id),
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
		if (statement.id.startsWith("cycle-")) continue;
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
