import { describe, expect, it } from "bun:test";
import { groupCoverageItems } from "./group-coverage-items";
import type { CoverageItem } from "./types";

const item = (id: string, kind: string, name: string): CoverageItem => ({
	affectedAccountIds: [],
	countryCode: "BR",
	endDate: null,
	gaps: [],
	id,
	kind,
	name,
	source: "test",
	startDate: null,
	status: "COMPLETE",
	version: null,
});

describe("groupCoverageItems", () => {
	it("groups calendar years by country and preserves individual years", () => {
		const groups = groupCoverageItems([
			item("2025", "CALENDAR", "BR - 2025"),
			item("2026", "CALENDAR", "BR - 2026"),
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0].items.map(row => row.id)).toEqual(["2025", "2026"]);
	});
	it("hides profile history, policy and CLDR associations, retaining other sources", () => {
		const groups = groupCoverageItems([
			item("a", "ASSOCIATION", "BR - BRL"),
			item("h", "PROFILE_HISTORY", "Padrão"),
			item("p", "POLICY", "Padrão"),
			item("t", "TAX", "IR"),
		]);
		expect(groups.map(group => group.id)).toEqual(["t"]);
	});
});
