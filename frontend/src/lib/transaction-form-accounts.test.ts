import { describe, expect, test } from "bun:test";
import { getTransactionFormAccounts } from "./transaction-form-accounts";

describe("transaction form account selection", () => {
	test("keeps the account through repeated expense and income switches", () => {
		const expense = {
			destinationFinancialAccountId: "",
			originFinancialAccountId: "account",
			type: "EXPENSE",
		};
		const income = { ...getTransactionFormAccounts(expense, "INCOME"), type: "INCOME" };
		expect(income.destinationFinancialAccountId).toBe("account");
		expect(income.originFinancialAccountId).toBe("");
		expect(getTransactionFormAccounts(income, "EXPENSE")).toEqual({
			destinationFinancialAccountId: "",
			originFinancialAccountId: "account",
		});
		expect(getTransactionFormAccounts(income, "YIELD").destinationFinancialAccountId).toBe("account");
	});
	test("keeps distinct transfer accounts and avoids transferring to the same account", () => {
		expect(
			getTransactionFormAccounts(
				{ destinationFinancialAccountId: "b", originFinancialAccountId: "a", type: "TRANSFER" },
				"TRANSFER",
			),
		).toEqual({ destinationFinancialAccountId: "b", originFinancialAccountId: "a" });
		expect(
			getTransactionFormAccounts({ destinationFinancialAccountId: "a", type: "INCOME" }, "TRANSFER"),
		).toEqual({ destinationFinancialAccountId: "a", originFinancialAccountId: "" });
		expect(
			getTransactionFormAccounts({ originFinancialAccountId: "a", type: "EXPENSE" }, "TRANSFER"),
		).toEqual({ destinationFinancialAccountId: "", originFinancialAccountId: "a" });
	});
	test("uses the matching transfer side when switching to income or expense", () => {
		const transfer = { destinationFinancialAccountId: "b", originFinancialAccountId: "a", type: "TRANSFER" };
		expect(getTransactionFormAccounts(transfer, "INCOME")).toEqual({
			destinationFinancialAccountId: "b",
			originFinancialAccountId: "",
		});
		expect(getTransactionFormAccounts(transfer, "EXPENSE")).toEqual({
			destinationFinancialAccountId: "",
			originFinancialAccountId: "a",
		});
	});
});
