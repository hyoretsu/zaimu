import type { ConfirmChannel } from "amqplib";

export const queueNames = [
	"cache-invalidation",
	"schedule-materialization",
	"reference-rate-fetch",
	"account-yield-recalculation",
] as const;

export async function declareBrokerTopology(channel: ConfirmChannel) {
	for (const queue of queueNames) {
		const retry = `${queue}.retry`;
		const dead = `${queue}.dlq`;
		await channel.assertQueue(dead, { arguments: { "x-queue-type": "quorum" }, durable: true });
		await channel.assertQueue(retry, {
			arguments: {
				"x-dead-letter-exchange": queue === "cache-invalidation" ? "zaimu.events" : "zaimu.commands",
				"x-dead-letter-routing-key": queue,
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
		const exchange = queue === "cache-invalidation" ? "zaimu.events" : "zaimu.commands";
		await channel.bindQueue(queue, exchange, queue);
		if (queue === "cache-invalidation") await channel.bindQueue(queue, exchange, "domain.#");
	}
}
