import { addDays, format, isWeekend, startOfDay, subDays } from "date-fns";
import { getFinancialAccountBalances } from "~/modules/accounts/application/get-financial-account-balances";
import { getFinancialInstitutionYieldPolicies } from "~/modules/accounts/application/get-financial-institution-yield-policies";
import {
	calculateGrossYield,
	getYieldSettings,
	type ReferenceRateType,
	settingsRequireReference,
	type YieldAccount,
	type YieldPeriod,
} from "~/modules/accounts/domain/calculate-financial-account-yields";
import {
	db,
	executeRaw,
	executeStatement,
	numeric,
	queryFirst,
	queryRaw,
	queryRows,
	withRawTransaction,
} from "~/shared/infra/sql";
import { fetchBcbReferenceRates } from "../domain/bcb-reference-rates";

type JobKind = "FETCH_RATES" | "RECALCULATE_ACCOUNT";
interface ClaimedJob {
	[key: string]: unknown;
	attempts: number;
	deduplicationKey: string;
	endDate: Date | null;
	financialAccountId: string | null;
	fromDate: Date | null;
	id: string;
	kind: JobKind;
	referenceType: ReferenceRateType | null;
	startDate: Date | null;
}
const schedulerTimezone = "America/Recife";
const leaseMilliseconds = 10 * 60_000;
const retryMinutes = [1, 5, 15, 60, 360];
const dateKey = (date: Date) => format(date, "yyyy-MM-dd");

function schedulerClock(now = new Date()) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		day: "2-digit",
		hour: "2-digit",
		hourCycle: "h23",
		month: "2-digit",
		timeZone: schedulerTimezone,
		year: "numeric",
	}).formatToParts(now);
	const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
	return {
		date: new Date(`${values.year}-${values.month}-${values.day}T12:00:00`),
		hour: Number(values.hour),
	};
}

