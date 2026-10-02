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
	private starting?: Promise<void>;
	private stopped = false;
	private retryTimer?: ReturnType<typeof setTimeout>;
	private readonly consumers = new Map<string, (event: EventEnvelope) => Promise<void>>();
	private readonly deduplicator = new ConsumerDeduplicator();
	constructor(private readonly url = process.env.RABBITMQ_URL ?? "amqp://localhost:5672") {}
	private retryConnection() {
		if (this.stopped || this.retryTimer || !this.consumers.size) return;
		this.retryTimer = setTimeout(() => {
			this.retryTimer = undefined;
			this.start().catch(() => this.retryConnection());
		}, 1000);
	}
	async start() {
		this.stopped = false;
		if (this.starting) return this.starting;
		if (this.channel) return;
		this.starting = (async () => {
			const connection = await amqp.connect(this.url);
			const lost = () => {
				if (this.connection !== connection) return;
				this.connection = undefined;
				this.channel = undefined;
				this.retryConnection();
			};
			connection.on("error", () => {});
			connection.on("close", lost);
			this.connection = connection;
			try {
				const channel = await connection.createConfirmChannel();
				channel.on("error", () => {});
				channel.on("close", () => {
					lost();
					connection.close().catch(() => {});
				});
				for (const exchange of exchanges) await channel.assertExchange(exchange, "topic", { durable: true });
				await declareBrokerTopology(channel);
				await channel.prefetch(Number(process.env.RABBITMQ_CONSUMER_PREFETCH ?? 1));
				for (const [queue, handler] of this.consumers) await this.attachConsumer(channel, queue, handler);
				this.channel = channel;
			} catch (error) {
				lost();
				await connection.close().catch(() => {});
				throw error;
			}
		})();
		try {
			await this.starting;
		} finally {
			this.starting = undefined;
		}
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
	private async attachConsumer(
		channel: ConfirmChannel,
		queue: string,
		handler: (event: EventEnvelope) => Promise<void>,
	) {
		await channel.consume(
			queue,
			message => {
				if (!message) return;
				const startedAt = performance.now();
				processBrokerMessage(
					queue,
					message,
					channel,
					this.deduplicator,
					handler,
					Number(process.env.RABBITMQ_MAX_RETRIES ?? 5),
				)
					.then(result =>
						console.info(
							JSON.stringify({
								...result,
								durationMs: Number((performance.now() - startedAt).toFixed(2)),
								queue,
								type: "broker_consume",
							}),
						),
					)
					.catch(() => {
						try {
							channel.nack(message, false, true);
						} catch {
							/* Connection loss requeues unacknowledged messages. */
						}
					});
			},
			{ noAck: false },
		);
	}
	async consume(queue: string, handler: (event: EventEnvelope) => Promise<void>) {
		await this.start();
		if (this.consumers.has(queue)) throw new Error(`Consumer already registered: ${queue}`);
		this.consumers.set(queue, handler);
		try {
			await this.attachConsumer(this.channel!, queue, handler);
		} catch (error) {
			this.retryConnection();
			throw error;
		}
	}
	async close() {
		this.stopped = true;
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.retryTimer = undefined;
		if (this.starting) await this.starting.catch(() => {});
		await this.channel?.close().catch(() => {});
		await this.connection?.close().catch(() => {});
		this.channel = undefined;
		this.connection = undefined;
	}
}
