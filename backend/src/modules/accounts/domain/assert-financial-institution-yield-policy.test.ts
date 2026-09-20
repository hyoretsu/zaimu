import { describe, expect, test } from "bun:test";
import { assertFinancialInstitutionYieldPolicy } from "./assert-financial-institution-yield-policy";

describe("assertFinancialInstitutionYieldPolicy", () => {
	test("accepts increasing brackets ending without a limit", () => {
		expect(() =>
			assertFinancialInstitutionYieldPolicy({
				rules: [
					{ upToBalance: 10_000, yieldFixedRate: 1 },
					{ upToBalance: null, yieldFixedRate: 0.5 },
				],
				yieldPeriod: "MONTHLY",
				yieldTaxRate: 15,
			}),
		).not.toThrow();
	});

	test("rejects a limited final bracket", () => {
		expect(() =>
			assertFinancialInstitutionYieldPolicy({
				rules: [{ upToBalance: 10_000, yieldFixedRate: 1 }],
				yieldPeriod: "MONTHLY",
			}),
		).toThrow("última faixa");
	});
});
