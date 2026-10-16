import { describe, expect, test } from "bun:test";
import {
	assertImportedPurchaseEdit,
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
	test("concentrates remainder on the first installment when configured", () => {
		const amounts = distributePurchaseCents(21833, 12, undefined, true);
		expect(amounts).toEqual([1824, ...Array<number>(11).fill(1819)]);
		expect(amounts.reduce((total, amount) => total + amount, 0)).toBe(21833);
		expect(distributePurchaseCents(21833, 12)).toEqual([
			...Array<number>(5).fill(1820),
			...Array<number>(7).fill(1819),
		]);
		expect(distributePurchaseCents(1200, 12, undefined, true)).toEqual(Array<number>(12).fill(100));
	});
	test("concentrates only unknown cents and preserves imported installments", () => {
		expect(distributePurchaseCents(21833, 12, new Map([[1, 1819]]), true)).toEqual([
			1819,
			1824,
			...Array<number>(10).fill(1819),
		]);
		expect(distributePurchaseCents(21833, 12, new Map([[2, 1820]]), true)).toEqual([
			1823,
			1820,
			...Array<number>(10).fill(1819),
		]);
		expect(distributePurchaseCents(101, 1, new Map([[1, 101]]), true)).toEqual([101]);
		expect(() => distributePurchaseCents(101, 1, new Map([[1, 100]]), true)).toThrow();
	});
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
	test("inclusive closing keeps purchases on the cutoff, including short months", () => {
		const card = { dueDay: 5, statementClosingInclusive: true, statementDay: 31 };
		expect(purchaseStatementDates(card, "2024-02-29")).toEqual({
			dueDate: "2024-03-05",
			statementDate: "2024-02-29",
		});
		expect(purchaseStatementDates(card, "2024-03-01").statementDate).toBe("2024-03-31");
		expect(purchaseStatementDates({ ...card, statementDay: 15 }, "2024-03-15").statementDate).toBe(
			"2024-03-15",
		);
		expect(purchaseStatementDates({ ...card, statementDay: 15 }, "2024-03-16").statementDate).toBe(
			"2024-04-15",
		);
	});
	test.each([false, true])("cutoff boundaries include short nonleap February (%j)", inclusive => {
		const card = { dueDay: 5, statementClosingInclusive: inclusive, statementDay: 31 };
		expect(purchaseStatementDates(card, "2025-02-27").statementDate).toBe("2025-02-28");
		expect(purchaseStatementDates(card, "2025-02-28").statementDate).toBe(
			inclusive ? "2025-02-28" : "2025-03-31",
		);
		expect(purchaseStatementDates(card, "2025-03-01").statementDate).toBe("2025-03-31");
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

describe("confirmed installment edits", () => {
	test("rejects editing imported installments and changing their plan count", () => {
		expect(() => assertImportedPurchaseEdit(5, [1, 2], { installmentNumber: 2 })).toThrow(
			"Parcelas sincronizadas",
		);
		expect(() => assertImportedPurchaseEdit(5, [1], { installments: 4 })).toThrow(
			"quantidade de parcelas",
		);
	});
	test("allows unchanged count and editing only an unconfirmed installment", () => {
		expect(() => assertImportedPurchaseEdit(5, [1, 2], { installments: 5 })).not.toThrow();
		expect(() => assertImportedPurchaseEdit(5, [1, 2], { installmentNumber: 3 })).not.toThrow();
		expect(() => assertImportedPurchaseEdit(5, [], { installments: 6 })).not.toThrow();
	});
	test("total corrections preserve confirmed cents and use only remaining installments", () => {
		expect(distributePurchaseCents(5684, 5, new Map([[1, 1137]]))).toEqual([
			1137, 1137, 1137, 1137, 1136,
		]);
		const confirmed = new Map([
			[1, 1137],
			[2, 1137],
			[3, 1137],
			[4, 1137],
			[5, 1137],
		]);
		expect(() => distributePurchaseCents(5684, 5, confirmed)).toThrow();
		expect(distributePurchaseCents(5685, 5, confirmed)).toEqual([1137, 1137, 1137, 1137, 1137]);
	});
});
