import { describe, expect, test } from "bun:test";
import { bankDate, bankTime, classifyOperation, exactMatch, normalizeTransaction } from "./normalize";

const tx = {
	accountId: "account",
	amount: 100,
	date: "2026-01-15T00:00:00.000Z",
	description: " Café   Central ",
	id: "pluggy-1",
	providerId: "bank-1",
};
describe("bank adapters", () => {
	test("preserves banking date without manufacturing midnight", () => {
		const normalized = normalizeTransaction(tx, false);
		expect(normalized.date).toBe("2026-01-15");
		expect(normalized.time).toBeNull();
		expect(bankDate("2026-01-15T23:00:00-03:00")).toBe("2026-01-15");
		expect(() => bankDate("2026-02-30")).toThrow();
		expect(bankTime("25:00")).toBeNull();
	});
	test("prefers provider identity and preserves Pluggy alias", () => {
		expect(normalizeTransaction(tx, false).aliases).toEqual(["provider:bank-1", "pluggy:pluggy-1"]);
	});
	test("normalizes description but requires exact amount and real times", () => {
		const a = normalizeTransaction(tx, false);
		expect(exactMatch(a, { ...a, description: "cafe central", time: "12:00:00" })).toBe(true);
		expect(exactMatch({ ...a, time: "12:01:00" }, { ...a, time: "12:00:00" })).toBe(false);
		expect(exactMatch(a, { ...a, amount: 100.01 })).toBe(false);
	});
	test("does not guess installment total or calendar", () => {
		const result = normalizeTransaction(
			{ ...tx, creditCardMetadata: { installmentNumber: 2, totalInstallments: 3 } },
			true,
		);
		expect(result.totalAmount).toBeNull();
		expect(result.incomplete).toEqual(["calendar", "total", "purchaseDate"]);
	});
	test("separates payments refunds fees and pending", () => {
		expect(classifyOperation({ ...tx, amount: -100, description: "Pagamento da fatura" }, true)).toBe(
			"PAYMENT",
		);
		expect(classifyOperation({ ...tx, amount: -100, operationType: "CREDIT_CARD_PAYMENT" }, false)).toBe(
			"PAYMENT",
		);
		expect(classifyOperation({ ...tx, amount: -100 }, true)).toBe("REFUND");
		expect(classifyOperation({ ...tx, operationType: "INTEREST" }, true)).toBe("CHARGE");
		expect(normalizeTransaction({ ...tx, status: "PENDING" }, false).pending).toBe(true);
	});
});
