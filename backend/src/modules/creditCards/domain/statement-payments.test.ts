import { expect, test } from "bun:test";
import { applyStatementCredits } from "./statement-balance";
import { getPaidAmountsByCard } from "./statement-payments";

test("counts all card payments in cents, including imported payments", () => {
	const amounts = getPaidAmountsByCard([
		{ amount: "114.12", paymentCreditCardId: "card" },
		{ amount: "114.12", paymentCreditCardId: "card" },
		{ amount: "247.06", paymentCreditCardId: "card" },
		{ amount: "100", paymentCreditCardId: "other" },
		{ amount: "999", paymentCreditCardId: null },
	]);
	expect(amounts.get("card")).toBe(47530);
	expect(amounts.get("other")).toBe(10000);
	const [statement] = applyStatementCredits([
		{
			id: "card",
			isPaid: false,
			paidAmount: amounts.get("card")! / 100,
			statementDate: new Date("2026-08-15"),
			totalAmount: 333.15,
		},
	]);
	expect(statement).toMatchObject({ balanceAmount: -142.15, isPaid: true });
});
