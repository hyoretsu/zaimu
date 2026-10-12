import { describe, expect, test } from "bun:test";
import { getYieldSettings, type InstitutionYieldPolicy, type YieldAccount } from "./projected-yield";
import { countryHolidayDates } from "./yield-calendar";

const standard: InstitutionYieldPolicy = {
	countryCode: "BR",
	currency: "BRL",
	effectiveDate: "2026-01-01",
	profileId: "standard",
	rules: [{ yieldReferencePercentage: 105, yieldReferenceType: "CDI" }],
};
const plus: InstitutionYieldPolicy = {
	...standard,
	profileId: "plus",
	rules: [{ yieldReferencePercentage: 120, yieldReferenceType: "CDI" }],
};
const account: YieldAccount = {
	countryCode: "BR",
	createdAt: "2026-01-01",
	currency: "BRL",
	defaultInstitutionProfileId: "standard",
	id: "a",
	institutionProfileChanges: [
		{ effectiveDate: "2026-03-01", profileId: "plus" },
		{ effectiveDate: "2026-04-01", profileId: "standard" },
	],
	institutionYieldPolicies: [standard, plus],
	type: "CHECKING",
};

describe("institution profile policy coverage", () => {
	test("default before first change, plus during March, standard from April without implicit expiry", () => {
		expect(getYieldSettings(account, "2026-02-28")).toBe(standard);
		expect(getYieldSettings(account, "2026-03-01")).toBe(plus);
		expect(getYieldSettings(account, "2026-04-01")).toBe(standard);
		expect(getYieldSettings(account, "2027-04-01")).toBe(standard);
	});
	test("same link selections apply independently to every account", () => {
		expect(getYieldSettings({ ...account, id: "b" }, "2026-03-10")).toBe(plus);
	});
	test("country and currency gaps remain uncovered", () => {
		expect(getYieldSettings({ ...account, countryCode: "US" }, "2026-03-10")).toBeUndefined();
		expect(getYieldSettings({ ...account, currency: "USD" }, "2026-03-10")).toBeUndefined();
	});
	test("pending policies cannot affect approved coverage", () => {
		expect(
			getYieldSettings(
				{ ...account, institutionYieldPolicies: [standard, { ...plus, status: "PENDING" }] },
				"2026-03-10",
			),
		).toBeUndefined();
	});
	test("explicit zero account adjustment takes priority", () => {
		expect(
			getYieldSettings({ ...account, yieldFixedRate: 0, yieldPeriod: "YEARLY" }, "2026-03-10"),
		).toMatchObject({ yieldFixedRate: 0 });
	});
	test("retroactive personal histories keep priority over institutional revision", () => {
		const history = {
			effectiveDate: "2026-03-03",
			yieldReferencePercentage: 115,
			yieldReferenceType: "CDI" as const,
		};
		expect(getYieldSettings({ ...account, yieldRateHistories: [history] }, "2026-03-04")).toBe(history);
	});
	test("exclusive coverage end prevents stale rules", () => {
		expect(
			getYieldSettings(
				{ ...account, institutionYieldPolicies: [{ ...plus, effectiveUntil: "2026-03-10" }] },
				"2026-03-10",
			),
		).toBeUndefined();
	});
	test("merged private policies survive until explicit global adoption", () => {
		const legacy = {
			...plus,
			profileId: null,
			rules: [{ yieldReferencePercentage: 112, yieldReferenceType: "CDI" as const }],
		};
		const merged = {
			...account,
			globalRulesFrom: "2026-03-15",
			legacyInstitutionYieldPolicies: [legacy],
		};
		expect(getYieldSettings(merged, "2026-03-10")).toBe(legacy);
		expect(getYieldSettings(merged, "2026-03-15")).toBe(plus);
		expect(getYieldSettings({ ...merged, globalRulesFrom: null }, "2027-04-01")).toBe(legacy);
	});
	test("legacy links with no adoption cannot receive approved global rules retroactively", () => {
		expect(getYieldSettings({ ...account, globalRulesFrom: null }, "2026-03-10")).toBeUndefined();
		const legacy = { ...plus, profileId: null };
		expect(
			getYieldSettings(
				{ ...account, globalRulesFrom: null, institutionYieldPolicies: [legacy, plus] },
				"2026-03-10",
			),
		).toBe(legacy);
	});
	test("global adoption begins at explicit date", () => {
		expect(getYieldSettings({ ...account, globalRulesFrom: "2026-03-15" }, "2026-03-10")).toBeUndefined();
		expect(getYieldSettings({ ...account, globalRulesFrom: "2026-03-15" }, "2026-03-15")).toBe(plus);
	});
	test("country-specific policy wins over general policy", () => {
		const global = { ...plus, countryCode: null, effectiveDate: "2026-03-09" };
		expect(getYieldSettings({ ...account, institutionYieldPolicies: [global, plus] }, "2026-03-10")).toBe(
			plus,
		);
	});
	test("holidays follow account country even for same currency", () => {
		const countries = [
			{
				code: "BR",
				currencies: ["USD"],
				holidays: [{ date: "2026-04-21", id: "br", name: "BR" }],
				name: "Brazil",
			},
			{
				code: "US",
				currencies: ["USD"],
				holidays: [{ date: "2026-07-04", id: "us", name: "US" }],
				name: "US",
			},
		];
		expect([...countryHolidayDates(countries, "US")]).toEqual(["2026-07-04"]);
		expect([...countryHolidayDates(countries, "ZZ")]).toEqual([]);
	});
});
