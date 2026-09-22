import type { EventBrokerPort } from "~/shared/application/ports";
import { PostgresOutbox } from "./PostgresOutbox";

export class OutboxPublisher {
	private running = false;
	constructor(
		private readonly broker: EventBrokerPort,
		private readonly outbox = new PostgresOutbox(),
	) {}
	async publishBatch() {
		const events = await this.outbox.claim();
		for (const event of events) {
			try {
				await this.broker.publish("zaimu.events", `domain.${event.aggregateType}.${event.eventType}`, event);
				await this.outbox.markPublished(event.eventId);
			} catch (error) {
				await this.outbox.release(event.eventId, error);
			}
		}
		return events.length;
	}
	async run(pollIntervalMs = 500) {
		this.running = true;
		while (this.running) {
			const count = await this.publishBatch();
			if (count === 0) await Bun.sleep(pollIntervalMs);
		}
	}
	stop() {
		this.running = false;
	}
}
