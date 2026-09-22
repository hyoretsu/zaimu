import { RabbitMqBroker } from "./shared/infra/broker";
import { CacheInvalidationConsumer, DistributedCache, RedisCache } from "./shared/infra/cache";
import { OutboxPublisher } from "./shared/infra/outbox";

const broker = new RabbitMqBroker();
const publisher = new OutboxPublisher(broker);
const cacheInvalidation = new CacheInvalidationConsumer(new DistributedCache(new RedisCache()));

const shutdown = async () => {
	publisher.stop();
	await broker.close();
	process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await broker.start();
await broker.consume("cache-invalidation", event => cacheInvalidation.handle(event));
console.log("Zaimu worker running");
await publisher.run();
