import type { ConfirmChannel } from "amqplib";
import { brokerExchange, brokerQueue } from "../service-namespace";

export const queueNames = [
	"open-finance-sync",
	"cache-invalidation",
	"schedule-materialization",
	"reference-rate-fetch",
	"currency-rate-history-fetch",
	"account-yield-recalculation",
] as const;

export async function declareBrokerTopology(channel: ConfirmChannel) {
	for (const routingKey of queueNames) {
		const queue = brokerQueue(routingKey);
		const retry = `${queue}.retry`;
		const dead = `${queue}.dlq`;
		await channel.assertQueue(dead, { arguments: { "x-queue-type": "quorum" }, durable: true });
		await channel.assertQueue(retry, {
			arguments: {
				"x-dead-letter-exchange": brokerExchange(
					routingKey === "cache-invalidation" ? "zaimu.events" : "zaimu.commands",
				),
				"x-dead-letter-routing-key": routingKey,
				"x-dead-letter-strategy": "at-least-once",
				"x-message-ttl": 30_000,
				"x-overflow": "reject-publish",
				"x-queue-type": "quorum",
			},
			durable: true,
		});
		await channel.assertQueue(queue, {
			arguments: {
				"x-dead-letter-exchange": "",
				"x-dead-letter-routing-key": retry,
				"x-dead-letter-strategy": "at-least-once",
				"x-overflow": "reject-publish",
				"x-queue-type": "quorum",
			},
			durable: true,
		});
		const exchange = brokerExchange(routingKey === "cache-invalidation" ? "zaimu.events" : "zaimu.commands");
		await channel.bindQueue(queue, exchange, routingKey);
		if (routingKey === "cache-invalidation") await channel.bindQueue(queue, exchange, "domain.#");
	}
}
