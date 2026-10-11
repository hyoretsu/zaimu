import { roundMoney, toMinorUnits } from "@zaimu/finance/money";

export function hasPaymentBalance(balance: number, amount: number, currency = "BRL") {
	// Aggregated balances can include yield fractions below the currency's minor unit.
	return (
		toMinorUnits(roundMoney(Math.max(0, balance), currency), currency) >= toMinorUnits(amount, currency, 1)
	);
}

export { calculateStatementBalances as applyStatementCredits } from "@zaimu/finance/credit-card";
