import { expect, mock, test } from "bun:test";
import { createEventEnvelope } from "~/shared/application/events";
import { CacheInvalidationConsumer } from "./CacheInvalidationConsumer";
import type { DistributedCache } from "./DistributedCache";

test("invalidates every user affected by a shared debt event", async () => {
	const finishWrite = mock(async () => {});
	const cache = { finishWrite } as unknown as DistributedCache;
	await new CacheInvalidationConsumer(cache).handle(
		createEventEnvelope({
			aggregateId: "debt-event",
			aggregateType: "debt",
			correlationId: "correlation",
			eventType: "updated",
			payload: {},
			userIds: ["user-1", "user-2"],
		}),
	);
	expect(finishWrite).toHaveBeenCalledTimes(2);
	expect(finishWrite).toHaveBeenCalledWith("user-1", ["dashboard", "transactions:list"]);
	expect(finishWrite).toHaveBeenCalledWith("user-2", ["dashboard", "transactions:list"]);
});
