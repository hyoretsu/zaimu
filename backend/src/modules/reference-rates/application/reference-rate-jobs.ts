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
	completeHistoryUnit,
	requestHistoryCollection,
	runHistoryUnit,
} from "~/modules/financial-history/application/history-collections";
import { createEventEnvelope, type EventEnvelope } from "~/shared/application/events";
import { PostgresOutbox } from "~/shared/infra/outbox";
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
import { referenceRateInsertSql } from "../domain/reference-rate-insert-sql";

type FetchReferenceRates = typeof fetchBcbReferenceRates;
interface ClaimedJob {
	deduplicationKey: string;
	endDate: Date | null;
	financialAccountId: string | null;
	fromDate: Date | null;
	referenceType: ReferenceRateType | null;
	startDate: Date | null;
}
const schedulerTimezone = "America/Recife";
const dateKey = (date: Date) => format(date, "yyyy-MM-dd");
const outbox = new PostgresOutbox();
const commandId = (key: string) => {
	const value = new Bun.CryptoHasher("sha256").update(key).digest("hex").slice(0, 32);
	return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};

async function appendCommand(
	routingKey: "account-yield-recalculation" | "reference-rate-fetch",
	deduplicationKey: string,
	aggregateId: string,
	payload: Record<string, unknown>,
) {
	const id = commandId(`${routingKey}:${deduplicationKey}`);
	await outbox.append(
		createEventEnvelope({
			aggregateId,
			aggregateType: "referenceRate",
			correlationId: id,
			eventId: id,
			eventType: `command.${routingKey}`,
			payload,
			userIds: [],
		}),
	);
}

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
	await appendCommand("reference-rate-fetch", deduplicationKey, type, {
		deduplicationKey,
		endDate: dateKey(endDate),
		referenceType: type,
		startDate: dateKey(startDate),
	});
}
export async function enqueueAccountYieldRecalculation(accountId: string, fromDate: Date, cause: string) {
	const deduplicationKey = `account:${accountId}:${dateKey(fromDate)}:${cause}`;
	await appendCommand("account-yield-recalculation", deduplicationKey, accountId, {
		deduplicationKey,
		financialAccountId: accountId,
		fromDate: dateKey(fromDate),
	});
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
export async function ensureReferenceRateBootstrapJobs(now = new Date()) {
	return requestHistoryCollection("INTEREST", ["CDI", "SELIC"], dateKey(schedulerClock(now).date));
}
export async function enqueueDailyReferenceRateFetches(now = new Date()) {
	const clock = schedulerClock(now);
	const reference = clock.hour >= 6 ? clock.date : subDays(clock.date, 1);
	return requestHistoryCollection("INTEREST", ["CDI", "SELIC"], dateKey(reference));
}
async function processFetchJob(
	job: ClaimedJob,
	fetchRates: FetchReferenceRates,
	preserveExisting = false,
	history?: { id: string; assertLease: () => Promise<void> },
) {
	if (!job.referenceType || !job.startDate || !job.endDate) throw new Error("Job de taxa incompleto");
	const { referenceType, startDate, endDate } = job;
	const rates = await fetchRates(referenceType, startDate, endDate);
	return withRawTransaction(async query => {
		if (history) await history.assertLease();
		let earliestChangedDate: Date | null = null;
		for (const rate of rates) {
			const changed = await query<{ id: string }>(referenceRateInsertSql(preserveExisting), [
				referenceType,
				dateKey(rate.date),
				rate.value,
			]);
			if (changed.length > 0 && (!earliestChangedDate || rate.date < earliestChangedDate))
				earliestChangedDate = rate.date;
		}
		if (earliestChangedDate) {
			const accounts = await queryRaw<{ id: string }>(
				`SELECT account."id" FROM "public"."FinancialAccount" account
			 WHERE account."type" <> 'CREDIT_CARD' AND (
			 account."yieldReferenceType" = $1::"ReferenceRateType"
			 OR EXISTS (SELECT 1 FROM "public"."FinancialAccountYieldRateHistory" history WHERE history."financialAccountId" = account."id" AND history."yieldReferenceType" = $1::"ReferenceRateType")
			 OR EXISTS (SELECT 1 FROM "public"."FinancialInstitutionYieldRule" rule INNER JOIN "public"."FinancialInstitutionYieldPolicy" policy ON policy."id" = rule."financialYieldPolicyId" WHERE policy."financialInstitutionId" = account."institutionId" AND rule."yieldReferenceType" = $1::"ReferenceRateType"))`,
				[referenceType],
			);
			await Promise.all(
				accounts.map(account =>
					enqueueAccountYieldRecalculation(account.id, earliestChangedDate, `fetch:${job.deduplicationKey}`),
				),
			);
		}
		await outbox.append(
			createEventEnvelope({
				aggregateId: referenceType,
				aggregateType: "referenceRate",
				correlationId: commandId(job.deduplicationKey),
				eventId: commandId(`completed:${job.deduplicationKey}`),
				eventType: "referenceRate.historyFetched",
				payload: {
					endDate: dateKey(endDate),
					referenceType,
					startDate: dateKey(startDate),
				},
				userIds: [],
			}),
		);
		if (history) await completeHistoryUnit(history.id, rates.length ? "COMPLETED" : "NO_DATA");
		return rates.length;
	});
}
export async function loadYieldAccounts(accountIds: string[]): Promise<YieldAccount[]> {
	if (!accountIds.length) return [];
	const accounts = await queryRows(
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
			.where((fields, functions) => functions.in(fields.id, accountIds))
			.build(),
	);
	const histories = await queryRows(
		db.sql.public.FinancialAccountYieldRateHistory.select(
			"financialAccountId",
			"effectiveDate",
			"yieldFixedRate",
			"yieldPeriod",
			"yieldReferencePercentage",
			"yieldReferenceType",
			"yieldTaxRate",
		)
			.where((fields, functions) => functions.in(fields.financialAccountId, accountIds))
			.build(),
	);
	const policies = await getFinancialInstitutionYieldPolicies([
		...new Set(accounts.flatMap(account => (account.institutionId ? [account.institutionId] : []))),
	]);
	const historiesByAccount = Map.groupBy(histories, history => history.financialAccountId);

	return accounts.map(account => ({
		...account,
		institutionYieldPolicies: account.institutionId ? (policies.get(account.institutionId) ?? []) : [],
		yieldPeriod: account.yieldPeriod as null | YieldPeriod,
		yieldRateHistories: (historiesByAccount.get(account.id) ?? []).map(history => ({
			...history,
			yieldPeriod: history.yieldPeriod as null | YieldPeriod,
			yieldReferenceType: history.yieldReferenceType as ReferenceRateType | null,
		})),
		yieldReferenceType: account.yieldReferenceType as ReferenceRateType | null,
	}));
}
export async function loadYieldAccount(accountId: string): Promise<YieldAccount | null> {
	return (await loadYieldAccounts([accountId]))[0] ?? null;
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
	await outbox.append(
		createEventEnvelope({
			aggregateId: account.id,
			aggregateType: "financialAccount",
			correlationId: commandId(job.deduplicationKey),
			eventType: "yieldRecalculated",
			payload: { fromDate: dateKey(fromDate) },
			userIds: [(account as YieldAccount & { userId: string }).userId],
		}),
	);
}

const requiredString = (payload: unknown, key: string) => {
	const value = (payload as Record<string, unknown> | null)?.[key];
	if (typeof value !== "string" || value.length === 0) throw new Error(`Comando requer ${key}`);
	return value;
};

export async function handleReferenceRateFetchCommand(
	event: EventEnvelope,
	fetchRates: FetchReferenceRates = fetchBcbReferenceRates,
	options: { preserveExisting?: boolean } = {},
) {
	const rawReferenceType = requiredString(event.payload, "referenceType");
	if (rawReferenceType !== "CDI" && rawReferenceType !== "SELIC") throw new Error("Tipo de taxa inválido");
	const referenceType: ReferenceRateType = rawReferenceType;
	const job = {
		deduplicationKey: requiredString(event.payload, "deduplicationKey"),
		endDate: new Date(`${requiredString(event.payload, "endDate")}T12:00:00`),
		financialAccountId: null,
		fromDate: null,
		referenceType,
		startDate: new Date(`${requiredString(event.payload, "startDate")}T12:00:00`),
	};
	if ((event.payload as { unitId?: string }).unitId) {
		return runHistoryUnit(event, async (unit, assertLease) => {
			const count = await processFetchJob(job, fetchRates, options.preserveExisting, {
				assertLease,
				id: unit.id,
			});
			return count ? "COMPLETED" : "NO_DATA";
		});
	}
	return processFetchJob(job, fetchRates, options.preserveExisting);
}

export async function handleAccountYieldRecalculationCommand(event: EventEnvelope) {
	return processAccountRecalculation({
		deduplicationKey: requiredString(event.payload, "deduplicationKey"),
		endDate: null,
		financialAccountId: requiredString(event.payload, "financialAccountId"),
		fromDate: new Date(`${requiredString(event.payload, "fromDate")}T12:00:00`),
		referenceType: null,
		startDate: null,
	});
}
