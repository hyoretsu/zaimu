import { describe, expect, it } from "bun:test";
import { operationId } from "./operation-id";

describe("OpenAPI operation identifiers", () => {
	it("preserves nested parameter names without punctuation", () => {
		expect(operationId("GET", "/admin/yield-calendar/countries/{countryCode}/coverage/{year}")).toBe(
			"getAdminYieldCalendarCountriesByCountryCodeCoverageByYear",
		);
	});
	it("normalizes root slashes and distinguishes HTTP methods", () => {
		expect(operationId("GET", "/financial-accounts/")).toBe("getFinancialAccounts");
		expect(operationId("POST", "/financial-accounts")).toBe("postFinancialAccounts");
	});
});
