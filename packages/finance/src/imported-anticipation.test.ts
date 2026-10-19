import { expect, test } from "bun:test";
import { hasCompleteImportedPlan, withImportedAnticipation } from "./imported-anticipation";

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
