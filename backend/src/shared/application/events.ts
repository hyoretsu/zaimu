export interface EventEnvelope<Payload = unknown> {
	aggregateId: string;
	aggregateType: string;
	correlationId: string;
	eventId: string;
	eventType: string;
	occurredAt: string;
	payload: Payload;
	schemaVersion: number;
	userIds: string[];
}

export const createEventEnvelope = <Payload>(
	event: Omit<EventEnvelope<Payload>, "eventId" | "occurredAt" | "schemaVersion"> &
		Partial<Pick<EventEnvelope<Payload>, "eventId" | "occurredAt" | "schemaVersion">>,
): EventEnvelope<Payload> => ({
	...event,
	eventId: event.eventId ?? crypto.randomUUID(),
	occurredAt: event.occurredAt ?? new Date().toISOString(),
	schemaVersion: event.schemaVersion ?? 1,
});
