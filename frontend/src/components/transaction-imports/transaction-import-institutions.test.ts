import { describe, expect, test } from "bun:test";
import type { FinancialAccount } from "@/lib/api";
import { getSelectableImportAccounts, getTransactionImportProvider } from "./transaction-import-institutions";

describe("statement institution mapping", () => {
	test.each([
		["Banco do Brasil", "BANCO_DO_BRASIL"],
		["Banco Inter", "INTER"],
		["Inter", "INTER"],
		["Mercado Pago", "MERCADO_PAGO"],
		[" NUBANK ", "NUBANK"],
		["PicPay", "PICPAY"],
	] as const)("maps %s to its parser", (name, provider) => {
		expect(getTransactionImportProvider({ id: "catalog-id", name })).toBe(provider);
	});

	test("does not infer support from partial names or missing institutions", () => {
		expect(
			getTransactionImportProvider({ id: "other", name: "Inter Empresas Desconhecido" }),
		).toBeUndefined();
		expect(getTransactionImportProvider(null)).toBeUndefined();
	});
});

describe("statement account institutions", () => {
	const institutions = [
		{ id: "inter", name: "Inter" },
		{ id: "nubank", name: "Nubank" },
	];
	const accounts = [
		{ id: "inter-account", institution: institutions[0], type: "CHECKING" },
		{ id: "nubank-account", institution: institutions[1], type: "CHECKING" },
		{ id: "private-inter", institution: { id: "other-inter", name: "Inter" }, type: "CHECKING" },
		{ id: "card", institution: institutions[0], type: "CREDIT_CARD" },
		{ id: "rewards", institution: institutions[0], type: "REWARDS" },
		{ id: "unbound", institution: null, type: "CHECKING" },
	] as FinancialAccount[];

	test("only offers accounts linked to supported registered institutions", () => {
		expect(getSelectableImportAccounts(accounts, institutions, "").map(account => account.id)).toEqual([
			"inter-account",
			"nubank-account",
		]);
	});
	test("filters by institution identity instead of matching names", () => {
		expect(getSelectableImportAccounts(accounts, institutions, "inter").map(account => account.id)).toEqual([
			"inter-account",
		]);
		expect(getSelectableImportAccounts(accounts, institutions, "missing")).toEqual([]);
	});
	test("waits for the institution catalog", () => {
		expect(getSelectableImportAccounts(accounts, [], "")).toEqual([]);
	});
});
