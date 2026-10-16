import { describe, expect, test } from "bun:test";
import {
	cardRuleValues,
	defaultCardRules,
	type InstitutionCardRules,
	resolveInstitutionCardRules,
} from "./institution-card-rules";

const cashback: InstitutionCardRules = {
	cashback: {
		conversionAmount: null,
		conversionPoints: null,
		kind: "CASHBACK",
		rate: 1.5,
		yieldPeriod: "YEARLY",
		yieldReferencePercentage: 100,
		yieldReferenceRate: 10,
	},
	workingDueDate: true,
};
const institution = { creditCardRules: cashback };
describe("institution card benefit inheritance", () => {
	test("unconfigured institutions grant no benefits", () => {
		expect(resolveInstitutionCardRules(null)).toEqual(defaultCardRules);
	});
	test("all cards inherit institution defaults when profile inherits", () => {
		expect(
			resolveInstitutionCardRules(institution, [
				{ creditCardRules: null, id: "base", isDefault: true },
			]),
		).toEqual(cashback);
	});
	test("profile can unlock cashback while base cards have none", () => {
		const profiles = [
			{ creditCardRules: null, id: "base", isDefault: true },
			{ creditCardRules: cashback, id: "premium", isDefault: false },
		];
		const changes = [{ effectiveDate: "2026-10-20", profileId: "premium" }];
		expect(resolveInstitutionCardRules(null, profiles, changes, "2026-10-19")).toEqual(defaultCardRules);
		expect(resolveInstitutionCardRules(null, profiles, changes, "2026-10-20")).toEqual(cashback);
	});
	test("profile can explicitly turn off institutional cashback", () => {
		expect(
			resolveInstitutionCardRules(institution, [
				{ creditCardRules: defaultCardRules, id: "base", isDefault: true },
			]),
		).toEqual(defaultCardRules);
	});
	test("unsorted history and downgrade use latest applicable date without changing past rules", () => {
		const profiles = [
			{ creditCardRules: null, id: "base", isDefault: true },
			{ creditCardRules: cashback, id: "premium", isDefault: false },
		];
		const history = [
			{ effectiveDate: "2026-11-01", profileId: "base" },
			{ effectiveDate: "2026-10-01", profileId: "premium" },
		];
		expect(resolveInstitutionCardRules(null, profiles, history, "2026-10-31")).toEqual(cashback);
		expect(resolveInstitutionCardRules(null, profiles, history, "2026-11-01")).toEqual(defaultCardRules);
	});
	test("all yield fields derive from the same rule", () => {
		expect(cardRuleValues(cashback)).toEqual({
			cashbackRate: 1.5,
			cashbackYieldPeriod: "YEARLY",
			cashbackYieldReferencePercentage: 100,
			cashbackYieldReferenceRate: 10,
			workingDueDate: true,
		});
	});
});
