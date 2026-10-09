import { executeRaw, queryRaw } from "sql";
import type { EventEnvelope } from "~/shared/application/events";
import type { OutboxPort } from "~/shared/application/ports";

export interface PendingOutboxEvent extends EventEnvelope {
	attempts: number;
}

export class PostgresOutbox implements OutboxPort {
	async append(event: EventEnvelope) {
		await executeRaw(
			`INSERT INTO "public"."OutboxEvent" ("id", "eventType", "aggregateType", "aggregateId", "userIds", "occurredAt", "schemaVersion", "correlationId", "payload")
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) ON CONFLICT ("id") DO NOTHING`,
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
			],
		);
	}
	async appendMany(events: EventEnvelope[]) {
		if (!events.length) return;
		await executeRaw(
			`INSERT INTO "public"."OutboxEvent" ("id", "eventType", "aggregateType", "aggregateId", "userIds", "occurredAt", "schemaVersion", "correlationId", "payload")
			 SELECT "eventId", "eventType", "aggregateType", "aggregateId", "userIds", "occurredAt", "schemaVersion", "correlationId", "payload"
			 FROM jsonb_to_recordset($1::jsonb) AS events("eventId" varchar, "eventType" varchar, "aggregateType" varchar, "aggregateId" varchar, "userIds" varchar[], "occurredAt" timestamptz, "schemaVersion" integer, "correlationId" varchar, "payload" jsonb)
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
				event."userIds", event."occurredAt", event."schemaVersion", event."correlationId", event."payload", event."attempts"`,
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
