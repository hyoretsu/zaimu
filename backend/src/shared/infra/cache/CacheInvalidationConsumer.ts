import { namespacesForEvent } from "~/shared/application/cache-invalidation";
import type { EventEnvelope } from "~/shared/application/events";
import type { DistributedCache } from "./DistributedCache";

export class CacheInvalidationConsumer {
	constructor(private readonly cache: DistributedCache) {}
	async handle(event: EventEnvelope) {
		const namespaces = namespacesForEvent(event);
		if (namespaces.length === 0) return;
		await Promise.all(event.userIds.map(userId => this.cache.finishWrite(userId, namespaces)));
	}
}
