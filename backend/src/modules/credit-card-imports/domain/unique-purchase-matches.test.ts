import { expect, test } from "bun:test";
import { uniquePurchaseMatches } from "./unique-purchase-matches";

test("reconciles a single candidate without an external identifier", () => {
	expect(uniquePurchaseMatches(new Map([["item", [{ id: "purchase" }]]]))).toEqual([
		["item", { id: "purchase" }],
	]);
});
test("keeps absent, multiple, pending and competing candidates for review", () => {
	expect(
		uniquePurchaseMatches(
			new Map([
				["none", []],
				["multiple", [{ id: "a" }, { id: "b" }]],
				["competing", [{ id: "a" }]],
				["pending", [{ id: "pending:source" }]],
			]),
		),
	).toEqual([]);
});
