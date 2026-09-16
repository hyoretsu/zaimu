import type { CreditCard, CreditCardStatement } from "./api";
import { getLocalDateKey } from "./date";

const toCents = (amount: number) => Math.round(amount * 100);

export function applyStatementCredits(
	statements: CreditCardStatement[],
	today = getLocalDateKey(),
): CreditCardStatement[] {
	let carriedCreditInCents = 0;
	const effectiveById = new Map<string, Pick<CreditCardStatement, "balanceAmount" | "isPaid">>();

	const chronologicalStatements = statements.toSorted((left, right) =>
		left.statementDate.localeCompare(right.statementDate),
	);
	for (const statement of chronologicalStatements) {
		const paidAmountInCents = toCents(statement.paidAmount);
		const appliedAmountInCents = paidAmountInCents + carriedCreditInCents;
		const rawBalanceInCents = toCents(statement.totalAmount) - appliedAmountInCents;
		const isClosed = statement.statementDate.slice(0, 10) <= today;
		const balanceAmount = (paidAmountInCents > 0 ? Math.max(0, rawBalanceInCents) : rawBalanceInCents) / 100;
		carriedCreditInCents = Math.max(0, -rawBalanceInCents);
		effectiveById.set(statement.id, {
			balanceAmount,
			isPaid: isClosed && appliedAmountInCents > 0 && rawBalanceInCents <= 0,
		});
	}

	return statements.map(statement => ({ ...statement, ...effectiveById.get(statement.id)! }));
}

export function getCreditCardDisplayName(
	card: Pick<CreditCard, "accountName"> & { institutionName?: string | null },
) {
	return card.accountName?.trim() || card.institutionName || "Cartão de crédito";
}

export function calculateCreditCardLimit(
	card: Pick<CreditCard, "creditLimit">,
	statements: CreditCardStatement[],
	today = getLocalDateKey(),
) {
	const activeStatements = statements.filter(statement => statement.dueDate.slice(0, 10) >= today);
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
