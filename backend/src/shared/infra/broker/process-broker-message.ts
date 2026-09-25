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
	channel: Pick<ConfirmChannel, "ack" | "reject" | "sendToQueue">,
	deduplicator: ConsumerDeduplicatorPort,
	handler: (event: EventEnvelope) => Promise<void>,
	maxRetries: number,
): Promise<BrokerConsumeResult> {
	let event: EventEnvelope;
	try {
		event = JSON.parse(message.content.toString()) as EventEnvelope;
	} catch {
		channel.sendToQueue(`${queue}.dlq`, message.content, message.properties);
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
		const deaths = message.properties.headers?.["x-death"] as { count?: number }[] | undefined;
		const retries = deaths?.reduce((total, death) => total + Number(death.count ?? 0), 0) ?? 0;
		if (retries >= maxRetries) {
			channel.sendToQueue(`${queue}.dlq`, message.content, message.properties);
			channel.ack(message);
			return { eventType: event.eventType, result: "failed_dlq", retries };
		}
		channel.reject(message, false);
		return { eventType: event.eventType, result: "failed_retry", retries };
	}
}
