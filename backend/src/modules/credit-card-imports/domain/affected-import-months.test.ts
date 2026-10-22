import { expect, test } from "bun:test";
import { affectedImportMonths } from "./affected-import-months";

test("updates the previous month when approving the second of two installments", () => {
	expect(affectedImportMonths("2025-12-31", [{ currentInstallment: 2, installments: 2 }])).toEqual([
		"2025-11",
		"2025-12",
	]);
});

test("eleventh and fifth installments cover ten previous statements only once", () => {
	expect(
		affectedImportMonths("2025-12-31", [
			{ currentInstallment: 11, installments: 11 },
			{ currentInstallment: 5, installments: 5 },
		]),
	).toEqual([
		"2025-02",
		"2025-03",
		"2025-04",
		"2025-05",
		"2025-06",
		"2025-07",
		"2025-08",
		"2025-09",
		"2025-10",
		"2025-11",
		"2025-12",
	]);
});

test("includes future affected installments and handles year boundaries", () => {
	expect(affectedImportMonths("2026-01-15", [{ currentInstallment: 2, installments: 3 }])).toEqual([
		"2025-12",
		"2026-01",
		"2026-02",
	]);
	expect(affectedImportMonths("2026-01-15", [])).toEqual([]);
});
