import { describe, expect, test } from "bun:test";
import { getTransactionImportProvider } from "./transaction-import-institutions";

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
