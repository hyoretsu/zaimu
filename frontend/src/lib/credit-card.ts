import type { CreditCard, CreditCardStatement } from "./api";
import { getLocalDateKey } from "./date";

const toCents = (amount: number | string) => Math.round(Number(amount) * 100);

export function applyStatementCredits<
	T extends { id: string; paidAmount: number | string; statementDate: string; totalAmount: number | string },
>(statements: T[]): Array<T & { balanceAmount: number; isPaid: boolean; paidAmount: number }> {
	let credit = statements.reduce((sum, statement) => sum + toCents(statement.paidAmount), 0);
	const effective = new Map<string, { balanceAmount: number; isPaid: boolean; paidAmount: number }>();
	const chronological = statements.toSorted(
		(left, right) => left.statementDate.localeCompare(right.statementDate) || left.id.localeCompare(right.id),
	);
	for (const [index, statement] of chronological.entries()) {
		const total = toCents(statement.totalAmount);
		const applied = Math.min(Math.max(0, total), Math.max(0, credit));
		credit -= applied;
		if (total < 0) credit -= total;
		const remainder = index === chronological.length - 1 ? Math.max(0, credit) : 0;
		const balance = Math.max(0, total - applied) - remainder;
		effective.set(statement.id, {
			balanceAmount: balance / 100,
			isPaid: balance <= 0 && (total !== 0 || applied > 0 || remainder > 0),
			paidAmount: (applied + remainder + Math.min(0, total)) / 100,
		});
	}
	return statements.map(statement => ({ ...statement, ...effective.get(statement.id)! }));
}

export function getCreditCardDisplayName(
	card: Pick<CreditCard, "accountName"> & { institutionName?: string | null },
) {
	return card.accountName?.trim() || card.institutionName || "Cartão de crédito";
}

export function getCurrentCreditCardStatement(
	statements: CreditCardStatement[],
	card: Pick<CreditCard, "statementDay">,
	today = new Date(),
) {
	const statementMonth = new Date(today.getFullYear(), today.getMonth(), 1);
	if (today.getDate() > card.statementDay) statementMonth.setMonth(statementMonth.getMonth() + 1);

	const statementDate = new Date(statementMonth.getFullYear(), statementMonth.getMonth(), card.statementDay);
	const statementDateKey = getLocalDateKey(statementDate);

	return statements.find(statement => statement.statementDate.slice(0, 10) === statementDateKey);
}

export function calculateCreditCardLimit(
	card: Pick<CreditCard, "creditLimit">,
	statements: CreditCardStatement[],
	today = getLocalDateKey(),
) {
	const activeStatements = statements;
	const netUsedInCents = activeStatements.reduce(
		(total, statement) => total + toCents(statement.totalAmount) - toCents(statement.paidAmount),
		0,
	);
	const temporaryCreditInCents = Math.max(0, -netUsedInCents);
	const usedLimitInCents = Math.max(0, netUsedInCents);
	const effectiveLimitInCents = toCents(card.creditLimit) + temporaryCreditInCents;

	return {
		availableLimit: Math.max(0, effectiveLimitInCents - usedLimitInCents) / 100,
		effectiveLimit: effectiveLimitInCents / 100,
		temporaryCredit: temporaryCreditInCents / 100,
		usedLimit: usedLimitInCents / 100,
	};
}
