import { materializeCreditCardSchedules } from "~/modules/creditCards/application/materialize-credit-card-schedules";
import { materializeAllRecurrences } from "~/modules/recurring/application/recurrences";
import { PostgresOutbox } from "~/shared/infra/outbox";
import type { EventEnvelope } from "./events";
import { createEventEnvelope } from "./events";
import type { EventBrokerPort } from "./ports";

export const scheduleMaterializationEventType = "schedule.materialize";

interface ScheduleMaterializationPayload {
	asOf: string;
}

interface PublishScheduleMaterializationOptions {
	force?: boolean;
}

export async function publishScheduleMaterialization(
	broker: EventBrokerPort,
	now = new Date(),
	options: PublishScheduleMaterializationOptions = {},
) {
	const cutoff = new Date(now);
	cutoff.setUTCSeconds(0, 0);
	const asOf = cutoff.toISOString();
	const hash = new Bun.CryptoHasher("sha256")
		.update(`schedule-materialization:${asOf}`)
		.digest("hex")
		.slice(0, 32);
	const deterministicCommandId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
	const commandId = options.force ? crypto.randomUUID() : deterministicCommandId;
	await broker.publish("zaimu.commands", "schedule-materialization", {
		aggregateId: commandId,
		aggregateType: "schedule",
		correlationId: commandId,
		eventId: commandId,
		eventType: scheduleMaterializationEventType,
		occurredAt: asOf,
		payload: { asOf },
		schemaVersion: 1,
		userIds: [],
	});
}

export async function handleScheduleMaterialization(
	event: EventEnvelope,
	materialize: (asOf: Date) => Promise<Array<{ userIds: string[] }>> = async asOf =>
		Promise.all([materializeCreditCardSchedules(asOf), materializeAllRecurrences(asOf)]),
	appendEvent: (event: EventEnvelope) => Promise<void> = event => new PostgresOutbox().append(event),
) {
	if (event.eventType !== scheduleMaterializationEventType)
		throw new Error(`Unsupported schedule materialization command: ${event.eventType}`);
	const { asOf } = event.payload as Partial<ScheduleMaterializationPayload>;
	if (typeof asOf !== "string") throw new Error("Schedule materialization command requires asOf");
	const date = new Date(asOf);
	if (Number.isNaN(date.getTime())) throw new Error("Schedule materialization command has invalid asOf");
	const results = await materialize(date);
	const userIds = [...new Set(results.flatMap(result => result.userIds))];
	if (userIds.length > 0)
		await appendEvent(
			createEventEnvelope({
				aggregateId: event.aggregateId.slice(0, 36),
				aggregateType: "schedule",
				correlationId: event.correlationId,
				eventType: "materialized",
				payload: { asOf },
				userIds,
			}),
		);
}
