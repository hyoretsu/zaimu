import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { InstitutionCountriesBody } from "./institution-countries";

describe("institution country currencies", () => {
	test("allows distinct account currencies per country", () => {
		expect(
			Value.Check(InstitutionCountriesBody, {
				accountCurrenciesByCountry: { BR: ["BRL", "USD"], US: ["USD"] },
			}),
		).toBe(true);
	});
	test.each([{ BR: [] }, { BR: ["BRL", "BRL"] }, { BRA: ["BRL"] }, { BR: ["real"] }])(
		"rejects invalid mapping %j",
		accountCurrenciesByCountry => {
			expect(Value.Check(InstitutionCountriesBody, { accountCurrenciesByCountry })).toBe(false);
		},
	);
	test("allows removing all country suggestions", () => {
		expect(Value.Check(InstitutionCountriesBody, { accountCurrenciesByCountry: {} })).toBe(true);
	});
});
