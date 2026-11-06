import { legacyCalendarHoliday } from "@zaimu/finance/projected-yield";
import { roundDailyYield, type YieldLot, YieldTaxLedger } from "@zaimu/finance/yield-tax";
import { addDays, format, isWeekend, max, startOfDay } from "date-fns";
import {
	balanceAdjustmentSourceVersion,
	reconcileBalanceAdjustments,
} from "~/modules/accounts/application/balance-adjustment-reconciliation";
import { loadFinancialAccountBalanceInput } from "~/modules/accounts/application/get-financial-account-balances";
import {
	calculateFinancialAccountYieldBalances,
	calculateGrossYield,
	getYieldSettings,
	type ReferenceRateType,
	type YieldAccount,
} from "~/modules/accounts/domain/calculate-financial-account-yields";
import {
	completeHistoryUnit,
	requestHistoryCollection,
	runHistoryUnit,
} from "~/modules/financial-history/application/history-collections";
import { referenceRateCoveredDaysSql } from "~/modules/financial-history/application/reference-rate-coverage-sql";
import { historyCoverageRanges } from "~/modules/financial-history/domain/collection";
import { loadTaxCatalog } from "~/modules/taxes/catalog";
import { getCountryHolidays } from "~/modules/yield-calendar/catalog";
import { ensureAccountCoverage } from "~/modules/yield-calendar/ensure-coverage";
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
import { referenceRateBatchInsertSql } from "../domain/reference-rate-insert-sql";
import { recentReferenceRateWindow, yieldSchedulerClock } from "../domain/yield-scheduler-clock";

