import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const databaseTestUrl = process.env.DATABASE_TEST_URL;
const suite = databaseTestUrl ? describe : describe.skip;

let closeDatabase: typeof import("sql")["closeDatabase"];
let executeRaw: typeof import("sql")["executeRaw"];
let queryRaw: typeof import("sql")["queryRaw"];
let enqueueAccountYieldRecalculation: typeof import("../application/reference-rate-jobs")["enqueueAccountYieldRecalculation"];
let enqueueReferenceRateFetch: typeof import("../application/reference-rate-jobs")["enqueueReferenceRateFetch"];
let ensureReferenceRateBootstrapJobs: typeof import("../application/reference-rate-jobs")["ensureReferenceRateBootstrapJobs"];
let runNextReferenceRateJob: typeof import("../application/reference-rate-jobs")["runNextReferenceRateJob"];

const userId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const unrelatedAccountId = crypto.randomUUID();

suite("reference-rate jobs", () => {
	beforeAll(async () => {
		process.env.DATABASE_URL = databaseTestUrl!;
		process.env.NODE_ENV = "test";
		({ closeDatabase, executeRaw, queryRaw } = await import("sql"));
		({
			enqueueAccountYieldRecalculation,
			enqueueReferenceRateFetch,
			ensureReferenceRateBootstrapJobs,
			runNextReferenceRateJob,
		} = await import("../application/reference-rate-jobs"));
		await executeRaw('DELETE FROM "public"."ReferenceRateJob"');
		await executeRaw('DELETE FROM "public"."ReferenceRate"');
		await executeRaw('INSERT INTO "public"."user" ("id", "email", "name") VALUES ($1, $2, $3)', [
			userId,
			`reference-rate-${userId}@example.com`,
			"Reference rate worker",
		]);
		await executeRaw(
			'INSERT INTO "public"."FinancialAccount" ("id", "userId", "name", "type", "yieldReferenceType", "yieldReferencePercentage") VALUES ($1, $2, $3, $4, $5, $6)',
			[accountId, userId, "Reference rate account", "CHECKING", "CDI", 100],
		);
		await executeRaw(
			'INSERT INTO "public"."FinancialAccount" ("id", "userId", "name", "type") VALUES ($1, $2, $3, $4)',
			[unrelatedAccountId, userId, "Unrelated account", "CHECKING"],
		);
	});

	afterAll(async () => {
		await executeRaw('DELETE FROM "public"."ReferenceRateJob"');
		await executeRaw('DELETE FROM "public"."ReferenceRate"');
		await executeRaw('DELETE FROM "public"."user" WHERE "id" = $1', [userId]);
		await closeDatabase();
	});

	test("creates bootstrap jobs idempotently", async () => {
		await ensureReferenceRateBootstrapJobs();
		await ensureReferenceRateBootstrapJobs();
		expect(
			(await queryRaw<{ count: string }>('SELECT count(*) FROM "public"."ReferenceRateJob"'))[0]?.count,
		).toBe("2");
		await executeRaw('DELETE FROM "public"."ReferenceRateJob"');
	});

	test("prioritizes fetching, persists rates, and creates one fanout job per account", async () => {
		await enqueueAccountYieldRecalculation(accountId, new Date("2020-01-01T12:00:00"), "priority-test");
		await enqueueReferenceRateFetch(
			"CDI",
			new Date("2026-09-16T12:00:00"),
			new Date("2026-09-17T12:00:00"),
			"e2e:fetch-success",
		);
		await runNextReferenceRateJob(async () => [
			{ date: new Date("2026-09-16T12:00:00"), value: 0.05 },
			{ date: new Date("2026-09-17T12:00:00"), value: 0.06 },
		]);
		expect(
			await queryRaw('SELECT "date", "value" FROM "public"."ReferenceRate" ORDER BY "date"'),
		).toHaveLength(2);
		const fetchJob = (
			await queryRaw<{ completedAt: Date | null }>(
				'SELECT "completedAt" FROM "public"."ReferenceRateJob" WHERE "deduplicationKey" = $1',
				["e2e:fetch-success"],
			)
		)[0];
		expect(fetchJob?.completedAt).toBeInstanceOf(Date);
		const fanout = await queryRaw<{ fromDate: Date }>(
			'SELECT "fromDate" FROM "public"."ReferenceRateJob" WHERE "deduplicationKey" LIKE $1',
			["fetch:e2e:fetch-success:%"],
		);
		expect(fanout).toHaveLength(1);
		expect(fanout[0]?.fromDate.toISOString().slice(0, 10)).toBe("2026-09-16");
		await executeRaw('DELETE FROM "public"."ReferenceRateJob"');
		await executeRaw('DELETE FROM "public"."ReferenceRate"');
	});

	test("rolls back rates and schedules retry when fanout transaction fails", async () => {
		await enqueueReferenceRateFetch(
			"SELIC",
			new Date("2026-09-16T12:00:00"),
			new Date("2026-09-17T12:00:00"),
			"e2e:fetch-rollback",
		);
		await runNextReferenceRateJob(async () => [
			{ date: new Date("2026-09-16T12:00:00"), value: 0.05 },
			{ date: new Date("2026-09-17T12:00:00"), value: 1e100 },
		]);
		expect(
			(await queryRaw<{ count: string }>('SELECT count(*) FROM "public"."ReferenceRate"'))[0]?.count,
		).toBe("0");
		expect(
			(
				await queryRaw<{ attempts: number; lastError: string | null }>(
					'SELECT "attempts", "lastError" FROM "public"."ReferenceRateJob" WHERE "deduplicationKey" = $1',
					["e2e:fetch-rollback"],
				)
			)[0],
		).toMatchObject({ attempts: 1, lastError: expect.any(String) });
	});
});
