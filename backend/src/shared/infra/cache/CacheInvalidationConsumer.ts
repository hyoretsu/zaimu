import { namespacesForEvent } from "~/shared/application/cache-invalidation";
import type { EventEnvelope } from "~/shared/application/events";
import { type UserEventBus, userEventBus } from "../realtime";
import type { DistributedCache } from "./DistributedCache";

export class CacheInvalidationConsumer {
	constructor(
		private readonly cache: DistributedCache,
		private readonly realtime: Pick<UserEventBus, "publish"> = userEventBus,
	) {}
	async handle(event: EventEnvelope) {
		const namespaces = namespacesForEvent(event);
		if (namespaces.length === 0) return;
		await Promise.all(event.userIds.map(userId => this.cache.finishWrite(userId, namespaces)));
		// Clients refetch once the server cache is fresh; a lost push only delays them until the next load.
		await this.realtime
			.publish(event.userIds, { aggregateType: event.aggregateType, eventType: event.eventType })
			.catch(error => console.warn("Failed to publish realtime event", error));
	}
}
