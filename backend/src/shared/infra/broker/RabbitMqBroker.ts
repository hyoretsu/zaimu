import amqp, { type ChannelModel, type ConfirmChannel } from "amqplib";
import type { EventEnvelope } from "~/shared/application/events";
import type { EventBrokerPort } from "~/shared/application/ports";
import { ConsumerDeduplicator } from "./ConsumerDeduplicator";
import { declareBrokerTopology } from "./topology";

const exchanges = ["zaimu.events", "zaimu.commands"] as const;

export class RabbitMqBroker implements EventBrokerPort {
	private channel?: ConfirmChannel;
	private connection?: ChannelModel;
	private readonly deduplicator = new ConsumerDeduplicator();
	constructor(private readonly url = process.env.RABBITMQ_URL ?? "amqp://localhost:5672") {}
	async start() {
		if (this.channel) return;
		const connection = await amqp.connect(this.url);
		const channel = await connection.createConfirmChannel();
		this.connection = connection;
		this.channel = channel;
		for (const exchange of exchanges) await channel.assertExchange(exchange, "topic", { durable: true });
		await declareBrokerTopology(channel);
	}
	async publish(exchange: (typeof exchanges)[number], routingKey: string, event: EventEnvelope) {
		const startedAt = performance.now();
		await this.start();
		const published = this.channel!.publish(exchange, routingKey, Buffer.from(JSON.stringify(event)), {
			contentType: "application/json",
			correlationId: event.correlationId,
			deliveryMode: 2,
			messageId: event.eventId,
			timestamp: Date.parse(event.occurredAt),
			type: event.eventType,
		});
		if (!published) await new Promise<void>(resolve => this.channel!.once("drain", resolve));
		await this.channel!.waitForConfirms();
		console.info(
			JSON.stringify({
				durationMs: Number((performance.now() - startedAt).toFixed(2)),
				eventType: event.eventType,
				exchange,
				result: "confirmed",
				routingKey,
				type: "broker_publish",
			}),
		);
	}
	async consume(queue: string, handler: (event: EventEnvelope) => Promise<void>) {
		await this.start();
		const channel = this.channel!;
		await channel.prefetch(Number(process.env.RABBITMQ_CONSUMER_PREFETCH ?? 8));
		await channel.consume(
			queue,
			async message => {
				if (!message) return;
				const startedAt = performance.now();
				let event: EventEnvelope;
				try {
					event = JSON.parse(message.content.toString()) as EventEnvelope;
				} catch {
					channel.sendToQueue(`${queue}.dlq`, message.content, message.properties);
					channel.ack(message);
					console.info(
						JSON.stringify({
							durationMs: Number((performance.now() - startedAt).toFixed(2)),
							queue,
							result: "invalid_dlq",
							type: "broker_consume",
						}),
					);
					return;
				}
				const claim = await this.deduplicator.claim(queue, event.eventId);
				if (claim === "completed") {
					channel.ack(message);
					console.info(
						JSON.stringify({
							durationMs: Number((performance.now() - startedAt).toFixed(2)),
							eventType: event.eventType,
							queue,
							result: "duplicate",
							type: "broker_consume",
						}),
					);
					return;
				}
				if (claim === "busy") {
					channel.reject(message, false);
					console.info(
						JSON.stringify({
							durationMs: Number((performance.now() - startedAt).toFixed(2)),
							eventType: event.eventType,
							queue,
							result: "busy",
							type: "broker_consume",
						}),
					);
					return;
				}
				try {
					await handler(event);
					await this.deduplicator.complete(queue, event.eventId);
					channel.ack(message);
					console.info(
						JSON.stringify({
							durationMs: Number((performance.now() - startedAt).toFixed(2)),
							eventType: event.eventType,
							queue,
							result: "completed",
							type: "broker_consume",
						}),
					);
				} catch (error) {
					await this.deduplicator.release(queue, event.eventId, error);
					const deaths = message.properties.headers?.["x-death"] as { count?: number }[] | undefined;
					const retries = deaths?.reduce((total, death) => total + Number(death.count ?? 0), 0) ?? 0;
					const sentToDlq = retries >= Number(process.env.RABBITMQ_MAX_RETRIES ?? 5);
					if (sentToDlq) {
						channel.sendToQueue(`${queue}.dlq`, message.content, message.properties);
						channel.ack(message);
					} else channel.reject(message, false);
					console.info(
						JSON.stringify({
							durationMs: Number((performance.now() - startedAt).toFixed(2)),
							eventType: event.eventType,
							queue,
							result: sentToDlq ? "failed_dlq" : "failed_retry",
							retries,
							type: "broker_consume",
						}),
					);
				}
			},
			{ noAck: false },
		);
	}
	async close() {
		await this.channel?.close();
		await this.connection?.close();
		this.channel = undefined;
		this.connection = undefined;
	}
}
