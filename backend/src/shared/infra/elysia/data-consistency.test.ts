import { describe, expect, test } from "bun:test";
import { writeNamespaces } from "./data-consistency";

describe("writeNamespaces", () => {
	test("scopes credit card writes to overview and card statements", () => {
		expect(writeNamespaces("/credit-cards/card-1/purchases")).toEqual([
			"accounts:list",
			"credit-cards:overview",
			"dashboard",
			"transactions:list",
			"credit-cards:card-1:statements",
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

	test("ignores domains without declared cache dependencies", () => {
		expect(writeNamespaces("/auth/sign-in")).toEqual([]);
	});
});
