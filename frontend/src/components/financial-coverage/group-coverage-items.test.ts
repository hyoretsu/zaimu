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
	it("hides manual configurations and retains external coverage sources", () => {
		const groups = groupCoverageItems([
			item("a", "ASSOCIATION", "BR - BRL"),
			item("h", "PROFILE_HISTORY", "Padrão"),
			item("p", "POLICY", "Padrão"),
			item("t", "TAX", "IR"),
			item("c", "CALENDAR", "BR - 2026"),
		]);
		expect(groups.map(group => group.id)).toEqual(["CALENDAR:BR"]);
	});
	it("hides tax versions even when validity dates are registered", () => {
		expect(
			groupCoverageItems([
				{ ...item("tax-v1", "TAX", "IR"), endDate: "2025-12-31", startDate: "2025-01-01", version: "v1" },
				{ ...item("tax-v2", "TAX", "IR"), startDate: "2026-01-01", version: "v2" },
			]),
		).toEqual([]);
	});
});
