import { format, startOfDay } from "date-fns";
import {
	getTagsByEntity,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import {
	occurrencesInRange,
	type RecurrenceFrequency,
} from "~/modules/dashboard/application/dashboard-calculations";
import { getDebtSplitInput, linkTransactionToDebt } from "~/modules/debts/application";
import { db, numeric, param, queryFirst, queryRows } from "~/shared/infra/sql";

export async function materializeRecurringTransactions(asOf = new Date()) {
	const today = startOfDay(asOf);
	const recurringPayments = await queryRows(
		db.sql.public.RecurringPayment.select(
			"amount",
			"dayOfMonth",
			"dayOfWeek",
			"endDate",
			"financialAccountId",
			"frequency",
			"id",
			"name",
			"startDate",
			"storeName",
			"userId",
		)
			.where((fields, functions) => functions.eq(fields.isActive, true))
			.build(),
	);
	if (recurringPayments.length === 0) return { payments: 0, transactions: 0, userIds: [] };
	const paymentIds = recurringPayments.map(payment => payment.id);
	const existing = await queryRows(
		db.sql.public.Transaction.select("recurrenceId", "recurrenceOccurrenceDate")
			.where((fields, functions) => functions.in(fields.recurrenceId, paymentIds))
			.build(),
	);
	const existingKeys = new Set(
		existing.flatMap(transaction =>
			transaction.recurrenceId && transaction.recurrenceOccurrenceDate
				? [`${transaction.recurrenceId}:${format(transaction.recurrenceOccurrenceDate, "yyyy-MM-dd")}`]
				: [],
		),
	);
	const tagsByPayment = await getTagsByEntity(tagEntityType.recurringPayment, paymentIds);
	let created = 0;
	for (const payment of recurringPayments) {
		if (!payment.financialAccountId) continue;
		const occurrences = occurrencesInRange({
			dayOfMonth: payment.dayOfMonth,
			dayOfWeek: payment.dayOfWeek,
			endDate: payment.endDate,
			frequency: payment.frequency as RecurrenceFrequency,
			from: payment.startDate,
			startDate: payment.startDate,
			through: today,
		});
		const tagIds = (tagsByPayment.get(payment.id) ?? []).map(tag => tag.id);
		const debtSplit = await getDebtSplitInput({ recurringPaymentId: payment.id });
		for (const occurrence of occurrences) {
			const date = format(occurrence, "yyyy-MM-dd");
			const key = `${payment.id}:${date}`;
			if (existingKeys.has(key)) continue;
			const transaction = await queryFirst(
				db.raw.sql`
					INSERT INTO "Transaction" (
						"amount", "categoryId", "date", "description", "originFinancialAccountId",
						"recurrenceId", "recurrenceOccurrenceDate", "storeName", "time", "type", "userId"
					) VALUES (
						${param(numeric<12, 2>(payment.amount), { codecId: "pg/numeric@1" })},
						${param(tagIds[0] ?? null, { codecId: "sql/varchar@1" })},
						${param(occurrence, { codecId: "pg/date@1" })},
						${param(payment.name, { codecId: "sql/varchar@1" })},
						${param(payment.financialAccountId, { codecId: "sql/varchar@1" })},
						${param(payment.id, { codecId: "sql/varchar@1" })},
						${param(occurrence, { codecId: "pg/date@1" })},
						${param(payment.storeName, { codecId: "sql/varchar@1" })}, NULL,
						${param("EXPENSE", { codecId: "pg/text@1" })}::"TransactionType",
						${param(payment.userId, { codecId: "sql/varchar@1" })}
					) ON CONFLICT ("recurrenceId", "recurrenceOccurrenceDate") DO NOTHING RETURNING "id"
				`
					.returnsRow({ id: db.sql.public.Transaction.columns.id })
					.build(),
			);
			if (!transaction) continue;
			existingKeys.add(key);
			created++;
			await replaceEntityTags({ entityIds: [transaction.id], entityType: tagEntityType.transaction, tagIds });
			await linkTransactionToDebt({
				amount: Number(payment.amount),
				date,
				debtSplit,
				description: payment.name,
				transactionId: transaction.id,
				type: "EXPENSE",
				userId: payment.userId,
			});
		}
	}
	return {
		payments: recurringPayments.length,
		transactions: created,
		userIds: [...new Set(recurringPayments.map(payment => payment.userId))],
	};
}
