import amqp, { type ChannelModel, type ConfirmChannel } from "amqplib";
import type { EventEnvelope } from "~/shared/application/events";
import type { EventBrokerPort } from "~/shared/application/ports";
import { declareBrokerTopology } from "./topology";

const exchanges = ["zaimu.events", "zaimu.commands"] as const;

export class RabbitMqBroker implements EventBrokerPort {
	private channel?: ConfirmChannel;
	private connection?: ChannelModel;
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
	async close() {
		await this.channel?.close();
		await this.connection?.close();
		this.channel = undefined;
		this.connection = undefined;
	}
}
