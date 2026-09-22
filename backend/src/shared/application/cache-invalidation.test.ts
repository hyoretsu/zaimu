import { describe, expect, test } from "bun:test";
import { namespacesForEvent } from "./cache-invalidation";
import { createEventEnvelope } from "./events";

describe("namespacesForEvent", () => {
	test("invalidates shared transaction dependencies and its detail", () => {
		const event = createEventEnvelope({
			aggregateId: "transaction-id",
			aggregateType: "transaction",
			correlationId: "correlation-id",
			eventType: "updated",
			payload: {},
			userIds: ["user-id"],
		});
		expect(namespacesForEvent(event)).toEqual([
			"accounts:list",
			"dashboard",
			"transactions:list",
			"transactions:detail:transaction-id",
		]);
	});

	test("returns no invalidation for unrelated event types", () => {
		const event = createEventEnvelope({
			aggregateId: "id",
			aggregateType: "unknown",
			correlationId: "correlation-id",
			eventType: "updated",
			payload: {},
			userIds: ["user-id"],
		});
		expect(namespacesForEvent(event)).toEqual([]);
	});
});
