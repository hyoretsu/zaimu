import { toMinorUnits } from "@zaimu/finance/money";

export function hasPaymentBalance(balance: number, amount: number, currency = "BRL") {
	return toMinorUnits(Math.max(0, balance), currency) >= toMinorUnits(amount, currency, 1);
}

export { calculateStatementBalances as applyStatementCredits } from "@zaimu/finance/credit-card";
