import { expect, test } from "bun:test";
import type { ConfirmChannel } from "amqplib";
import { brokerExchange, brokerQueue } from "../service-namespace";
import { declareBrokerTopology, queueNames } from "./topology";

test("all queue bindings and dead-letter paths remain within the environment", async () => {
	const queues = new Map<string, { arguments: Record<string, unknown> }>();
	const bindings: string[][] = [];
	const channel = {
		assertQueue: async (name: string, options: { arguments: Record<string, unknown> }) => {
			queues.set(name, options);
		},
		bindQueue: async (...args: string[]) => {
			bindings.push(args);
		},
	} as unknown as ConfirmChannel;
	await declareBrokerTopology(channel);
	for (const routingKey of queueNames) {
		const queue = brokerQueue(routingKey);
		const exchange = brokerExchange(routingKey === "cache-invalidation" ? "zaimu.events" : "zaimu.commands");
		expect(queues.has(`${queue}.dlq`)).toBe(true);
		expect(queues.get(queue)?.arguments["x-dead-letter-routing-key"]).toBe(`${queue}.retry`);
		expect(queues.get(`${queue}.retry`)?.arguments["x-dead-letter-exchange"]).toBe(exchange);
		expect(queues.get(`${queue}.retry`)?.arguments["x-dead-letter-routing-key"]).toBe(routingKey);
		expect(bindings).toContainEqual([queue, exchange, routingKey]);
	}
	expect(bindings).toContainEqual([
		brokerQueue("cache-invalidation"),
		brokerExchange("zaimu.events"),
		"domain.#",
	]);
});
