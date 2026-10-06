import { withQueryMetrics } from "sql";
import { DistributedCache } from "../../src/shared/infra/cache/DistributedCache";
import { RedisCache } from "../../src/shared/infra/cache/RedisCache";
import { cacheKey } from "../../src/shared/infra/service-namespace";

const owner = process.argv[2]!;
if (!process.env.SERVICE_NAMESPACE?.startsWith("zaimu_performance_coalescing_"))
	throw new Error("Dedicated namespace required");
const redis = new RedisCache("redis://127.0.0.1:6395");
try {
	const result = await withQueryMetrics(() =>
		new DistributedCache(redis).remember(owner, "dashboard", {}, async () => {
			await redis.client.send("INCR", [cacheKey(`coalescing:${owner}:loads`)]);
			await Bun.sleep(12000);
			return { complete: true };
		}),
	);
	console.info(`RESULT:${JSON.stringify(result)}`);
} finally {
	redis.client.close();
}
