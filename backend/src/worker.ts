import { handleOpenFinanceSync, recoverOpenFinanceRuns } from "./modules/open-finance/application/sync";
import {
	enqueueDailyReferenceRateFetches,
	ensureReferenceRateBootstrapJobs,
	handleAccountYieldRecalculationCommand,
	handleReferenceRateFetchCommand,
} from "./modules/reference-rates/application/reference-rate-jobs";
import { namespacesForEvent } from "./shared/application/cache-invalidation";
import type { EventEnvelope } from "./shared/application/events";
import {
	handleScheduleMaterialization,
	publishScheduleMaterialization,
} from "./shared/application/schedule-materialization-command";
import { RabbitMqBroker } from "./shared/infra/broker";
import { CacheInvalidationConsumer, DistributedCache, RedisCache } from "./shared/infra/cache";
import { withWorkerCacheWrite } from "./shared/infra/cache/worker-cache-write";
import { OutboxPublisher } from "./shared/infra/outbox";
import { queryRaw } from "./shared/infra/sql";

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
await broker.consume("open-finance-sync", handleOpenFinanceSync);
async function writeCommand(event: EventEnvelope, operation: () => Promise<unknown>, aggregateType: string) {
	const rows = await queryRaw<{ userId: string; cardId: string | null }>(
		aggregateType === "schedule"
			? `WITH owners AS (
 SELECT a."userId" FROM "FinancialAccount" a JOIN "CreditCard" c ON c."financialAccountId"=a."id"
 UNION SELECT "userId" FROM "Recurrence" WHERE "isActive"
 ), affected AS (
 SELECT "userId" FROM owners
 UNION SELECT d."requesterId" FROM "DebtConnection" d JOIN owners o ON o."userId"=d."recipientId" WHERE d."status" IN ('PENDING', 'ACCEPTED')
 UNION SELECT d."recipientId" FROM "DebtConnection" d JOIN owners o ON o."userId"=d."requesterId" WHERE d."status" IN ('PENDING', 'ACCEPTED')
 ) SELECT affected."userId", c."id" AS "cardId" FROM affected LEFT JOIN "FinancialAccount" a ON a."userId"=affected."userId" LEFT JOIN "CreditCard" c ON c."financialAccountId"=a."id"`
			: `SELECT DISTINCT "userId", NULL::text AS "cardId" FROM "FinancialAccount" WHERE "type" <> 'CREDIT_CARD'`,
	);
	const namespaces = namespacesForEvent({ ...event, aggregateType });
	if (aggregateType === "schedule") {
		namespaces.push("debts:events", "debts:overview");
		for (const row of rows) if (row.cardId) namespaces.push(`credit-cards:${row.cardId}:statements`);
	}
	await withWorkerCacheWrite(
		rows.map(row => row.userId),
		[...new Set(namespaces)],
		operation,
	);
}
await broker.consume("schedule-materialization", event =>
	writeCommand(event, () => handleScheduleMaterialization(event), "schedule"),
);
await broker.consume("reference-rate-fetch", event =>
	writeCommand(event, () => handleReferenceRateFetchCommand(event), "referenceRate"),
);
await broker.consume("account-yield-recalculation", async event => {
	const accountId = (event.payload as { financialAccountId?: string }).financialAccountId;
	const rows = await queryRaw<{ userId: string }>('SELECT "userId" FROM "FinancialAccount" WHERE "id"=$1', [
		accountId,
	]);
	await withWorkerCacheWrite(
		rows.map(row => row.userId),
		namespacesForEvent({ ...event, aggregateType: "financialAccount" }),
		() => handleAccountYieldRecalculationCommand(event),
	);
});
await publishScheduleMaterialization(broker);
await ensureReferenceRateBootstrapJobs();
await enqueueDailyReferenceRateFetches();
await recoverOpenFinanceRuns();
scheduleTimer = setInterval(() => {
	Promise.all([
		publishScheduleMaterialization(broker),
		recoverOpenFinanceRuns(),
		ensureReferenceRateBootstrapJobs(),
		enqueueDailyReferenceRateFetches(),
	]).catch(error => console.error("Failed to publish scheduled commands", error));
}, scheduleIntervalMs);
console.log("Zaimu worker running");
await publisher.run();
