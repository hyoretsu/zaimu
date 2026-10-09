import { addMoney, fromMinorUnits, toMinorUnits } from "@zaimu/finance/money";

export function creditLimitOverview(
	creditLimit: number,
	currency: string,
	statements: readonly { balanceAmount: number }[],
) {
	const netUsed = addMoney(
		statements.map(statement => ({ amount: Number(statement.balanceAmount), currency })),
		currency,
	);
	const netUsedUnits = toMinorUnits(netUsed.amount, currency, -Number.MAX_SAFE_INTEGER);
	const temporaryCreditUnits = Math.max(0, -netUsedUnits);
	const usedLimitUnits = Math.max(0, netUsedUnits);
	const effectiveLimitUnits = toMinorUnits(creditLimit, currency) + temporaryCreditUnits;
	return {
		availableLimit: fromMinorUnits(Math.max(0, effectiveLimitUnits - usedLimitUnits), currency),
		effectiveLimit: fromMinorUnits(effectiveLimitUnits, currency),
		temporaryCredit: fromMinorUnits(temporaryCreditUnits, currency),
		usedLimit: fromMinorUnits(usedLimitUnits, currency),
	};
}
