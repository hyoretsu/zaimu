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
	const loan = events.find(event => event.payload.domain === "loan")!;
	const debt = events.find(event => event.payload.domain === "debt")!;
	expect(loan.payload).toEqual({ aggregateIds: [], domain: "loan" });
	expect(loan.userIds).toEqual(["owner"]);
	expect(debt.userIds).toEqual(["owner", "peer"]);
	expect(namespacesForEvent(loan)).toContain("loans:installments");
	expect(namespacesForEvent(loan)).not.toContain("categories:list");
});

test("consolidated sync invalidates each changed transaction detail", () => {
	const [event] = syncEvents("owner", { transactions: { synced: 2 } }, "correlation", [], {
		transactions: [{ id: "a" }, { id: "b" }],
	});
	expect(namespacesForEvent(event)).toContain("transactions:detail:a");
	expect(namespacesForEvent(event)).toContain("transactions:detail:b");
});
