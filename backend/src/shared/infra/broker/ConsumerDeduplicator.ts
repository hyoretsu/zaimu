import { executeRaw, queryRaw } from "sql";

export class ConsumerDeduplicator {
	async claim(consumer: string, eventId: string, leaseMs = 30_000) {
		const rows = await queryRaw<{ claimed: boolean }>(
			`INSERT INTO "public"."ConsumerReceipt" ("consumer", "eventId", "lockedUntil")
			 VALUES ($1, $2, now() + ($3 * interval '1 millisecond'))
			 ON CONFLICT ("consumer", "eventId") DO UPDATE SET
			   "lockedUntil" = EXCLUDED."lockedUntil", "updatedAt" = now()
			 WHERE "ConsumerReceipt"."completedAt" IS NULL
			   AND ("ConsumerReceipt"."lockedUntil" IS NULL OR "ConsumerReceipt"."lockedUntil" < now())
			 RETURNING true AS "claimed"`,
			[consumer, eventId, leaseMs],
		);
		if (rows[0]?.claimed) return "claimed" as const;
		const existing = await queryRaw<{ completedAt: Date | null }>(
			`SELECT "completedAt" FROM "public"."ConsumerReceipt" WHERE "consumer" = $1 AND "eventId" = $2`,
			[consumer, eventId],
		);
		return existing[0]?.completedAt ? ("completed" as const) : ("busy" as const);
	}
	async complete(consumer: string, eventId: string) {
		await executeRaw(
			`UPDATE "public"."ConsumerReceipt" SET "completedAt" = now(), "lockedUntil" = NULL, "updatedAt" = now()
			 WHERE "consumer" = $1 AND "eventId" = $2`,
			[consumer, eventId],
		);
	}
	async release(consumer: string, eventId: string, error: unknown) {
		await executeRaw(
			`UPDATE "public"."ConsumerReceipt" SET "lockedUntil" = NULL, "lastError" = $3,
			 "attempts" = "attempts" + 1, "updatedAt" = now()
			 WHERE "consumer" = $1 AND "eventId" = $2`,
			[consumer, eventId, error instanceof Error ? error.message : String(error)],
		);
	}
}
