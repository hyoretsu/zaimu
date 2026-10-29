import { expect, test } from "bun:test";
import type { FinancialInstitutionYieldPolicy } from "@/lib/api";
import { selectEditablePolicy } from "./policy-selection";
const base: FinancialInstitutionYieldPolicy = {
	currency: null,
	effectiveDate: "2026-01-01",
	profileId: "standard",
	rules: [{ yieldFixedRate: 1 }],
	yieldPeriod: "MONTHLY",
};
test("editor isolates exact profile, country and validity", () => {
	const plus = { ...base, profileId: "plus" };
	const br = { ...base, countryCode: "BR" };
	const future = { ...br, effectiveDate: "2026-12-01" };
	const expired = { ...br, effectiveDate: "2026-02-01", effectiveUntil: "2026-03-01" };
	const policies = [base, plus, br, future, expired];
	expect(selectEditablePolicy(policies, "standard", undefined, "2026-04-01", "BRL")).toBe(base);
	expect(selectEditablePolicy(policies, "standard", "BR", "2026-04-01", "BRL")).toBe(br);
	expect(selectEditablePolicy(policies, "plus", "BR", "2026-04-01", "BRL")).toBeUndefined();
	expect(selectEditablePolicy(policies, "plus", undefined, "2026-04-01", "BRL")).toBe(plus);
});
test("editor respects legacy currency but favors universal replacement", () => {
	const legacy = { ...base, currency: "BRL" };
	expect(selectEditablePolicy([legacy], "standard", undefined, "2026-04-01", "USD")).toBeUndefined();
	expect(selectEditablePolicy([base, legacy], "standard", undefined, "2026-04-01", "BRL")).toBe(base);
});
