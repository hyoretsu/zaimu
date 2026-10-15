import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { InstitutionNameBody } from "./institution-name";

describe("user institution changes", () => {
	test("accepts a name change", () => {
		expect(Value.Check(InstitutionNameBody, { name: "Banco do Brasil" })).toBe(true);
	});
	test.each([
		{ currency: "USD" },
		{ operatingCountryCodes: ["BR"] },
		{ creditInstallmentRemainderOnFirst: true },
		{ creditStatementClosingInclusive: true },
		{ accountCurrenciesByCountry: { BR: ["BRL"] } },
	])("rejects catalog configuration: %j", configuration => {
		expect(Value.Check(InstitutionNameBody, { name: "Banco do Brasil", ...configuration })).toBe(false);
	});
});
