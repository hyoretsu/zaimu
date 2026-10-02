import { withRawTransaction } from "~/shared/infra/sql";
import type { CacheNamespace, DistributedCache } from "./DistributedCache";
import { distributedCache } from "./runtime";

export async function withWorkerCacheWrite<Result>(
	userIds: string[],
	namespaces: CacheNamespace[],
	operation: () => Promise<Result>,
	cache: Pick<DistributedCache, "beginWrite" | "finishWrite"> = distributedCache,
	transaction: (operation: () => Promise<Result>) => Promise<Result> = operation =>
		withRawTransaction(operation),
) {
	const owners = [...new Set(userIds)];
	const tokens = await Promise.all(owners.map(userId => cache.beginWrite(userId, namespaces)));
	let pendingRenewal: Promise<unknown> = Promise.resolve();
	const renewal = setInterval(() => {
		pendingRenewal = Promise.all(
			owners.map((userId, index) => cache.beginWrite(userId, namespaces, tokens[index])),
		).catch(error => console.error("Worker cache fence renewal failed", error));
	}, 30_000);
	try {
		const result = await transaction(operation);
		clearInterval(renewal);
		await pendingRenewal;
		await Promise.all(owners.map((userId, index) => cache.finishWrite(userId, namespaces, tokens[index])));
		return result;
	} finally {
		clearInterval(renewal);
	}
}
