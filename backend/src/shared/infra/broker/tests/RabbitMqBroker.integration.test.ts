import { describe, expect, test } from "bun:test";
import amqp from "amqplib";
import { createEventEnvelope } from "~/shared/application/events";
import { brokerQueue } from "../../service-namespace";
import { RabbitMqBroker } from "../RabbitMqBroker";

const enabled = Boolean(process.env.BROKER_TEST_URL);
const eventually = async (check: () => Promise<boolean>, timeout = 60000) => {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (await check()) return;
		await Bun.sleep(100);
	}
	throw new Error("Local broker condition timed out");
};

describe.skipIf(!enabled)("dedicated broker", () => {
	test("isolated broker confirms, reconnects, deduplicates, retries and persists DLQ", async () => {
		const url = new URL(process.env.BROKER_TEST_URL!);
		const database = new URL(process.env.DATABASE_URL!);
		if (
			url.hostname !== "127.0.0.1" ||
			url.port !== "5675" ||
			database.hostname !== "127.0.0.1" ||
			database.pathname !== "/zaimu_performance_codex_0012"
		)
			throw new Error("Dedicated local broker and fixture required");
		const { executeRaw, closeDatabase } = await import("sql");
		const broker = new RabbitMqBroker(url.toString());
		const eventIds: string[] = [];
		const makeEvent = () => {
			const event = createEventEnvelope({
				aggregateId: "broker-test",
				aggregateType: "test",
				correlationId: "broker-test",
				eventType: "domain.test",
				payload: {},
				userIds: [],
			});
			eventIds.push(event.eventId);
			return event;
		};
		const calls = new Map<string, number>();
		const recover = makeEvent(),
			dead = makeEvent(),
			first = makeEvent(),
			persisted = makeEvent();
		let connection: Awaited<ReturnType<typeof amqp.connect>> | undefined;
		const previousRetries = process.env.RABBITMQ_MAX_RETRIES;
		process.env.RABBITMQ_MAX_RETRIES = "1";
		try {
			await eventually(async () => {
				try {
					await broker.start();
					return true;
				} catch {
					return false;
				}
			});
			await broker.consume("cache-invalidation", async event => {
				const count = (calls.get(event.eventId) ?? 0) + 1;
				calls.set(event.eventId, count);
				if (event.eventId === dead.eventId || (event.eventId === recover.eventId && count === 1))
					throw new Error("Expected local retry");
			});
			await broker.publish("zaimu.events", "domain.test", first);
			await broker.publish("zaimu.events", "domain.test", first);
			await eventually(async () => calls.get(first.eventId) === 1);
			await Bun.sleep(200);
			expect(calls.get(first.eventId)).toBe(1);
			// Stop consumer, persist a confirmed delivery, restart only the dedicated broker.
			await broker.close();
			const publisher = new RabbitMqBroker(url.toString());
			await publisher.publish("zaimu.events", "domain.test", persisted);
			await publisher.close();
			const restart = Bun.spawn(["docker", "restart", "-t", "2", "zaimu-validation-rabbit-0012"], {
				stderr: "ignore",
				stdout: "ignore",
			});
			expect(await restart.exited).toBe(0);
			await eventually(async () => {
				try {
					await broker.start();
					return true;
				} catch {
					return false;
				}
			});
			await eventually(async () => calls.get(persisted.eventId) === 1);
			const reconnect = Bun.spawn(["docker", "restart", "-t", "2", "zaimu-validation-rabbit-0012"], {
				stderr: "ignore",
				stdout: "ignore",
			});
			expect(await reconnect.exited).toBe(0);
			await eventually(async () => {
				try {
					await broker.publish("zaimu.events", "domain.test", first);
					return true;
				} catch {
					return false;
				}
			});
			await broker.publish("zaimu.events", "domain.test", recover);
			await broker.publish("zaimu.events", "domain.test", dead);
			await eventually(
				async () => (calls.get(recover.eventId) ?? 0) === 2 && (calls.get(dead.eventId) ?? 0) === 2,
			);
			expect(calls.get(first.eventId)).toBe(1);
			connection = await amqp.connect(url.toString());
			const channel = await connection.createConfirmChannel();
			let deadLetter: string | undefined;
			await eventually(async () => {
				const message = await channel.get(brokerQueue("cache-invalidation.dlq"), { noAck: false });
				if (!message) return false;
				deadLetter = JSON.parse(message.content.toString()).eventId;
				channel.ack(message);
				return true;
			});
			expect(deadLetter).toBe(dead.eventId);
			await channel.close();
		} finally {
			await broker.close();
			await connection?.close();
			await executeRaw('DELETE FROM "ConsumerReceipt" WHERE "eventId"=ANY($1)', [eventIds]);
			await closeDatabase();
			if (previousRetries === undefined) delete process.env.RABBITMQ_MAX_RETRIES;
			else process.env.RABBITMQ_MAX_RETRIES = previousRetries;
		}
	}, 150000);
});
