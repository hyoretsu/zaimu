import { describe, expect, test } from "bun:test";
import { groupTransactionsForDisplay } from "./-transaction-display-groups";

describe("groupTransactionsForDisplay", () => {
	test("keeps adjacent hidden transactions in one group", () => {
		const groups = groupTransactionsForDisplay(
			[
				{ date: "2026-09-20", id: "visible", isHidden: false },
				{ date: "2026-09-20", id: "hidden-1", isHidden: true },
				{ date: "2026-09-20", id: "hidden-2", isHidden: true },
			],
			"2026-09-20",
		);

		expect(groups.map(group => [group.kind, group.transactions.map(transaction => transaction.id)])).toEqual([
			["visible", ["visible"]],
			["hidden", ["hidden-1", "hidden-2"]],
		]);
	});

	test("splits hidden groups around visible transactions", () => {
		const groups = groupTransactionsForDisplay(
			[
				{ date: "2026-09-20", id: "hidden-before", isHidden: true },
				{ date: "2026-09-20", id: "visible", isHidden: false },
				{ date: "2026-09-20", id: "hidden-after", isHidden: true },
			],
			"2026-09-20",
		);

		expect(groups.map(group => [group.kind, group.transactions.map(transaction => transaction.id)])).toEqual([
			["hidden", ["hidden-before"]],
			["visible", ["visible"]],
			["hidden", ["hidden-after"]],
		]);
	});

	test("groups future transactions even when they are visible", () => {
		const groups = groupTransactionsForDisplay(
			[
				{ date: "2026-09-21", id: "future-visible", isHidden: false },
				{ date: "2026-09-21", id: "future-hidden", isHidden: true },
			],
			"2026-09-20",
		);

		expect(groups.map(group => [group.kind, group.transactions.map(transaction => transaction.id)])).toEqual([
			["future", ["future-visible", "future-hidden"]],
		]);
	});

	test("keeps today's visible transactions expanded", () => {
		const groups = groupTransactionsForDisplay(
			[{ date: "2026-09-20T23:59:59.000Z", id: "today", isHidden: false }],
			"2026-09-20",
		);

		expect(groups[0]?.kind).toBe("visible");
	});
});
