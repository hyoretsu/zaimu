import { RabbitMqBroker } from "./shared/infra/broker";
import { OutboxPublisher } from "./shared/infra/outbox";

const broker = new RabbitMqBroker();
const publisher = new OutboxPublisher(broker);

const shutdown = async () => {
	publisher.stop();
	await broker.close();
	process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await broker.start();
console.log("Zaimu worker running");
await publisher.run();
