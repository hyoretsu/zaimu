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

test("prefers the approved two-installment plan over a refinancing suggestion", () => {
	const approved = { id: "approved-2x", installments: 2 };
	const other = { id: "other-12x", installments: 12 };
	expect(
		uniquePurchaseMatches(
			new Map([["november", [other, approved]]]),
			(_itemId, candidate) => candidate.installments === 2,
		),
	).toEqual([["november", approved]]);
});

test("does not choose between two exact plans or competing claims", () => {
	const a = { id: "a", installments: 2 };
	const b = { id: "b", installments: 2 };
	const prefer = (_itemId: string, candidate: typeof a) => candidate.installments === 2;
	expect(uniquePurchaseMatches(new Map([["november", [a, b]]]), prefer)).toEqual([]);
	expect(
		uniquePurchaseMatches(
			new Map([
				["november", [a]],
				["duplicate", [a]],
			]),
			prefer,
		),
	).toEqual([]);
});

test("prefers the same day over adjacent dates regardless of candidate order", () => {
	const exact = { date: "2026-04-26", id: "exact" };
	const adjacent = { date: "2026-04-25", id: "adjacent" };
	const sameDay = (_itemId: string, candidate: typeof exact) => candidate.date === "2026-04-26";
	expect(uniquePurchaseMatches(new Map([["item", [adjacent, exact]]]), () => true, sameDay)).toEqual([
		["item", exact],
	]);
	expect(uniquePurchaseMatches(new Map([["item", [adjacent]]]), () => true, sameDay)).toEqual([
		["item", adjacent],
	]);
	expect(
		uniquePurchaseMatches(new Map([["item", [adjacent, { ...adjacent, id: "other" }]]]), () => true, sameDay),
	).toEqual([]);
});
