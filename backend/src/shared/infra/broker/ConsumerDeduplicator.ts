import { executeRaw, queryRaw } from "sql";

export class ConsumerDeduplicator {
	async claim(consumer: string, eventId: string, leaseMs = 90_000) {
		const token = crypto.randomUUID();
		const rows = await queryRaw<{ claimed: boolean }>(
			`INSERT INTO "public"."ConsumerReceipt" ("consumer", "eventId", "lockedUntil", "leaseToken")
			 VALUES ($1, $2, now() + ($3 * interval '1 millisecond'), $4)
			 ON CONFLICT ("consumer", "eventId") DO UPDATE SET
			   "lockedUntil" = EXCLUDED."lockedUntil", "leaseToken" = EXCLUDED."leaseToken", "updatedAt" = now()
			 WHERE "ConsumerReceipt"."completedAt" IS NULL
			   AND ("ConsumerReceipt"."lockedUntil" IS NULL OR "ConsumerReceipt"."lockedUntil" < now())
			 RETURNING true AS "claimed"`,
			[consumer, eventId, leaseMs, token],
		);
		if (rows[0]?.claimed) return { result: "claimed" as const, token };
		const existing = await queryRaw<{ completedAt: Date | null }>(
			`SELECT "completedAt" FROM "public"."ConsumerReceipt" WHERE "consumer" = $1 AND "eventId" = $2`,
			[consumer, eventId],
		);
		return existing[0]?.completedAt ? ("completed" as const) : ("busy" as const);
	}
	async complete(consumer: string, eventId: string, token?: string) {
		const rows = await queryRaw(
			`UPDATE "public"."ConsumerReceipt" SET "completedAt" = now(), "lockedUntil" = NULL, "updatedAt" = now()
			 WHERE "consumer" = $1 AND "eventId" = $2 AND "leaseToken" = $3 AND "lockedUntil" > now() RETURNING "eventId"`,
			[consumer, eventId, token],
		);
		if (!rows.length) throw new Error("Consumer receipt lease lost");
	}
	async release(consumer: string, eventId: string, error: unknown, token?: string) {
		await executeRaw(
			`UPDATE "public"."ConsumerReceipt" SET "lockedUntil" = NULL, "lastError" = $3,
			 "attempts" = "attempts" + 1, "updatedAt" = now()
			 WHERE "consumer" = $1 AND "eventId" = $2 AND "leaseToken" = $4`,
			[consumer, eventId, error instanceof Error ? error.message : String(error), token],
		);
	}
	async renew(consumer: string, eventId: string, token: string) {
		const rows = await queryRaw(
			`UPDATE "public"."ConsumerReceipt" SET "lockedUntil"=now()+interval '90 seconds',"updatedAt"=now() WHERE "consumer"=$1 AND "eventId"=$2 AND "leaseToken"=$3 AND "lockedUntil">now() AND "completedAt" IS NULL RETURNING "eventId"`,
			[consumer, eventId, token],
		);
		return rows.length > 0;
	}
}
