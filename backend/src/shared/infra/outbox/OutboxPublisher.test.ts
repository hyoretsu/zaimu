import { describe, expect, mock, test } from "bun:test";
import { createEventEnvelope } from "~/shared/application/events";
import type { EventBrokerPort } from "~/shared/application/ports";
import { OutboxPublisher } from "./OutboxPublisher";
import type { PostgresOutbox } from "./PostgresOutbox";

const event = createEventEnvelope({
	aggregateId: "aggregate",
	aggregateType: "transaction",
	correlationId: "correlation",
	eventId: "event",
	eventType: "updated",
	payload: {},
	userIds: ["user"],
});

describe("OutboxPublisher", () => {
	test("releases an event when publisher confirmation fails", async () => {
		const broker = {
			publish: mock(async () => {
				throw new Error("confirm lost");
			}),
		} as unknown as EventBrokerPort;
		const outbox = {
			claim: mock(async () => [{ ...event, attempts: 1 }]),
			markPublished: mock(async () => {}),
			release: mock(async () => {}),
		} as unknown as PostgresOutbox;
		await new OutboxPublisher(broker, outbox).publishBatch();
		expect(outbox.release).toHaveBeenCalledWith(event.eventId, expect.any(Error));
		expect(outbox.markPublished).not.toHaveBeenCalled();
	});

	test("routes recovered commands and marks them only after confirmation", async () => {
		const command = { ...event, eventType: "command.reference-rate-fetch" };
		const broker = { publish: mock(async () => {}) } as unknown as EventBrokerPort;
		const outbox = {
			claim: mock(async () => [{ ...command, attempts: 2 }]),
			markPublished: mock(async () => {}),
			release: mock(async () => {}),
		} as unknown as PostgresOutbox;
		await new OutboxPublisher(broker, outbox).publishBatch();
		expect(broker.publish).toHaveBeenCalledWith(
			"zaimu.commands",
			"reference-rate-fetch",
			expect.objectContaining({ eventId: event.eventId }),
		);
		expect(outbox.markPublished).toHaveBeenCalledWith(event.eventId);
	});
});
