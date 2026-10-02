import { describe, expect, test } from "bun:test";
import {
	assertPurchase,
	type CreditPurchase,
	distributePurchaseCents,
	dueInstallments,
	installmentOccurrenceDate,
	projectInstallments,
	purchaseStatementDates,
} from "./credit-purchase";

const purchase: CreditPurchase = {
	creditCardId: "card",
	description: "Mercado",
	id: "purchase",
	installmentAmountsCents: [10001, 10000, 10000],
	purchaseDate: "2024-01-31",
	storeName: "Loja",
	tagIds: ["tag"],
	totalAmountCents: 30001,
};

describe("normalized purchase installments", () => {
	test("moves a Sunday invoice to Monday without changing its closing date", () => {
		expect(
			purchaseStatementDates({ dueDay: 20, statementDay: 15, workingDueDate: true }, "2026-09-12"),
		).toEqual({
			dueDate: "2026-09-21",
			statementDate: "2026-09-15",
		});
	});
	test("closing dates clamp short months and advance purchases made on closing day", () => {
		expect(purchaseStatementDates({ dueDay: 5, statementDay: 31 }, "2024-09-10")).toEqual({
			dueDate: "2024-10-05",
			statementDate: "2024-09-30",
		});
		expect(purchaseStatementDates({ dueDay: 31, statementDay: 15 }, "2024-02-15")).toEqual({
			dueDate: "2024-03-31",
			statementDate: "2024-03-15",
		});
		expect(purchaseStatementDates({ dueDay: 31, statementDay: 15 }, "2024-02-14")).toEqual({
			dueDate: "2024-02-29",
			statementDate: "2024-02-15",
		});
		expect(purchaseStatementDates({ dueDay: 31, statementDay: 15 }, "2024-02-16")).toEqual({
			dueDate: "2024-03-31",
			statementDate: "2024-03-15",
		});
		expect(purchaseStatementDates({ dueDay: 5, statementDay: 31 }, "2024-02-29")).toEqual({
			dueDate: "2024-04-05",
			statementDate: "2024-03-31",
		});
	});
	test("projects future cycles without persisting them", () => {
		expect(projectInstallments(purchase)).toEqual([
			{ amountCents: 10001, number: 1, occurrenceDate: "2024-01-31", purchaseId: "purchase" },
			{ amountCents: 10000, number: 2, occurrenceDate: "2024-02-29", purchaseId: "purchase" },
			{ amountCents: 10000, number: 3, occurrenceDate: "2024-03-31", purchaseId: "purchase" },
		]);
		expect(dueInstallments(purchase, [], "2024-02-28")).toHaveLength(1);
		expect(dueInstallments(purchase, [], "2024-02-29")).toHaveLength(2);
		expect(
			dueInstallments(
				purchase,
				[
					{
						amountCents: 10001,
						hasImportedAmount: false,
						id: "first",
						number: 1,
						occurrenceDate: "2024-01-31",
						purchaseId: "purchase",
						settledByPurchaseId: null,
						statementId: "january",
					},
				],
				"2024-02-29",
			),
		).toEqual([{ amountCents: 10000, number: 2, occurrenceDate: "2024-02-29", purchaseId: "purchase" }]);
	});

	test("preserves imported amount and divides only unknown cents", () => {
		expect(distributePurchaseCents(30001, 3, new Map([[2, 9000]]))).toEqual([10501, 9000, 10500]);
		expect(() => distributePurchaseCents(200, 3, new Map([[2, 199]]))).toThrow();
		expect(() => assertPurchase({ ...purchase, totalAmountCents: 30000 })).toThrow();
		expect(() => installmentOccurrenceDate("2024-02-30", 1)).toThrow();
	});
});
