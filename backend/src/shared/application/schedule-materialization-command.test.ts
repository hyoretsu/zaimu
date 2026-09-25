import { describe, expect, mock, test } from "bun:test";
import type { EventEnvelope } from "~/shared/application/events";
import type { EventBrokerPort } from "~/shared/application/ports";
import {
	handleScheduleMaterialization,
	publishScheduleMaterialization,
	scheduleMaterializationEventType,
} from "./schedule-materialization-command";

describe("schedule materialization commands", () => {
	test("publishes a durable command routing envelope", async () => {
		const publish = mock(async (_exchange: string, _routingKey: string, _event: unknown) => {});
		const broker = { publish } as unknown as EventBrokerPort;
		const now = new Date("2026-09-25T12:34:42.123Z");
		await publishScheduleMaterialization(broker, now);
		expect(publish).toHaveBeenCalledTimes(1);
		expect(publish.mock.calls[0]?.[0]).toBe("zaimu.commands");
		expect(publish.mock.calls[0]?.[1]).toBe("schedule-materialization");
		expect(publish.mock.calls[0]?.[2]).toMatchObject({
			eventType: scheduleMaterializationEventType,
			payload: { asOf: "2026-09-25T12:34:00.000Z" },
		});
	});

	test("validates and dispatches the requested cutoff", async () => {
		const materialize = mock(async () => [{ userIds: [] }]);
		await handleScheduleMaterialization(
			{
				aggregateId: "schedule",
				aggregateType: "schedule",
				correlationId: "correlation",
				eventId: "event",
				eventType: scheduleMaterializationEventType,
				occurredAt: "2026-09-25T12:34:00.000Z",
				payload: { asOf: "2026-09-25T12:34:00.000Z" },
				schemaVersion: 1,
				userIds: [],
			},
			materialize,
		);
		expect(materialize).toHaveBeenCalledWith(new Date("2026-09-25T12:34:00.000Z"));
	});

	test("emits one consolidated event for affected users", async () => {
		const append = mock(async (_event: EventEnvelope) => {});
		await handleScheduleMaterialization(
			{
				aggregateId: "schedule",
				aggregateType: "schedule",
				correlationId: "correlation",
				eventId: "event",
				eventType: scheduleMaterializationEventType,
				occurredAt: "2026-09-25T12:34:00.000Z",
				payload: { asOf: "2026-09-25T12:34:00.000Z" },
				schemaVersion: 1,
				userIds: [],
			},
			async () => [{ userIds: ["user-1"] }, { userIds: ["user-1", "user-2"] }],
			append,
		);
		expect(append).toHaveBeenCalledTimes(1);
		expect(append.mock.calls[0]?.[0]).toMatchObject({
			aggregateType: "schedule",
			userIds: ["user-1", "user-2"],
		});
	});

	test("rejects malformed cutoffs", () =>
		expect(
			handleScheduleMaterialization(
				{
					aggregateId: "schedule",
					aggregateType: "schedule",
					correlationId: "correlation",
					eventId: "event",
					eventType: scheduleMaterializationEventType,
					occurredAt: "2026-09-25T12:34:00.000Z",
					payload: { asOf: "invalid" },
					schemaVersion: 1,
					userIds: [],
				},
				async () => [{ userIds: [] }],
			),
		).rejects.toThrow("invalid asOf"));
});