export async function enqueueReferenceRateFetch(
	type: ReferenceRateType,
	startDate: Date,
	endDate: Date,
	deduplicationKey: string,
) {
	await executeRaw(
		`INSERT INTO "public"."ReferenceRateJob" ("kind", "deduplicationKey", "referenceType", "startDate", "endDate") VALUES ('FETCH_RATES', $1, $2, $3, $4) ON CONFLICT ("deduplicationKey") DO NOTHING`,
		[deduplicationKey, type, dateKey(startDate), dateKey(endDate)],
	);
}
export async function enqueueAccountYieldRecalculation(accountId: string, fromDate: Date, cause: string) {
	await executeRaw(
		`INSERT INTO "public"."ReferenceRateJob" ("kind", "deduplicationKey", "financialAccountId", "fromDate") VALUES ('RECALCULATE_ACCOUNT', $1, $2, $3) ON CONFLICT ("deduplicationKey") DO NOTHING`,
		[`account:${accountId}:${dateKey(fromDate)}:${cause}`, accountId, dateKey(fromDate)],
	);
}
export async function enqueueUserYieldRecalculations(userId: string, fromDate: Date, cause: string) {
	const accounts = await queryRows(
		db.sql.public.FinancialAccount.select("id")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.userId, userId),
					functions.raw`${fields.type} <> 'CREDIT_CARD'`.returns("pg/bool@1"),
				),
			)
			.build(),
	);
	for (const account of accounts) await enqueueAccountYieldRecalculation(account.id, fromDate, cause);
}
async function enqueueDailyFetches(now = new Date()) {
	const clock = schedulerClock(now);
	const scheduleDate = clock.hour >= 6 ? clock.date : subDays(clock.date, 1);
	const endDate = subDays(scheduleDate, 1);
	const startDate = subDays(endDate, 6);
	for (const type of ["CDI", "SELIC"] as const)
		await enqueueReferenceRateFetch(type, startDate, endDate, `daily:${type}:${dateKey(scheduleDate)}`);
}
async function claimJob() {
	const [job] = await queryRaw<ClaimedJob>(
		`WITH candidate AS (SELECT "id" FROM "public"."ReferenceRateJob" WHERE "availableAt" <= now() AND "completedAt" IS NULL AND ("lockedUntil" IS NULL OR "lockedUntil" < now()) ORDER BY "availableAt", "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE "public"."ReferenceRateJob" AS job SET "lockedUntil" = now() + ($1 * interval '1 millisecond'), "updatedAt" = now() FROM candidate WHERE job."id" = candidate."id" RETURNING job."id", job."kind", job."deduplicationKey", job."referenceType", job."startDate", job."endDate", job."financialAccountId", job."fromDate", job."attempts"`,
		[leaseMilliseconds],
	);
	return job;
}
async function processFetchJob(job: ClaimedJob) {
	if (!job.referenceType || !job.startDate || !job.endDate) throw new Error("Job de taxa incompleto");
	const rates = await fetchBcbReferenceRates(job.referenceType, job.startDate, job.endDate);
	await withRawTransaction(async query => {
		for (const rate of rates) {
			const changed = await query<{ id: string }>(
				`INSERT INTO "public"."ReferenceRate" ("type", "date", "value") VALUES ($1, $2, $3) ON CONFLICT ("type", "date") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now() WHERE "ReferenceRate"."value" IS DISTINCT FROM EXCLUDED."value" RETURNING "id"`,
				[job.referenceType, dateKey(rate.date), rate.value],
			);
			if (changed.length === 0) continue;
			await query(
				`INSERT INTO "public"."ReferenceRateJob" ("kind", "deduplicationKey", "financialAccountId", "fromDate") SELECT 'RECALCULATE_ACCOUNT', 'rate:' || $1 || ':' || $2 || ':' || $3 || ':' || account."id", account."id", $2 FROM "public"."FinancialAccount" account WHERE account."type" <> 'CREDIT_CARD' ON CONFLICT ("deduplicationKey") DO NOTHING`,
				[job.referenceType, dateKey(rate.date), String(rate.value)],
			);
		}
		await query(
			`INSERT INTO "public"."ReferenceRateJob" ("kind", "deduplicationKey", "financialAccountId", "fromDate") SELECT 'RECALCULATE_ACCOUNT', 'audit:' || $1 || ':' || account."id", account."id", $2 FROM "public"."FinancialAccount" account WHERE account."type" <> 'CREDIT_CARD' ON CONFLICT ("deduplicationKey") DO NOTHING`,
			[job.deduplicationKey, dateKey(job.startDate!)],
		);
	});
}
async function loadYieldAccount(accountId: string): Promise<YieldAccount | null> {
	const account = await queryFirst(
		db.sql.public.FinancialAccount.select(
			"id",
			"institutionId",
			"userId",
			"type",
			"createdAt",
			"yieldFixedRate",
			"yieldPeriod",
			"yieldReferencePercentage",
			"yieldReferenceType",
			"yieldTaxRate",
		)
			.where((fields, functions) => functions.eq(fields.id, accountId))
			.limit(1)
			.build(),
	);
	if (!account) return null;
	const histories = await queryRows(
		db.sql.public.FinancialAccountYieldRateHistory.select(
			"effectiveDate",
			"yieldFixedRate",
			"yieldPeriod",
			"yieldReferencePercentage",
			"yieldReferenceType",
			"yieldTaxRate",
		)
			.where((fields, functions) => functions.eq(fields.financialAccountId, accountId))
			.build(),
	);
	const policies = account.institutionId
		? await getFinancialInstitutionYieldPolicies([account.institutionId])
		: new Map();
	return {
		...account,
		institutionYieldPolicies: account.institutionId ? (policies.get(account.institutionId) ?? []) : [],
		yieldPeriod: account.yieldPeriod as null | YieldPeriod,
		yieldRateHistories: histories.map(history => ({
			...history,
			yieldPeriod: history.yieldPeriod as null | YieldPeriod,
			yieldReferenceType: history.yieldReferenceType as ReferenceRateType | null,
		})),
		yieldReferenceType: account.yieldReferenceType as ReferenceRateType | null,
	};
}
function requiredReferenceTypes(settings: ReturnType<typeof getYieldSettings>) {
	if (!settings) return [];
	const types =
		"rules" in settings
			? settings.rules.flatMap(rule => (rule.yieldReferenceType ? [rule.yieldReferenceType] : []))
			: settings.yieldReferenceType
				? [settings.yieldReferenceType]
				: [];
	return [...new Set(types)];
}
async function processAccountRecalculation(job: ClaimedJob) {
	if (!job.financialAccountId || !job.fromDate) throw new Error("Job de recálculo incompleto");
	const account = await loadYieldAccount(job.financialAccountId);
	if (!account) return;
	const fromDate = startOfDay(job.fromDate > account.createdAt ? job.fromDate : account.createdAt);
	const [{ latest }] = await queryRaw<{ latest: Date | null }>(
		`SELECT max("date") AS latest FROM "public"."ReferenceRate"`,
	);
	if (!latest || fromDate > latest) return;
	await executeRaw(
		`DELETE FROM "public"."FinancialAccountYield" WHERE "financialAccountId" = $1 AND "kind" = 'AUTOMATIC' AND "origin" = 'SYSTEM' AND "date" >= $2`,
		[account.id, dateKey(fromDate)],
	);
	const holidays = await queryRows(
		db.sql.public.FinancialAccountYieldHoliday.select("date")
			.where((fields, functions) =>
				functions.eq(fields.userId, (account as YieldAccount & { userId: string }).userId),
			)
			.build(),
	);
	const holidayKeys = new Set(holidays.map(holiday => dateKey(holiday.date)));
	for (let day = fromDate; day <= latest; day = addDays(day, 1)) {
		const key = dateKey(day);
		if (isWeekend(day) || holidayKeys.has(key)) continue;
		const settings = getYieldSettings(account, key);
		if (!settingsRequireReference(settings)) continue;
		const types = requiredReferenceTypes(settings);
		const rows = await queryRaw<{ type: ReferenceRateType; value: string }>(
			`SELECT "type", "value" FROM "public"."ReferenceRate" WHERE "date" = $1 AND "type" = ANY($2::"ReferenceRateType"[])`,
			[key, types],
		);
		if (rows.length !== types.length) continue;
		const override = await queryFirst(
			db.sql.public.FinancialAccountYield.select("id")
				.where((fields, functions) =>
					functions.and(
						functions.eq(fields.financialAccountId, account.id),
						functions.eq(fields.date, day),
						functions.eq(fields.kind, "AUTOMATIC"),
						functions.eq(fields.origin, "USER"),
					),
				)
				.limit(1)
				.build(),
		);
		if (override) continue;
		const balanceAtDay = (await getFinancialAccountBalances([account.id], day)).get(account.id) ?? 0;
		const manual = await queryRaw<{ amount: string }>(
			`SELECT "amount" FROM "public"."FinancialAccountYield" WHERE "financialAccountId" = $1 AND "date" = $2 AND "kind" = 'MANUAL' AND NOT "isExcluded"`,
			[account.id, key],
		);
		const balance = balanceAtDay - manual.reduce((total, entry) => total + Number(entry.amount), 0);
		if (balance <= 0) continue;
		const rates = Object.fromEntries(rows.map(row => [row.type, Number(row.value)]));
		const gross = calculateGrossYield(balance, settings, rates);
		const amount = Number((gross * (1 - (settings?.yieldTaxRate ?? 0) / 100)).toFixed(4));
		if (amount <= 0) continue;
		await executeStatement(
			db.sql.public.FinancialAccountYield.insert([
				{
					amount: numeric<12, 4>(amount),
					date: day,
					financialAccountId: account.id,
					isExcluded: false,
					kind: "AUTOMATIC",
					origin: "SYSTEM",
				},
			]).build(),
		);
	}
}
export function getReferenceRateRetryDelay(
	attempt: number,
	retryAfter: string | undefined,
	now = Date.now(),
) {
	if (retryAfter) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds)) return Math.max(60_000, seconds * 1000);
		const date = new Date(retryAfter);
		if (!Number.isNaN(date.valueOf())) return Math.max(60_000, date.valueOf() - now);
	}
	return (retryMinutes[attempt] ?? 24 * 60) * 60_000;
}
function retryDelay(job: ClaimedJob, error: unknown) {
	return getReferenceRateRetryDelay(
		job.attempts,
		error instanceof Error ? (error as Error & { retryAfter?: string }).retryAfter : undefined,
	);
}
export async function runNextReferenceRateJob() {
	const job = await claimJob();
	if (!job) return false;
	try {
		if (job.kind === "FETCH_RATES") await processFetchJob(job);
		else await processAccountRecalculation(job);
		await executeRaw(
			`UPDATE "public"."ReferenceRateJob" SET "completedAt" = now(), "lockedUntil" = NULL, "lastError" = NULL, "updatedAt" = now() WHERE "id" = $1`,
			[job.id],
		);
	} catch (error) {
		await executeRaw(
			`UPDATE "public"."ReferenceRateJob" SET "attempts" = "attempts" + 1, "availableAt" = $2, "lockedUntil" = NULL, "lastError" = $3, "updatedAt" = now() WHERE "id" = $1`,
			[
				job.id,
				new Date(Date.now() + retryDelay(job, error)),
				error instanceof Error ? error.message : String(error),
			],
		);
	}
	return true;
}
let workerStarted = false;
export function startReferenceRateWorker() {
	if (workerStarted || process.env.NODE_ENV === "test") return;
	workerStarted = true;
	const tick = async () => {
		try {
			await enqueueDailyFetches();
			while (await runNextReferenceRateJob()) {}
		} catch (error) {
			console.error("Reference-rate worker failed", error);
		} finally {
			setTimeout(tick, 60_000).unref();
		}
	};
	void tick();
}
