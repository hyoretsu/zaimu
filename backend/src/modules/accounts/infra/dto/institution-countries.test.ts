import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { InstitutionCountriesBody } from "./institution-countries";

describe("institution countries", () => {
	test.each([true, false])("accepts closing inclusion %j", creditStatementClosingInclusive => {
		expect(
			Value.Check(InstitutionCountriesBody, {
				creditStatementClosingInclusive,
				operatingCountryCodes: [],
			}),
		).toBe(true);
	});
	test("omission preserves existing closing configuration", () => {
		const body = Value.Default(InstitutionCountriesBody, { operatingCountryCodes: [] });
		expect(body).not.toHaveProperty("creditStatementClosingInclusive");
	});
	test("rejects non-boolean closing configuration", () => {
		expect(
			Value.Check(InstitutionCountriesBody, {
				creditStatementClosingInclusive: "true",
				operatingCountryCodes: [],
			}),
		).toBe(false);
	});
	test("accepts countries without currency restrictions", () => {
		expect(
			Value.Check(InstitutionCountriesBody, {
				operatingCountryCodes: ["BR", "US"],
			}),
		).toBe(true);
	});
	test.each([["BR", "BR"], ["BRA"], ["br"]])(
		"rejects invalid country list %j",
		(...operatingCountryCodes) => {
			expect(Value.Check(InstitutionCountriesBody, { operatingCountryCodes })).toBe(false);
		},
	);
	test.each(["", "   ", "x".repeat(101)])("rejects invalid name %j", name => {
		expect(Value.Check(InstitutionCountriesBody, { name, operatingCountryCodes: [] })).toBe(false);
	});
	test("accepts renaming without country suggestions", () => {
		expect(
			Value.Check(InstitutionCountriesBody, { name: "Banco Inter", operatingCountryCodes: [] }),
		).toBe(true);
	});
	test("allows removing all country suggestions", () => {
		expect(Value.Check(InstitutionCountriesBody, { operatingCountryCodes: [] })).toBe(true);
	});
});
