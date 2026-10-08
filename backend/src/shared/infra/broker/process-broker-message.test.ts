import { describe, expect, mock, test } from "bun:test";
import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import { createEventEnvelope } from "~/shared/application/events";
import type { ConsumerDeduplicatorPort } from "./process-broker-message";
import { processBrokerMessage } from "./process-broker-message";

const event = createEventEnvelope({
	aggregateId: "aggregate",
	aggregateType: "transaction",
	correlationId: "correlation",
	eventId: "event",
	eventType: "updated",
	payload: {},
	userIds: ["user"],
});

const message = (content: string, retries = 0) =>
	({
		content: Buffer.from(content),
		properties: { headers: retries ? { "x-death": [{ count: retries }] } : {} },
	}) as ConsumeMessage;

const channel = () => ({
	ack: mock(() => {}),
	reject: mock(() => {}),
	sendToQueue: mock(() => true),
	waitForConfirms: mock(async () => {}),
});

const deduplicator = (claim: "busy" | "claimed" | "completed" = "claimed") => ({
	claim: mock(async () => claim),
	complete: mock(async () => {}),
	release: mock(async () => {}),
});

describe("processBrokerMessage", () => {
	test("valid JSON with an invalid envelope goes to DLQ before claiming", async () => {
		const receipts = deduplicator();
		const brokerChannel = channel();
		expect(
			(
				await processBrokerMessage(
					"queue",
					message("{}"),
					brokerChannel as never,
					receipts,
					async () => {},
					3,
				)
			).result,
		).toBe("invalid_dlq");
		expect(receipts.claim).not.toHaveBeenCalled();
		expect(brokerChannel.waitForConfirms).toHaveBeenCalledTimes(1);
	});
	test("counts rejected deliveries without counting retry queue expiry twice", async () => {
		const delivery = message(JSON.stringify(event));
		delivery.properties.headers = {
			"x-death": [
				{
					count: 2,
					exchange: "zaimu.events",
					queue: "queue",
					reason: "rejected",
					"routing-keys": ["cache.invalidate"],
					time: { "!": "timestamp", value: 1_759_360_000 },
				},
				{
					count: 2,
					exchange: "zaimu.events",
					queue: "queue.retry",
					reason: "expired",
					"routing-keys": ["cache.invalidate.retry"],
					time: { "!": "timestamp", value: 1_759_360_000 },
				},
			],
		};
		const result = await processBrokerMessage(
			"queue",
			delivery,
			channel() as never,
			deduplicator(),
			async () => {
				throw new Error("retry");
			},
			3,
		);
		expect(result).toMatchObject({ result: "failed_retry", retries: 2 });
	});
	test("does not ack original delivery when DLQ confirmation fails", async () => {
		const brokerChannel = channel();
		brokerChannel.waitForConfirms = mock(async () => {
			throw new Error("confirm lost");
		});
		await expect(
			processBrokerMessage(
				"queue",
				message("invalid"),
				brokerChannel as never,
				deduplicator(),
				async () => {},
				1,
			),
		).rejects.toThrow("confirm lost");
		expect(brokerChannel.ack).not.toHaveBeenCalled();
	});
	test("acks completion only after recording the receipt", async () => {
		const calls: string[] = [];
		const brokerChannel = channel();
		brokerChannel.ack = mock(() => calls.push("ack"));
		const receipts = deduplicator();
		receipts.complete = mock(async () => {
			calls.push("complete");
		});
		const result = await processBrokerMessage(
			"queue",
			message(JSON.stringify(event)),
			brokerChannel as unknown as Pick<ConfirmChannel, "ack" | "reject" | "sendToQueue" | "waitForConfirms">,
			receipts,
			async () => {
				calls.push("handler");
			},
			3,
		);
		expect(result.result).toBe("completed");
		expect(calls).toEqual(["handler", "complete", "ack"]);
	});

	test("acks duplicates after restart without repeating effects", async () => {
		const brokerChannel = channel();
		const handler = mock(async () => {});
		const result = await processBrokerMessage(
			"queue",
			message(JSON.stringify(event)),
			brokerChannel as never,
			deduplicator("completed"),
			handler,
			3,
		);
		expect(result.result).toBe("duplicate");
		expect(handler).not.toHaveBeenCalled();
		expect(brokerChannel.ack).toHaveBeenCalledTimes(1);
	});

	test("releases failed claims and retries below the limit", async () => {
		const brokerChannel = channel();
		const receipts = deduplicator();
		const result = await processBrokerMessage(
			"queue",
			message(JSON.stringify(event), 2),
			brokerChannel as never,
			receipts,
			async () => {
				throw new Error("crash");
			},
			3,
		);
		expect(result).toMatchObject({ result: "failed_retry", retries: 2 });
		expect(receipts.release).toHaveBeenCalledTimes(1);
		expect(brokerChannel.reject).toHaveBeenCalledWith(expect.anything(), false);
	});

	test("moves exhausted and malformed deliveries to the DLQ", async () => {
		const exhaustedChannel = channel();
		const exhausted = await processBrokerMessage(
			"queue",
			message(JSON.stringify(event), 3),
			exhaustedChannel as never,
			deduplicator(),
			async () => {
				throw new Error("still failing");
			},
			3,
		);
		expect(exhausted.result).toBe("failed_dlq");
		expect(exhaustedChannel.sendToQueue).toHaveBeenCalledWith(
			"queue.dlq",
			expect.anything(),
			expect.anything(),
		);

		const malformedChannel = channel();
		const malformed = await processBrokerMessage(
			"queue",
			message("not-json"),
			malformedChannel as never,
			deduplicator() as ConsumerDeduplicatorPort,
			async () => {},
			3,
		);
		expect(malformed.result).toBe("invalid_dlq");
		expect(malformedChannel.ack).toHaveBeenCalledTimes(1);
	});
});

test("passes the invocation lease token to completion and failure release", async () => {
	const receipts = {
		claim: mock(async () => ({ result: "claimed" as const, token: "owner-a" })),
		complete: mock(async () => {}),
		release: mock(async () => {}),
	};
	await processBrokerMessage("queue", message(JSON.stringify(event)), channel(), receipts, async () => {}, 3);
	expect(receipts.complete).toHaveBeenCalledWith("queue", event.eventId, "owner-a");
	const failure = new Error("download failed");
	await processBrokerMessage(
		"queue",
		message(JSON.stringify(event)),
		channel(),
		receipts,
		async () => {
			throw failure;
		},
		3,
	);
	expect(receipts.release).toHaveBeenCalledWith("queue", event.eventId, failure, "owner-a");
});

test("collection exhaustion reaches DLQ even with a fresh delivery generation", async () => {
	const brokerChannel = channel();
	const failure = Object.assign(new Error("exhausted"), { historyExhausted: true });
	const result = await processBrokerMessage(
		"queue",
		message(JSON.stringify(event)),
		brokerChannel,
		deduplicator(),
		async () => {
			throw failure;
		},
		10,
	);
	expect(result.result).toBe("failed_dlq");
	expect(brokerChannel.reject).not.toHaveBeenCalled();
	expect(brokerChannel.ack).toHaveBeenCalledTimes(1);
});
