import { describe, expect, test } from "bun:test";
import { debtResourceId, writeNamespaces } from "./data-consistency";

describe("writeNamespaces", () => {
	test("scopes credit card writes to overview and card statements", () => {
		expect(writeNamespaces("/credit-cards/card-1/purchases")).toEqual([
			"accounts:list",
			"credit-cards:overview",
			"debts:events",
			"debts:overview",
			"dashboard",
			"transactions:list",
			"credit-cards:card-1:statements",
			"transactions:detail",
		]);
	});

	test("covers every scheduled and shared financial domain", () => {
		for (const path of [
			"/categories",
			"/debts/events",
			"/financial-account-yield-holidays",
			"/financial-account-yields",
			"/financial-institutions",
			"/loans",
			"/recurring",
			"/salaries",
			"/stores",
			"/subscriptions",
			"/sync",
		])
			expect(writeNamespaces(path).length).toBeGreaterThan(0);
	});

	test("includes import summary and detail generations", () => {
		expect(writeNamespaces("/transaction-imports/import-1/items/item-1/approve")).toContain(
			"imports:detail:import-1",
		);
	});

	test("fences every debt cache before a shared mutation", () => {
		expect(writeNamespaces("/debts/events/event-1")).toEqual([
			"debts:events",
			"debts:invitations",
			"debts:overview",
			"dashboard",
			"transactions:list",
			"transactions:detail",
		]);
	});

	test("refund import writes invalidate rewards, debts and consumption", () => {
		const namespaces = writeNamespaces("/credit-card-imports/import-1/items/item-1/approve-refund");
		for (const namespace of [
			"accounts:list",
			"debts:events",
			"debts:overview",
			"dashboard",
			"transactions:list",
		] as const)
			expect(namespaces).toContain(namespace);
	});

	test("ignores domains without declared cache dependencies", () => {
		expect(writeNamespaces("/auth/sign-in")).toEqual([]);
	});
});

describe("debtResourceId", () => {
	test("extracts shared debt resources for pre-mutation invalidation", () => {
		expect(debtResourceId("/debts/events/event-1")).toBe("event-1");
		expect(debtResourceId("/debts/people/person-1/invite")).toBe("person-1");
		expect(debtResourceId("/debts/events")).toBeUndefined();
	});
});
