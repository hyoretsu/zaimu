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
			"debts:events",
			"debts:overview",
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

	test("invalidates every cache affected by schedule workers", () => {
		const event = createEventEnvelope({
			aggregateId: "schedule",
			aggregateType: "schedule",
			correlationId: "correlation-id",
			eventType: "materialized",
			payload: {},
			userIds: ["user-id"],
		});
		expect(namespacesForEvent(event)).toEqual([
			"accounts:list",
			"credit-cards:overview",
			"dashboard",
			"schedules:detail",
			"schedules:history",
			"schedules:overview",
			"transactions:list",
			"transactions:detail",
		]);
	});

	test("invalidates every debt reader for all affected users", () => {
		const event = createEventEnvelope({
			aggregateId: "debt-id",
			aggregateType: "debt",
			correlationId: "correlation-id",
			eventType: "updated",
			payload: {},
			userIds: ["user-1", "user-2"],
		});
		expect(namespacesForEvent(event)).toEqual([
			"debts:events",
			"debts:invitations",
			"debts:overview",
			"dashboard",
			"transactions:list",
			"transactions:detail",
		]);
	});
});
