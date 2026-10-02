interface LegacyRecord {
	ownerKey: string;
	data: {
		[key: string]: unknown;
		id?: string;
		creditCardId?: string;
		creditCardStatementId?: string;
		paymentCreditCardId?: string;
		statementId?: string;
		source?: string;
	};
}

/** Scope is part of the lookup: another user's cached invoice cannot resolve this payment. */
export function migrateLegacyCardPayments<T extends LegacyRecord>(
	payments: T[],
	statements: LegacyRecord[],
): Array<Omit<T, "data"> & LegacyRecord>;
export function migrateLegacyCardPayments(payments: LegacyRecord[], statements: LegacyRecord[]) {
	const cards = new Map(
		statements.map(statement => [
			`${statement.ownerKey}\u0000${statement.data.id}`,
			statement.data.creditCardId,
		]),
	);
	return payments.map(payment => {
		const oldId = payment.data.creditCardStatementId;
		if (!oldId) return payment;
		if (payment.data.source === "CREDIT_CARD") {
			const { creditCardStatementId: _old, ...data } = payment.data;
			return { ...payment, data: { ...data, statementId: data.statementId ?? oldId } };
		}
		const cardId = cards.get(`${payment.ownerKey}\u0000${oldId}`);
		if (!cardId || (payment.data.paymentCreditCardId && payment.data.paymentCreditCardId !== cardId))
			return payment;
		const { creditCardStatementId: _old, ...data } = payment.data;
		return { ...payment, data: { ...data, paymentCreditCardId: cardId } };
	});
}

export function hasUnresolvedLegacyCardPayment(data: object) {
	return "creditCardStatementId" in data && Boolean(data.creditCardStatementId);
}
