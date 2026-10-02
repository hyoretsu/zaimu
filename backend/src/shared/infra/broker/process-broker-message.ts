import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import type { EventEnvelope } from "~/shared/application/events";

export interface ConsumerDeduplicatorPort {
	claim(consumer: string, eventId: string): Promise<"busy" | "claimed" | "completed">;
	complete(consumer: string, eventId: string): Promise<void>;
	release(consumer: string, eventId: string, error: unknown): Promise<void>;
}

export type BrokerConsumeResult =
	| { result: "busy" | "completed" | "duplicate"; eventType: string }
	| { result: "failed_dlq" | "failed_retry"; eventType: string; retries: number }
	| { result: "invalid_dlq" };

export async function processBrokerMessage(
	queue: string,
	message: ConsumeMessage,
	channel: Pick<ConfirmChannel, "ack" | "reject" | "sendToQueue" | "waitForConfirms">,
	deduplicator: ConsumerDeduplicatorPort,
	handler: (event: EventEnvelope) => Promise<void>,
	maxRetries: number,
): Promise<BrokerConsumeResult> {
	let event: EventEnvelope;
	try {
		event = JSON.parse(message.content.toString()) as EventEnvelope;
		if (
			!event ||
			typeof event !== "object" ||
			![
				event.eventId,
				event.eventType,
				event.aggregateId,
				event.aggregateType,
				event.correlationId,
				event.occurredAt,
			].every(value => typeof value === "string" && value.length > 0) ||
			!Number.isFinite(Date.parse(event.occurredAt)) ||
			!Number.isInteger(event.schemaVersion) ||
			event.schemaVersion < 1 ||
			!Array.isArray(event.userIds) ||
			!event.userIds.every(id => typeof id === "string")
		)
			throw new Error("Invalid event envelope");
	} catch {
		channel.sendToQueue(`${queue}.dlq`, message.content, message.properties);
		await channel.waitForConfirms();
		channel.ack(message);
		return { result: "invalid_dlq" };
	}
	const claim = await deduplicator.claim(queue, event.eventId);
	if (claim === "completed") {
		channel.ack(message);
		return { eventType: event.eventType, result: "duplicate" };
	}
	if (claim === "busy") {
		channel.reject(message, false);
		return { eventType: event.eventType, result: "busy" };
	}
	try {
		await handler(event);
		await deduplicator.complete(queue, event.eventId);
		channel.ack(message);
		return { eventType: event.eventType, result: "completed" };
	} catch (error) {
		await deduplicator.release(queue, event.eventId, error);
		const deaths = message.properties.headers?.["x-death"] as
			| { count?: number; queue?: string; reason?: string }[]
			| undefined;
		const retries =
			deaths
				?.filter(death => !death.queue || (death.queue === queue && death.reason === "rejected"))
				.reduce((total, death) => total + Number(death.count ?? 0), 0) ?? 0;
		if (retries >= maxRetries) {
			channel.sendToQueue(`${queue}.dlq`, message.content, message.properties);
			await channel.waitForConfirms();
			channel.ack(message);
			return { eventType: event.eventType, result: "failed_dlq", retries };
		}
		channel.reject(message, false);
		return { eventType: event.eventType, result: "failed_retry", retries };
	}
}
