import {
	enqueueDailyReferenceRateFetches,
	ensureReferenceRateBootstrapJobs,
	handleAccountYieldRecalculationCommand,
	handleReferenceRateFetchCommand,
} from "./modules/reference-rates/application/reference-rate-jobs";
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
await broker.consume("reference-rate-fetch", async event => {
	await handleReferenceRateFetchCommand(event);
});
await broker.consume("account-yield-recalculation", event => handleAccountYieldRecalculationCommand(event));
await publishScheduleMaterialization(broker);
await ensureReferenceRateBootstrapJobs();
await enqueueDailyReferenceRateFetches();
scheduleTimer = setInterval(() => {
	Promise.all([
		publishScheduleMaterialization(broker),
		ensureReferenceRateBootstrapJobs(),
		enqueueDailyReferenceRateFetches(),
	]).catch(error => console.error("Failed to publish scheduled commands", error));
}, scheduleIntervalMs);
console.log("Zaimu worker running");
await publisher.run();
