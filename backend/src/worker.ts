import {
	handleScheduleMaterialization,
	publishScheduleMaterialization,
} from "./shared/application/schedule-materialization-command";
import { RabbitMqBroker } from "./shared/infra/broker";
import { CacheInvalidationConsumer, DistributedCache, RedisCache } from "./shared/infra/cache";
import { OutboxPublisher } from "./shared/infra/outbox";

const broker = new RabbitMqBroker();
const publisher = new OutboxPublisher(broker);
const cacheInvalidation = new CacheInvalidationConsumer(new DistributedCache(new RedisCache()));
const scheduleIntervalMs = Number(process.env.SCHEDULE_MATERIALIZATION_INTERVAL_MS ?? 60_000);
let scheduleTimer: ReturnType<typeof setInterval> | undefined;

const shutdown = async () => {
	publisher.stop();
	if (scheduleTimer) clearInterval(scheduleTimer);
	await broker.close();
	process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await broker.start();
await broker.consume("cache-invalidation", event => cacheInvalidation.handle(event));
await broker.consume("schedule-materialization", event => handleScheduleMaterialization(event));
await publishScheduleMaterialization(broker);
scheduleTimer = setInterval(() => {
	publishScheduleMaterialization(broker).catch(error =>
		console.error("Failed to publish schedule materialization command", error),
	);
}, scheduleIntervalMs);
console.log("Zaimu worker running");
await publisher.run();
