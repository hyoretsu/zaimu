import { type CreditBook, replayCreditBook } from "./credit-book";
/** Settle each projected due date in a temporary ledger before inspecting the next cycle. */
export function forecastCardPayments(book: CreditBook, from: string, through: string) {
	const temporary = { ...book, payments: [...book.payments] };
	const attributed = recurringCardPaymentAmounts(book);
	const recurringBook = recurringOnlyBook(
		book,
		book.payments.map(payment => ({ ...payment, amount: attributed.get(payment.id) ?? 0 })),
	);
	const dates = [
		...new Set(
			replayCreditBook(temporary, from).statements.map(statement => statement.dueDate.slice(0, 10)),
		),
	]
		.filter(date => date >= from && date <= through)
		.sort();
	return dates.flatMap(date => {
		const statements = replayCreditBook(temporary, date).statements.filter(
			statement => statement.dueDate.slice(0, 10) === date,
		);
		const recurringStatements = new Map(
			replayCreditBook(recurringBook, date).statements.map(statement => [statement.id, statement]),
		);
		return statements.flatMap(statement => {
			const amount = Math.max(0, statement.balanceAmount);
			if (!amount) return [];
			const recurringAmount = Math.min(
				amount,
				Math.max(0, recurringStatements.get(statement.id)?.balanceAmount ?? 0),
			);
			const id = `forecast-settlement:${statement.id}:${date}`;
			temporary.payments.push({ amount, date, id });
			recurringBook.payments.push({ amount: recurringAmount, date, id });
			return [{ ...statement, balanceAmount: amount, recurringAmount }];
		});
	});
}
/** Unrestricted payments share the remaining recurring composition proportionally. */
export function recurringCardPaymentAmounts(book: CreditBook) {
	const replay = { ...book, payments: [] as CreditBook["payments"] };
	const recurringBook = recurringOnlyBook(book, []);
	const result = new Map<string, number>();
	for (const payment of book.payments.toSorted(
		(a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
	)) {
		let remaining = payment.amount;
		let recurringAmount = 0;
		const statements = replayCreditBook(replay, payment.date)
			.statements.filter(
				statement =>
					statement.statementDate.slice(0, 10) <= payment.date && statement.balanceAmount > 0,
			)
			.toSorted((a, b) => a.statementDate.localeCompare(b.statementDate));
		const recurringStatements = new Map(
			replayCreditBook(recurringBook, payment.date).statements.map(statement => [
				statement.id,
				statement,
			]),
		);
		for (const statement of statements) {
			const amount = Math.min(remaining, statement.balanceAmount);
			const recurringBalance = Math.max(0, recurringStatements.get(statement.id)?.balanceAmount ?? 0);
			recurringAmount += amount * Math.min(1, recurringBalance / statement.balanceAmount);
			remaining -= amount;
			if (remaining <= 0) break;
		}
		result.set(payment.id, Math.min(payment.amount, recurringAmount));
		replay.payments.push(payment);
		recurringBook.payments.push({ ...payment, amount: recurringAmount });
	}
	return result;
}
function recurringOnlyBook(book: CreditBook, payments: CreditBook["payments"]): CreditBook {
	const purchaseIds = new Set(
		book.purchases.filter(purchase => purchase.recurrenceId).map(purchase => purchase.id),
	);
	return {
		...book,
		charges: [],
		installments: book.installments.filter(installment => purchaseIds.has(installment.purchaseId)),
		payments,
		purchases: book.purchases.filter(purchase => purchaseIds.has(purchase.id)),
		refunds: book.refunds.filter(refund => purchaseIds.has(refund.purchaseId)),
		statements: book.statements.map(statement => ({
			...statement,
			isPaid: false,
			paidAmount: 0,
			totalAmount: 0,
		})),
	};
}
