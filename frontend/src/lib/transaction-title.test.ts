import { describe, expect, test } from "bun:test";
import { getTransactionTitle } from "./transaction-title";

describe("getTransactionTitle", () => {
	test("uses a non-empty description", () => {
		expect(
			getTransactionTitle({ description: "  Jogos  ", source: "FINANCIAL_ACCOUNT", type: "EXPENSE" }),
		).toBe("Jogos");
	});

	test("uses the store name instead of the default purchase description", () => {
		expect(
			getTransactionTitle({
				description: "Compra",
				source: "CREDIT_CARD",
				storeName: "  Loja AliExpress  ",
				type: "EXPENSE",
			}),
		).toBe("Loja AliExpress");
	});

	test("uses Compra for credit card purchases without a description", () => {
		expect(getTransactionTitle({ source: "CREDIT_CARD", type: "EXPENSE" })).toBe("Compra");
	});

	test("uses the card and statement reference for a statement payment without a description", () => {
		expect(
			getTransactionTitle({
				creditCardName: "Cartão Inter",
				creditCardStatementDate: "2026-09-20",
				creditCardStatementId: "statement-id",
				source: "FINANCIAL_ACCOUNT",
				type: "EXPENSE",
			}),
		).toBe("Fatura Cartão Inter - Set/26");
	});

	test("uses Transferência for transfers without a description", () => {
		expect(getTransactionTitle({ source: "FINANCIAL_ACCOUNT", type: "TRANSFER" })).toBe("Transferência");
	});

	test("uses Transação for account income and expenses without a description", () => {
		expect(getTransactionTitle({ source: "FINANCIAL_ACCOUNT", type: "INCOME" })).toBe("Transação");
		expect(getTransactionTitle({ description: "   ", source: "FINANCIAL_ACCOUNT", type: "EXPENSE" })).toBe(
			"Transação",
		);
	});
});
