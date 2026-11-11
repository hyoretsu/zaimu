import type { EventBrokerPort } from "~/shared/application/ports";
import { PostgresOutbox } from "./PostgresOutbox";

export class OutboxPublisher {
	private running = false;
	constructor(
		private readonly broker: EventBrokerPort,
		private readonly outbox = new PostgresOutbox(),
	) {}
	async publishBatch() {
		const startedAt = performance.now();
		const events = await this.outbox.claim();
		let failed = 0;
		for (const event of events) {
			try {
				const command = event.eventType.startsWith("command.");
				await this.broker.publish(
					command ? "zaimu.commands" : "zaimu.events",
					command
						? event.eventType.slice("command.".length)
						: `domain.${event.aggregateType}.${event.eventType}`,
					event,
				);
				await this.outbox.markPublished(event.eventId);
			} catch (error) {
				failed++;
				await this.outbox.release(event.eventId, error);
			}
		}
		if (events.length > 0)
			console.info(
				JSON.stringify({
					claimed: events.length,
					durationMs: Number((performance.now() - startedAt).toFixed(2)),
					failed,
					published: events.length - failed,
					type: "outbox_batch",
				}),
			);
		return events.length;
	}
	async run(pollIntervalMs = 500) {
		this.running = true;
		while (this.running) {
			// A transient failure (database hiccup, lost connection) must not end the loop: the worker would
			// keep consuming while nothing new is ever published, silently stalling every command.
			const count = await this.publishBatch().catch(error => {
				console.error("Outbox publish batch failed; retrying", error);
				return 0;
			});
			if (count === 0) await Bun.sleep(pollIntervalMs);
		}
	}
	stop() {
		this.running = false;
	}
}
