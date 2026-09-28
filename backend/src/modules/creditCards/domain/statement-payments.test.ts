import { expect, test } from "bun:test";
import { applyStatementCredits } from "./statement-balance";
import { getPaidAmountsByStatement } from "./statement-payments";

test("counts all linked payments in cents, including imported payments", () => {
	const amounts = getPaidAmountsByStatement([
		{ amount: "114.12", creditCardStatementId: "august" },
		{ amount: "114.12", creditCardStatementId: "august" },
		{ amount: "247.06", creditCardStatementId: "august" },
		{ amount: "100", creditCardStatementId: "september" },
		{ amount: "999", creditCardStatementId: null },
	]);
	expect(amounts.get("august")).toBe(47530);
	expect(amounts.get("september")).toBe(10000);
	const [statement] = applyStatementCredits([
		{
			id: "august",
			isPaid: false,
			paidAmount: amounts.get("august")! / 100,
			statementDate: new Date("2026-08-15"),
			totalAmount: 333.15,
		},
	]);
	expect(statement).toMatchObject({ balanceAmount: 0, isPaid: true });
});
