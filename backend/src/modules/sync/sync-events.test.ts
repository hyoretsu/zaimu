import { expect, test } from "bun:test";
import { namespacesForEvent } from "~/shared/application/cache-invalidation";
import { syncEvents } from "./sync-events";

test("consolidates groups by domain and omits unsuccessful groups", () => {
	const events = syncEvents(
		"owner",
		{ categories: { synced: 0 }, debts: { synced: 1 }, loanPayments: { synced: 3 }, loans: { synced: 2 } },
		"correlation",
		["peer"],
	);
	expect(events).toHaveLength(2);
	expect(events[0].payload).toEqual({ aggregateIds: [], domain: "loan" });
	expect(events[0].userIds).toEqual(["owner"]);
	expect(events[1].userIds).toEqual(["owner", "peer"]);
	expect(namespacesForEvent(events[0])).toContain("loans:installments");
	expect(namespacesForEvent(events[0])).not.toContain("categories:list");
});

test("consolidated sync invalidates each changed transaction detail", () => {
	const [event] = syncEvents("owner", { transactions: { synced: 2 } }, "correlation", [], {
		transactions: [{ id: "a" }, { id: "b" }],
	});
	expect(namespacesForEvent(event)).toContain("transactions:detail:a");
	expect(namespacesForEvent(event)).toContain("transactions:detail:b");
});