type FetchReferenceRates = typeof fetchBcbReferenceRates;
interface ClaimedJob {
	deduplicationKey: string;
	endDate: Date | null;
	financialAccountId: string | null;
	fromDate: Date | null;
	referenceType: ReferenceRateType | null;
	startDate: Date | null;
}
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
/** Yield needs balance, which only comes from transactions, loan payments or balance adjustments. */
export async function accountFirstBalanceDate(accountId: string) {
	const [row] = await queryRaw<{ date: Date | null }>(
		`SELECT MIN("date") AS "date" FROM (
			SELECT "date" FROM "Transaction" WHERE "originFinancialAccountId"=$1 OR "destinationFinancialAccountId"=$1
			UNION ALL SELECT "date" FROM "BalanceAdjustment" WHERE "financialAccountId"=$1
			UNION ALL SELECT "paidDate" FROM "LoanPayment" WHERE "financialAccountId"=$1
		) movement`,
		[accountId],
	);
	return row?.date ?? null;
}
export async function enqueueAccountYieldRecalculation(
	accountId: string,
	fromDate: Date,
	cause: string,
	throughDate?: string,
) {
	const deduplicationKey = `account:${accountId}:${dateKey(fromDate)}:${cause}`;
	await appendCommand("account-yield-recalculation", deduplicationKey, accountId, {
		deduplicationKey,
		financialAccountId: accountId,
		fromDate: dateKey(fromDate),
		...(throughDate ? { throughDate } : {}),
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
	return requestHistoryCollection(
		"INTEREST",
		["CDI", "SELIC", "IPCA", "TR"],
		dateKey(yieldSchedulerClock(now).date),
	);
}
export async function enqueueDailyReferenceRateFetches(now = new Date()) {
	const window = recentReferenceRateWindow(now);
	if (!window) return;
	// Recent publications are provisional: historical coverage must never suppress this refresh.
	for (const type of ["CDI", "SELIC", "IPCA", "TR"] as const)
		await enqueueReferenceRateFetch(
			type,
			window.startDate,
			window.endDate,
			`recent:${type}:${window.slot}`,
		);
}
async function processFetchJob(
	job: ClaimedJob,
	fetchRates: FetchReferenceRates,
	preserveExisting = false,
	history?: { id: string; assertLease: () => Promise<void> },
) {
	if (!job.referenceType || !job.startDate || !job.endDate) throw new Error("Job de taxa incompleto");
	const { referenceType, startDate, endDate } = job;
	const covered = history
		? await queryRaw<{ date: string }>(referenceRateCoveredDaysSql, [
				referenceType,
				dateKey(startDate),
				dateKey(endDate),
			])
		: [];
	const ranges = history
		? historyCoverageRanges(
				dateKey(startDate),
				dateKey(endDate),
				new Set(covered.map(row => row.date)),
			).filter(range => !range.covered)
		: [{ endDate: dateKey(endDate), startDate: dateKey(startDate) }];
	const rates: Awaited<ReturnType<FetchReferenceRates>> = [];
	for (const range of ranges) {
		if (history) await history.assertLease();
		rates.push(
			...(await fetchRates(
				referenceType,
				new Date(`${range.startDate}T12:00:00`),
				new Date(`${range.endDate}T12:00:00`),
			)),
		);
	}
	return withRawTransaction(async query => {
		if (history) await history.assertLease();
		let earliestChangedDate: Date | null = null;
		for (let offset = 0; offset < rates.length; offset += 1000) {
			const changed = await query<{ date: string }>(referenceRateBatchInsertSql(preserveExisting), [
				referenceType,
				JSON.stringify(
					rates
						.slice(offset, offset + 1000)
						.map(rate => ({ date: dateKey(rate.date), value: rate.value })),
				),
			]);
			for (const row of changed) {
				const date = new Date(`${row.date}T12:00:00`);
				if (!earliestChangedDate || date < earliestChangedDate) earliestChangedDate = date;
			}
		}
		if (earliestChangedDate) {
			const accounts = await queryRaw<{ id: string }>(
				`SELECT account."id" FROM "public"."FinancialAccount" account
			 WHERE account."type" <> 'CREDIT_CARD' AND (
			 account."yieldReferenceType" = $1::"ReferenceRateType"
			 OR account."historicalYieldSettings"->'settings'->>'yieldReferenceType' = $1::text
			 OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE((account."historicalYieldSettings"->'settings'->'rules')::jsonb, '[]'::jsonb)) historical_rule WHERE historical_rule.value->>'yieldReferenceType' = $1::text)
			 OR EXISTS (SELECT 1 FROM "public"."FinancialAccountYieldRateHistory" history WHERE history."financialAccountId" = account."id" AND history."yieldReferenceType" = $1::"ReferenceRateType")
			 OR EXISTS (SELECT 1 FROM "public"."FinancialInstitutionYieldRule" rule INNER JOIN "public"."FinancialInstitutionYieldPolicy" policy ON policy."id" = rule."financialYieldPolicyId" WHERE policy."financialInstitutionId" IN (account."institutionId", account."legacyInstitutionId") AND rule."yieldReferenceType" = $1::"ReferenceRateType"))`,
				[referenceType],
			);
			await Promise.all(
				accounts.map(account =>
					enqueueAccountYieldRecalculation(
						account.id,
						earliestChangedDate,
						`fetch:${job.deduplicationKey}`,
					),
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
	await loadTaxCatalog();
	const loaded = await loadFinancialAccountBalanceInput(accountIds);
	if (!loaded.input) return [];
	const snapshots = new Map<string, YieldLot[]>();
	calculateFinancialAccountYieldBalances({ ...loaded.input, lotSnapshots: snapshots });
	// Replay already loaded these accounts, profile policies and rate histories together.
	return loaded.input.accounts.map(account => ({
		...account,
		yieldLots: snapshots.get(account.id) ?? [],
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
	const sourceVersion = await balanceAdjustmentSourceVersion(queryRaw, job.financialAccountId);
	const account = await loadYieldAccount(job.financialAccountId);
	if (!account?.currency) return;
	const [holding] = await queryRaw<{ assetCode: string }>(
		`SELECT holding."assetCode" FROM "FinancialAccountAsset" holding JOIN "Asset" asset ON asset."code"=holding."assetCode" AND asset."kind"='FIAT' WHERE holding."financialAccountId"=$1 AND holding."assetCode"=$2`,
		[account.id, account.currency],
	);
	if (!holding) return;
	const firstBalance = await accountFirstBalanceDate(account.id);
	if (!firstBalance) return;
	const reconcile = (from: string, before: string | null = null) =>
		withRawTransaction(async query => {
			// Brief source locks close the gap between version validation and deletion.
			// Any mutation during yield calculation leaves checkpoints for the next job.
			await query(
				`LOCK TABLE "FinancialAccount", "Transaction", "LoanPayment", "FinancialAccountYield", "BalanceAdjustment" IN SHARE ROW EXCLUSIVE MODE`,
			);
			if ((await balanceAdjustmentSourceVersion(query, account.id)) !== sourceVersion) {
				console.warn(
					`Account ${account.id} changed during recalculation; adjustments left for the next job`,
				);
				return;
			}
			await reconcileBalanceAdjustments(
				query,
				(account as YieldAccount & { userId: string }).userId,
				account.id,
				from,
				before,
			);
		});
	const fromDate = startOfDay(max([job.fromDate, firstBalance]));
	const endDate = startOfDay(job.endDate ?? yieldSchedulerClock().date);
	if (fromDate > endDate) return;
	const years = Array.from(
		{ length: endDate.getFullYear() - fromDate.getFullYear() + 1 },
		(_, index) => fromDate.getFullYear() + index,
	);
	if (!(await ensureAccountCoverage(account.currency, account.countryCode, years))) {
		// Without a country no yield is ever generated, so the balance only depends on movements.
		if (!account.countryCode) await reconcile(dateKey(fromDate));
		return;
	}
	await loadTaxCatalog();
	await executeRaw(
		`DELETE FROM "public"."FinancialAccountYield" WHERE "financialAccountId" = $1 AND "assetCode" = $4 AND "kind" = 'AUTOMATIC' AND "origin" = 'SYSTEM' AND "date" >= $2 AND "date" <= $3`,
		[account.id, dateKey(fromDate), dateKey(endDate), account.currency],
	);
	const holidayKeys = await getCountryHolidays(account.countryCode!);
	const loaded = await loadFinancialAccountBalanceInput([account.id]);
	if (!loaded.input) return;
	const input = { ...loaded.input, yields: [...loaded.input.yields] };
	let firstGap: string | null = null;
	for (let day = fromDate; day <= endDate; day = addDays(day, 1)) {
		const key = dateKey(day);
		if (isWeekend(day) || (legacyCalendarHoliday(account, key) ?? holidayKeys.has(key))) continue;
		const settings = getYieldSettings(account, key);
		if (!settings) continue;
		const types = requiredReferenceTypes(settings);
		const rows = await queryRaw<{ type: ReferenceRateType; value: string }>(
			`SELECT DISTINCT ON ("type") "type", "value" FROM "public"."ReferenceRate"
 WHERE "type" = ANY($2::"ReferenceRateType"[]) AND (
 ("type" IN ('CDI','SELIC') AND "date"=$1::date)
 OR ("type"='TR' AND "date"=date_trunc('month',$1::date)::date)
 OR ("type"='IPCA' AND "date"=(date_trunc('month',$1::date)-interval '2 months')::date))
 ORDER BY "type","date" DESC`,
			[key, types],
		);
		if (rows.length !== types.length) {
			// A day without a published rate that is followed by later ones is a non-business day
			// the calendar does not know about, not a pending rate: nothing to compute and nothing to wait for.
			const missing = types.filter(type => !rows.some(row => row.type === type));
			const [later] = await queryRaw<{ count: string }>(
				`SELECT count(DISTINCT "type") AS "count" FROM "public"."ReferenceRate" WHERE "type" = ANY($2::"ReferenceRateType"[]) AND "date" > $1::date`,
				[key, missing],
			);
			if (Number(later?.count) !== missing.length) firstGap ??= key;
			continue;
		}
		const override = await queryFirst(
			db.sql.public.FinancialAccountYield.select("id")
				.where((fields, functions) =>
					functions.and(
						functions.eq(fields.financialAccountId, account.id),
						functions.eq(fields.date, key),
						functions.eq(fields.assetCode, account.currency!),
						functions.eq(fields.origin, "USER"),
					),
				)
				.limit(1)
				.build(),
		);
		if (override) continue;
		const snapshots = new Map<string, YieldLot[]>();
		calculateFinancialAccountYieldBalances({
			...input,
			beforeYieldDay: key,
			lotSnapshots: snapshots,
			today: day,
		});
		const ledger = new YieldTaxLedger(snapshots.get(account.id) ?? []);
		if (ledger.balance <= 0) continue;
		const rates = Object.fromEntries(rows.map(row => [row.type, Number(row.value)]));
		const amount = Number(
			roundDailyYield(
				account.type,
				ledger.netYield(
					calculateGrossYield(ledger.eligibleBalance(key), settings, rates),
					settings,
					key,
				),
			).toFixed(4),
		);
		if (amount === 0) continue;
		input.yields.push({
			amount,
			date: day,
			financialAccountId: account.id,
			isExcluded: false,
			kind: "AUTOMATIC",
			origin: "SYSTEM",
		});
		await executeStatement(
			db.sql.public.FinancialAccountYield.insert([
				{
					amount: numeric<38, 18>(amount),
					assetCode: account.currency!,
					date: key,
					financialAccountId: account.id,
					isExcluded: false,
					kind: "AUTOMATIC",
					origin: "SYSTEM",
				},
			]).build(),
		);
	}
	// A checkpoint only depends on days before it, so missing rates later on do not block it.
	await reconcile(dateKey(fromDate), firstGap);
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
	if (
		rawReferenceType !== "CDI" &&
		rawReferenceType !== "SELIC" &&
		rawReferenceType !== "IPCA" &&
		rawReferenceType !== "TR"
	)
		throw new Error("Tipo de taxa inválido");
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
	const accountId = requiredString(event.payload, "financialAccountId");
	const throughDate = (event.payload as { throughDate?: string }).throughDate;
	return withRawTransaction(async query => {
		await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`account-yields:${accountId}`]);
		return processAccountRecalculation({
			deduplicationKey: requiredString(event.payload, "deduplicationKey"),
			endDate: throughDate ? new Date(`${throughDate}T12:00:00`) : null,
			financialAccountId: accountId,
			fromDate: new Date(`${requiredString(event.payload, "fromDate")}T12:00:00`),
			referenceType: null,
			startDate: null,
		});
	});
}
