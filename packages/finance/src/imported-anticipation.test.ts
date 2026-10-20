import { expect, test } from "bun:test";
import {
	hasCompleteImportedPlan,
	matchingAnticipatedTail,
	withImportedAnticipation,
} from "./imported-anticipation";

test("only a complete positive plan can supply the missing original purchase", () => {
	const complete = withImportedAnticipation("AMAZON", [
		{ amountCents: 2203, number: 1 },
		...Array.from({ length: 7 }, (_, index) => ({ amountCents: 2200, number: index + 2 })),
	]);
	expect(hasCompleteImportedPlan(complete, 8)).toBe(true);
	expect(hasCompleteImportedPlan(complete, 9)).toBe(false);
	expect(hasCompleteImportedPlan(complete, 7)).toBe(false);
	expect(hasCompleteImportedPlan("AMAZON", 8)).toBe(false);
	expect(hasCompleteImportedPlan("AMAZON [[anticipated:1:2203;1:2200]]", 2)).toBe(false);
	expect(hasCompleteImportedPlan("AMAZON [[anticipated:1:2203;2:0]]", 2)).toBe(false);
	expect(hasCompleteImportedPlan("AMAZON [[anticipated:2:2203;3:2200]]", 2)).toBe(false);
});

test("maps anticipated amounts to the final installments, preserving exact rounding", () => {
	const description = withImportedAnticipation(
		"LOJA",
		Array.from({ length: 8 }, (_, i) => ({ amountCents: i === 0 ? 2203 : 2200, number: i + 1 })),
	);
	expect(matchingAnticipatedTail(description, [2200, 2203, ...Array(7).fill(2200)])).toEqual([
		2, 3, 4, 5, 6, 7, 8, 9,
	]);
	expect(matchingAnticipatedTail(description, [2203, ...Array(8).fill(2200)])).toBeUndefined();
});
