import { describe, expect, mock, test } from "bun:test";
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
			eventId: "schedule-materialization:2026-09-25T12:34:00.000Z",
			eventType: scheduleMaterializationEventType,
			payload: { asOf: "2026-09-25T12:34:00.000Z" },
		});
	});

	test("validates and dispatches the requested cutoff", async () => {
		const materialize = mock(async () => {});
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
				async () => {},
			),
		).rejects.toThrow("invalid asOf"));
});
