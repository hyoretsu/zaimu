import { createHash } from "node:crypto";
import { serviceNamespace } from "~/shared/infra/service-namespace";
import { queryRaw } from "~/shared/infra/sql";

export function providerSlotKey(providerName: string) {
	const name = `${serviceNamespace()}:${providerName}`;
	// Preserve existing short keys; hash longer namespaces to fit the database contract.
	return name.length <= 40 ? name : createHash("sha256").update(name).digest("hex").slice(0, 40);
}

/** Database lease slots cap provider requests across replicas, independently of Rabbit prefetch. */
export async function withProviderSlot<T>(
	providerName: string,
	capacity: number,
	operation: () => Promise<T>,
): Promise<T> {
	const provider = providerSlotKey(providerName);
	await queryRaw(
		`INSERT INTO "FinancialProviderSlot" ("provider","slot") SELECT $1,slot FROM generate_series(1,$2::int) slot ON CONFLICT DO NOTHING`,
		[provider, capacity],
	);
	const token = crypto.randomUUID();
	const [slot] = await queryRaw<{ slot: number }>(
		`WITH candidate AS (SELECT "provider","slot" FROM "FinancialProviderSlot" WHERE "provider"=$1 AND "slot"<=$3 AND ("lockedUntil" IS NULL OR "lockedUntil"<now()) ORDER BY "slot" LIMIT 1 FOR UPDATE SKIP LOCKED)
	 UPDATE "FinancialProviderSlot" SET "leaseToken"=$2,"lockedUntil"=now()+interval '90 seconds' WHERE ("provider","slot") IN (SELECT "provider","slot" FROM candidate) RETURNING "slot"`,
		[provider, token, capacity],
	);
	if (!slot) {
		const error = new Error("Limite de consultas do provedor ocupado") as Error & { retryAfterMs: number };
		error.retryAfterMs = 5_000;
		throw error;
	}
	const heartbeat = setInterval(() => {
		void queryRaw(
			`UPDATE "FinancialProviderSlot" SET "lockedUntil"=now()+interval '90 seconds' WHERE "provider"=$1 AND "slot"=$2 AND "leaseToken"=$3 AND "lockedUntil">now()`,
			[provider, slot.slot, token],
		).catch(() => undefined);
	}, 20_000);
	try {
		return await operation();
	} finally {
		clearInterval(heartbeat);
		await queryRaw(
			`UPDATE "FinancialProviderSlot" SET "lockedUntil"=NULL,"leaseToken"=NULL WHERE "provider"=$1 AND "slot"=$2 AND "leaseToken"=$3`,
			[provider, slot.slot, token],
		);
	}
}
