import { describe, expect, test } from "bun:test";
import { assertFinancialAccountYieldSettings } from "./assert-financial-account-yield-settings";

describe("assertFinancialAccountYieldSettings", () => {
	test("accepts a complete positive yield setting", () => {
		expect(() =>
			assertFinancialAccountYieldSettings({ type: "SAVINGS", yieldFixedRate: 0.95, yieldPeriod: "MONTHLY" }),
		).not.toThrow();
	});

	test("accepts reference and mixed yield settings", () => {
		expect(() =>
			assertFinancialAccountYieldSettings({
				type: "SAVINGS",
				yieldReferencePercentage: 105,
				yieldReferenceType: "CDI",
			}),
		).not.toThrow();
		expect(() =>
			assertFinancialAccountYieldSettings({
				type: "INVESTMENT",
				yieldFixedRate: 0.5,
				yieldPeriod: "YEARLY",
				yieldReferencePercentage: 105,
				yieldReferenceType: "SELIC",
			}),
		).not.toThrow();
	});

	test("rejects incomplete reference settings", () => {
		expect(() =>
			assertFinancialAccountYieldSettings({
				type: "SAVINGS",
				yieldReferenceType: "CDI",
			}),
		).toThrow("Informe a taxa de referência e o percentual juntos");
	});

	test("rejects credit-card yield", () => {
		expect(() =>
			assertFinancialAccountYieldSettings({ type: "CREDIT_CARD", yieldFixedRate: 12, yieldPeriod: "YEARLY" }),
		).toThrow("Cartão de crédito não pode ter rendimento");
	});

	test("accepts an optional tax rate and rejects it without yield or outside its range", () => {
		expect(() =>
			assertFinancialAccountYieldSettings({
				type: "SAVINGS",
				yieldFixedRate: 10,
				yieldPeriod: "YEARLY",
				yieldTaxRate: 15,
			}),
		).not.toThrow();
		expect(() => assertFinancialAccountYieldSettings({ type: "SAVINGS", yieldTaxRate: 15 })).toThrow(
			"Informe a alíquota de imposto junto com as taxas do rendimento",
		);
		expect(() =>
			assertFinancialAccountYieldSettings({
				type: "SAVINGS",
				yieldFixedRate: 10,
				yieldPeriod: "YEARLY",
				yieldTaxRate: 100.01,
			}),
		).toThrow("A alíquota de imposto deve estar entre 0% e 100%");
	});
});
