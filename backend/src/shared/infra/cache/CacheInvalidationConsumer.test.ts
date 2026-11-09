import { expect, mock, test } from "bun:test";
import { createEventEnvelope } from "~/shared/application/events";
import { CacheInvalidationConsumer } from "./CacheInvalidationConsumer";
import type { DistributedCache } from "./DistributedCache";

test("invalidates every user affected by a shared debt event", async () => {
	const finishWrite = mock(async () => {});
	const cache = { finishWrite } as unknown as DistributedCache;
	const publish = mock(async () => {});
	await new CacheInvalidationConsumer(cache, { publish }).handle(
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
	expect(finishWrite).toHaveBeenCalledWith("user-1", [
		"debts:events",
		"debts:invitations",
		"debts:overview",
		"dashboard",
		"transactions:list",
		"transactions:detail",
	]);
	expect(finishWrite).toHaveBeenCalledWith("user-2", [
		"debts:events",
		"debts:invitations",
		"debts:overview",
		"dashboard",
		"transactions:list",
		"transactions:detail",
	]);
	expect(publish).toHaveBeenCalledWith(["user-1", "user-2"], {
		aggregateId: "debt-event",
		aggregateType: "debt",
		eventType: "updated",
	});
});
