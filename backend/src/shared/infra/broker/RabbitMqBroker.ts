import amqp, { type ChannelModel, type ConfirmChannel } from "amqplib";
import type { EventEnvelope } from "~/shared/application/events";
import type { EventBrokerPort } from "~/shared/application/ports";
import { ConsumerDeduplicator } from "./ConsumerDeduplicator";
import { processBrokerMessage } from "./process-broker-message";
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
		await channel.prefetch(Number(process.env.RABBITMQ_CONSUMER_PREFETCH ?? 1));
		await channel.consume(
			queue,
			async message => {
				if (!message) return;
				const startedAt = performance.now();
				const result = await processBrokerMessage(
					queue,
					message,
					channel,
					this.deduplicator,
					handler,
					Number(process.env.RABBITMQ_MAX_RETRIES ?? 5),
				);
				console.info(
					JSON.stringify({
						...result,
						durationMs: Number((performance.now() - startedAt).toFixed(2)),
						queue,
						type: "broker_consume",
					}),
				);
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
