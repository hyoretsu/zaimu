import { executeRaw, queryRaw } from "sql";
import type { EventEnvelope } from "~/shared/application/events";
import type { OutboxPort } from "~/shared/application/ports";

export interface PendingOutboxEvent extends EventEnvelope {
	attempts: number;
}

const traceColumnEnabled = () => process.env.OTEL_OUTBOX_CONTEXT_ENABLED === "true";

export class PostgresOutbox implements OutboxPort {
	async backlog() {
		const rows = await queryRaw<{ count: string }>(
			'SELECT count(*)::text AS count FROM "public"."OutboxEvent" WHERE "publishedAt" IS NULL',
		);
		return Number(rows[0]?.count ?? 0);
	}
	async append(event: EventEnvelope) {
		await executeRaw(
			`INSERT INTO "public"."OutboxEvent" ("id", "eventType", "aggregateType", "aggregateId", "userIds", "occurredAt", "schemaVersion", "correlationId", "payload"${traceColumnEnabled() ? ', "telemetryContext"' : ""})
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb${traceColumnEnabled() ? ", $10::jsonb" : ""}) ON CONFLICT ("id") DO NOTHING`,
			[
				event.eventId,
				event.eventType,
				event.aggregateType,
				event.aggregateId,
				event.userIds,
				event.occurredAt,
				event.schemaVersion,
				event.correlationId,
				JSON.stringify(event.payload),
				...(traceColumnEnabled() ? [JSON.stringify(event.telemetryContext ?? null)] : []),
			],
		);
	}
	async appendMany(events: EventEnvelope[]) {
		if (!events.length) return;
		await executeRaw(
			`INSERT INTO "public"."OutboxEvent" ("id", "eventType", "aggregateType", "aggregateId", "userIds", "occurredAt", "schemaVersion", "correlationId", "payload"${traceColumnEnabled() ? ', "telemetryContext"' : ""})
			 SELECT "eventId", "eventType", "aggregateType", "aggregateId", "userIds", "occurredAt", "schemaVersion", "correlationId", "payload"${traceColumnEnabled() ? ', "telemetryContext"' : ""}
			 FROM jsonb_to_recordset($1::jsonb) AS events("eventId" varchar, "eventType" varchar, "aggregateType" varchar, "aggregateId" varchar, "userIds" varchar[], "occurredAt" timestamptz, "schemaVersion" integer, "correlationId" varchar, "payload" jsonb${traceColumnEnabled() ? ', "telemetryContext" jsonb' : ""})
			 ON CONFLICT ("id") DO NOTHING`,
			[JSON.stringify(events)],
		);
	}
	async markPublished(eventId: string) {
		await executeRaw(
			`UPDATE "public"."OutboxEvent" SET "publishedAt" = now(), "lockedUntil" = NULL, "updatedAt" = now() WHERE "id" = $1`,
			[eventId],
		);
	}
	async claim(limit = 100, leaseMs = 30_000): Promise<PendingOutboxEvent[]> {
		const rows = await queryRaw<{
			aggregateId: string;
			aggregateType: string;
			attempts: number;
			correlationId: string;
			eventId: string;
			eventType: string;
			occurredAt: Date;
			telemetryContext?: Record<string, string>;
			payload: unknown;
			schemaVersion: number;
			userIds: string[];
		}>(
			`WITH candidates AS (
				SELECT "id" FROM "public"."OutboxEvent"
				WHERE "publishedAt" IS NULL AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
				ORDER BY "occurredAt", "id" LIMIT $1 FOR UPDATE SKIP LOCKED
			) UPDATE "public"."OutboxEvent" event
			SET "lockedUntil" = now() + ($2 * interval '1 millisecond'), "attempts" = "attempts" + 1, "updatedAt" = now()
			FROM candidates WHERE event."id" = candidates."id"
			RETURNING event."id" AS "eventId", event."eventType", event."aggregateType", event."aggregateId",
				event."userIds", event."occurredAt", event."schemaVersion", event."correlationId", event."payload", event."attempts"${traceColumnEnabled() ? ', event."telemetryContext"' : ""}`,
			[limit, leaseMs],
		);
		return rows.map(row => ({ ...row, occurredAt: row.occurredAt.toISOString() }));
	}
	async release(eventId: string, error: unknown) {
		await executeRaw(
			`UPDATE "public"."OutboxEvent" SET "lockedUntil" = NULL, "lastError" = $2, "updatedAt" = now() WHERE "id" = $1`,
			[eventId, error instanceof Error ? error.message : String(error)],
		);
	}
}
