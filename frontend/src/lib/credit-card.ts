import { paymentStatement, toCents } from "@zaimu/finance/credit-card";
import type { CreditCard, CreditCardStatement } from "./api";
import { getLocalDateKey } from "./date";

export { calculateStatementBalances as applyStatementCredits } from "@zaimu/finance/credit-card";

export function getCreditCardDisplayName(
	card: Pick<CreditCard, "accountName"> & { institutionName?: string | null },
) {
	return card.accountName?.trim() || card.institutionName || "Cartão de crédito";
}

export function getCurrentCreditCardStatement(
	statements: CreditCardStatement[],
	_card: Pick<CreditCard, "statementDay">,
	today = new Date(),
) {
	return paymentStatement(statements, getLocalDateKey(today));
}

export function calculateCreditCardLimit(
	card: Pick<CreditCard, "creditLimit">,
	statements: CreditCardStatement[],
	_today = getLocalDateKey(),
) {
	const activeStatements = statements;
	const netUsedInCents = activeStatements.reduce(
		(total, statement) => total + toCents(statement.balanceAmount),
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
