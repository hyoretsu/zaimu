import { replaceEntityTags, tagEntityType } from "~/modules/categories/application/tag-assignments";
import { recalculateStatementPayments } from "~/modules/creditCards/application/statement-payments";
import { deleteCreatorDebtEventForTransaction } from "~/modules/debts/application";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { db, executeStatement, queryRows, withTransaction } from "~/shared/infra/sql";

type TransactionLink = "recurrenceId" | "salaryId" | "subscriptionId";

export async function deleteLinkedTransactions(
	link: TransactionLink,
	linkedEntityId: string,
	userId: string,
) {
	const transactions = await queryRows(
		db.sql.public.Transaction.select(
			"id",
			"amount",
			"date",
			"paymentCreditCardId",
			"originFinancialAccountId",
			"destinationFinancialAccountId",
		)
			.where((fields, functions) => {
				if (link === "recurrenceId") return functions.eq(fields.recurrenceId, linkedEntityId);
				if (link === "salaryId") return functions.eq(fields.salaryId, linkedEntityId);
				return functions.eq(fields.subscriptionId, linkedEntityId);
			})
			.build(),
	);

	if (transactions.length === 0) return 0;

	const transactionIds = transactions.map(transaction => transaction.id);
	await Promise.all(
		transactionIds.map(transactionId => deleteCreatorDebtEventForTransaction(transactionId, userId)),
	);
	await replaceEntityTags({ entityIds: transactionIds, entityType: tagEntityType.transaction, tagIds: [] });
	await executeStatement(
		db.sql.public.Transaction.delete()
			.where((fields, functions) => functions.in(fields.id, transactionIds))
			.build(),
	);
	const cards = [
		...new Set(transactions.flatMap(row => (row.paymentCreditCardId ? [row.paymentCreditCardId] : []))),
	];
	if (cards.length) await withTransaction(executor => recalculateStatementPayments(executor, cards));
	for (const row of transactions)
		for (const accountId of [row.originFinancialAccountId, row.destinationFinancialAccountId])
			if (accountId) await enqueueAccountYieldRecalculation(accountId, row.date, "recurrence-deleted");
	return transactionIds.length;
}
