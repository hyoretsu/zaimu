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
	}
	async consume(queue: string, handler: (event: EventEnvelope) => Promise<void>) {
		await this.start();
		const channel = this.channel!;
		await channel.prefetch(Number(process.env.RABBITMQ_CONSUMER_PREFETCH ?? 8));
		await channel.consume(
			queue,
			async message => {
				if (!message) return;
				let event: EventEnvelope;
				try {
					event = JSON.parse(message.content.toString()) as EventEnvelope;
				} catch {
					channel.sendToQueue(`${queue}.dlq`, message.content, message.properties);
					channel.ack(message);
					return;
				}
				const claim = await this.deduplicator.claim(queue, event.eventId);
				if (claim === "completed") {
					channel.ack(message);
					return;
				}
				if (claim === "busy") {
					channel.reject(message, false);
					return;
				}
				try {
					await handler(event);
					await this.deduplicator.complete(queue, event.eventId);
					channel.ack(message);
				} catch (error) {
					await this.deduplicator.release(queue, event.eventId, error);
					const deaths = message.properties.headers?.["x-death"] as { count?: number }[] | undefined;
					const retries = deaths?.reduce((total, death) => total + Number(death.count ?? 0), 0) ?? 0;
					if (retries >= Number(process.env.RABBITMQ_MAX_RETRIES ?? 5)) {
						channel.sendToQueue(`${queue}.dlq`, message.content, message.properties);
						channel.ack(message);
					} else channel.reject(message, false);
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
