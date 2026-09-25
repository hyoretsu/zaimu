import type { EventEnvelope } from "~/shared/application/events";
import type { EventBrokerPort } from "~/shared/application/ports";
import { materializeCreditCardSchedules } from "./materialize-credit-card-schedules";

export const scheduleMaterializationEventType = "schedule.materialize";

interface ScheduleMaterializationPayload {
	asOf: string;
}

export async function publishScheduleMaterialization(broker: EventBrokerPort, now = new Date()) {
	const cutoff = new Date(now);
	cutoff.setUTCSeconds(0, 0);
	const asOf = cutoff.toISOString();
	const commandId = `schedule-materialization:${asOf}`;
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
	materialize: (asOf: Date) => Promise<unknown> = materializeCreditCardSchedules,
) {
	if (event.eventType !== scheduleMaterializationEventType)
		throw new Error(`Unsupported schedule materialization command: ${event.eventType}`);
	const { asOf } = event.payload as Partial<ScheduleMaterializationPayload>;
	if (typeof asOf !== "string") throw new Error("Schedule materialization command requires asOf");
	const date = new Date(asOf);
	if (Number.isNaN(date.getTime())) throw new Error("Schedule materialization command has invalid asOf");
	await materialize(date);
}
