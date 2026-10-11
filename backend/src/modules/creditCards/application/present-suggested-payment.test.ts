import { expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { ConfirmPaymentSuggestionReturn } from "../infra/elysia/PaymentSuggestionsDTO";
import { presentSuggestedPayment } from "./present-suggested-payment";

test("new and replayed payments with nullable descriptions satisfy the response contract", () => {
	for (const date of ["2026-10-13", new Date("2026-10-13T12:00:00Z")]) {
		const transaction = presentSuggestedPayment({
			amount: "2270.29",
			date,
			description: null,
			id: "payment",
			originFinancialAccountId: "account",
			paymentCreditCardId: "card",
			type: "EXPENSE",
		});
		expect(transaction.description).toBeNull();
		expect(transaction.amount).toBe(2270.29);
		expect(transaction.date).toBe("2026-10-13");
		expect(Value.Check(ConfirmPaymentSuggestionReturn, { transaction })).toBe(true);
		expect(presentSuggestedPayment({ ...transaction, description: "Pagamento" }).description).toBe(
			"Pagamento",
		);
	}
});
