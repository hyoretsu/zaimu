import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { InstitutionCountriesBody } from "./institution-countries";

describe("institution country currencies", () => {
	test.each([true, false])("accepts closing inclusion %j", creditStatementClosingInclusive => {
		expect(
			Value.Check(InstitutionCountriesBody, {
				accountCurrenciesByCountry: {},
				creditStatementClosingInclusive,
			}),
		).toBe(true);
	});
	test("omission preserves existing closing configuration", () => {
		const body = Value.Default(InstitutionCountriesBody, { accountCurrenciesByCountry: {} });
		expect(body).not.toHaveProperty("creditStatementClosingInclusive");
	});
	test("rejects non-boolean closing configuration", () => {
		expect(
			Value.Check(InstitutionCountriesBody, {
				accountCurrenciesByCountry: {},
				creditStatementClosingInclusive: "true",
			}),
		).toBe(false);
	});
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
	test.each(["", "   ", "x".repeat(101)])("rejects invalid name %j", name => {
		expect(Value.Check(InstitutionCountriesBody, { accountCurrenciesByCountry: {}, name })).toBe(false);
	});
	test("accepts renaming without country suggestions", () => {
		expect(
			Value.Check(InstitutionCountriesBody, { accountCurrenciesByCountry: {}, name: "Banco Inter" }),
		).toBe(true);
	});
	test("allows removing all country suggestions", () => {
		expect(Value.Check(InstitutionCountriesBody, { accountCurrenciesByCountry: {} })).toBe(true);
	});
});
