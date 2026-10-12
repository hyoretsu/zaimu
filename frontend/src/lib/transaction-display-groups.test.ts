import { describe, expect, test } from "bun:test";
import { groupTransactionsForDisplay, sumYieldsByCurrency } from "./transaction-display-groups";

describe("groupTransactionsForDisplay", () => {
	test("collects yields from different accounts at the top of the day", () => {
		const groups = groupTransactionsForDisplay(
			[
				{ date: "2026-09-20", id: "expense", kind: "transaction" as const },
				{ date: "2026-09-20", id: "account-yield", kind: "yield" as const },
				{ date: "2026-09-20", id: "income", kind: "transaction" as const },
				{ date: "2026-09-20", id: "savings-yield", isHidden: true, kind: "yield" as const },
			],
			"2026-09-20",
		);

		expect(groups.map(group => [group.kind, group.transactions.map(entry => entry.id)])).toEqual([
			["yield", ["account-yield", "savings-yield"]],
			["visible", ["expense", "income"]],
		]);
		expect(groups[0]?.id).toBe("yield-2026-09-20");
	});

	test("gives yield-only days a collapsible group, including future dates", () => {
		const groups = groupTransactionsForDisplay(
			[{ date: "2026-09-21", id: "yield", kind: "yield" }],
			"2026-09-20",
		);

		expect(groups[0]?.kind).toBe("yield");
	});

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

describe("sumYieldsByCurrency", () => {
	test("sums yields without mixing currencies and defaults to BRL", () => {
		expect(
			sumYieldsByCurrency([
				{ amount: 0.35 },
				{ amount: 1.65, currency: "BRL" },
				{ amount: 0.29 },
				{ amount: 2, currency: "USD" },
				{ amount: 3, currency: "USD" },
			]),
		).toEqual([
			{ amount: 2.29, currency: "BRL" },
			{ amount: 5, currency: "USD" },
		]);
	});
});
