import { refreshHeldAssetQuotes } from "./modules/financial-history/application/asset-quote-refresh";
import { handleCurrencyHistoryCommand } from "./modules/financial-history/application/currency-history-jobs";
import { recoverHistoryCollections } from "./modules/financial-history/application/history-collections";
import { deliverNotifications } from "./modules/notifications/notification-deliveries";
import { handleOpenFinanceSync, recoverOpenFinanceRuns } from "./modules/open-finance/application/sync";
import { enqueueDailyAccountYieldRecalculations } from "./modules/reference-rates/application/daily-account-yield-jobs";
import {
	enqueueDailyReferenceRateFetches,
	ensureReferenceRateBootstrapJobs,
	handleAccountYieldRecalculationCommand,
	handleReferenceRateFetchCommand,
} from "./modules/reference-rates/application/reference-rate-jobs";
import { handleImportFile, recoverImportFiles } from "./modules/transaction-imports/application/jobs";
import { namespacesForEvent } from "./shared/application/cache-invalidation";
import type { EventEnvelope } from "./shared/application/events";
import { publishScheduleMaterialization } from "./shared/application/schedule-materialization-command";
import { handleScopedScheduleMaterialization } from "./shared/application/scoped-schedule-materialization";
import { RabbitMqBroker } from "./shared/infra/broker";
import { CacheInvalidationConsumer, DistributedCache, RedisCache } from "./shared/infra/cache";
import { withWorkerCacheFence, withWorkerCacheWrite } from "./shared/infra/cache/worker-cache-write";
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
await broker.consume("import-file", event => handleImportFile(event as EventEnvelope<{ jobId: string }>));
async function writeCommand(event: EventEnvelope, operation: () => Promise<unknown>, aggregateType: string) {
	const rows = await queryRaw<{ userId: string }>(
		`SELECT DISTINCT "userId" FROM "FinancialAccount" WHERE "type" <> 'CREDIT_CARD'`,
	);
	const namespaces = namespacesForEvent({ ...event, aggregateType });
	await withWorkerCacheFence(
		rows.map(row => row.userId),
		[...new Set(namespaces)],
		operation,
	);
}
await broker.consume("currency-rate-history-fetch", handleCurrencyHistoryCommand);
await broker.consume("schedule-materialization", handleScopedScheduleMaterialization);
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
await enqueueDailyAccountYieldRecalculations();
await deliverNotifications();
await recoverOpenFinanceRuns();
await recoverImportFiles();
await recoverHistoryCollections();
void refreshHeldAssetQuotes().catch(() => console.warn("Held asset quote refresh unavailable"));
scheduleTimer = setInterval(() => {
	Promise.all([
		deliverNotifications(),
		publishScheduleMaterialization(broker),
		recoverOpenFinanceRuns(),
		recoverImportFiles(),
		recoverHistoryCollections(),
		refreshHeldAssetQuotes(),
		ensureReferenceRateBootstrapJobs(),
		enqueueDailyReferenceRateFetches(),
		enqueueDailyAccountYieldRecalculations(),
	]).catch(error => console.error("Failed to publish scheduled commands", error));
}, scheduleIntervalMs);
console.log("Zaimu worker running");
await publisher.run();
