import { loadCreditCardScheduleCandidates } from "~/modules/creditCards/application/credit-card-schedule-candidates";
import { materializeCreditCardSchedules } from "~/modules/creditCards/application/materialize-credit-card-schedules";
import { materializeAllRecurrences } from "~/modules/recurring/application/recurrences";
import { withWorkerCacheWrite } from "~/shared/infra/cache/worker-cache-write";
import { queryRaw } from "~/shared/infra/sql";
import { namespacesForEvent } from "./cache-invalidation";
import type { EventEnvelope } from "./events";
import {
	handleScheduleMaterialization,
	scheduleMaterializationEventType,
} from "./schedule-materialization-command";

/** Capture mutation scope before waiting for fences; newly created owners wait for the next command. */
export async function handleScopedScheduleMaterialization(event: EventEnvelope) {
	if (event.eventType !== scheduleMaterializationEventType)
		throw new Error(`Unsupported schedule materialization command: ${event.eventType}`);
	const asOf = (event.payload as { asOf?: string }).asOf;
	if (typeof asOf !== "string" || Number.isNaN(new Date(asOf).valueOf()))
		throw new Error("Schedule materialization command has invalid asOf");
	const cutoff = new Date(asOf);
	const [cards, recurrences] = await Promise.all([
		loadCreditCardScheduleCandidates(cutoff),
		queryRaw<{ userId: string }>(
			`SELECT DISTINCT "userId" FROM "Recurrence" WHERE "isActive" AND "materializedThrough"<$1::date`,
			[asOf.slice(0, 10)],
		),
	]);
	const owners = [...new Set([...cards.map(card => card.userId), ...recurrences.map(row => row.userId)])];
	if (!owners.length) return;
	const peers = await queryRaw<{ userId: string }>(
		`SELECT CASE WHEN "requesterId"=ANY($1) THEN "recipientId" ELSE "requesterId" END AS "userId" FROM "DebtConnection" WHERE "status" IN ('PENDING','ACCEPTED') AND ("requesterId"=ANY($1) OR "recipientId"=ANY($1))`,
		[owners],
	);
	const namespaces = namespacesForEvent({ ...event, aggregateType: "schedule" });
	namespaces.push("debts:events", "debts:overview");
	for (const card of cards) namespaces.push(`credit-cards:${card.id}:statements`);
	const cardIds = cards.map(card => card.id);
	const recurrenceOwners = recurrences.map(row => row.userId);
	await withWorkerCacheWrite([...owners, ...peers.map(row => row.userId)], [...new Set(namespaces)], () =>
		handleScheduleMaterialization(event, date =>
			Promise.all([
				materializeCreditCardSchedules(date, cardIds),
				materializeAllRecurrences(date, recurrenceOwners),
			]),
		),
	);
}
