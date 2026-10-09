import {
	referenceRateBootstrapIntervals,
	referenceRateWindow,
} from "~/modules/reference-rates/domain/reference-rate-window";
import { createEventEnvelope, type EventEnvelope } from "~/shared/application/events";
import { PostgresOutbox } from "~/shared/infra/outbox";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import {
	type CollectionKind,
	currencyWindow,
	dateKey,
	type HistoryUnit,
	historyCoverageRanges,
	historyProgress,
	retryDelay,
	windowDays,
} from "../domain/collection";

import { referenceRateCoveredDaysSql } from "./reference-rate-coverage-sql";

const outbox = new PostgresOutbox();
type UnitRow = HistoryUnit & { lockedUntil: Date | null; leaseToken: string | null; [key: string]: unknown };
const unitColumns = `"id", "kind", "series", to_char("startDate",'YYYY-MM-DD') AS "startDate", to_char("endDate",'YYYY-MM-DD') AS "endDate", "state", "attempts", "generation", "updatedAt", "lastError", "lockedUntil", "leaseToken"`;
const routingKey = (kind: CollectionKind) =>
	kind === "CURRENCY" ? "currency-rate-history-fetch" : "reference-rate-fetch";

function unitEvent(
	unit: Pick<HistoryUnit, "id" | "kind" | "series" | "startDate" | "endDate" | "generation">,
) {
	return createEventEnvelope({
		aggregateId: unit.id,
		aggregateType: "financialHistory",
		correlationId: unit.id,
		eventType: `command.${routingKey(unit.kind)}`,
		payload: {
			deduplicationKey: `history:${unit.id}:${unit.generation}`,
			endDate: unit.endDate,
			generation: unit.generation,
			referenceType: unit.series,
			startDate: unit.startDate,
			unitId: unit.id,
		},
		userIds: [],
	});
}
async function publishUnit(unit: Parameters<typeof unitEvent>[0]) {
	await outbox.append(unitEvent(unit));
}

/** A request and its unique work/outbox are committed as one unit. No downloads here. */
export async function requestHistoryCollection(
	kind: CollectionKind,
	seriesInput: string[],
	referenceDate = dateKey(new Date()),
	dependencies: {
		publish: typeof publishUnit;
		publishBatch?: (units: Parameters<typeof unitEvent>[0][]) => Promise<void>;
		read: typeof getHistoryCollection;
		transaction: typeof withRawTransaction;
	} = {
		publish: publishUnit,
		publishBatch: units => outbox.appendMany(units.map(unitEvent)),
		read: getHistoryCollection,
		transaction: withRawTransaction,
	},
) {
	const reference = dateKey(referenceDate);
	if (reference > dateKey(new Date())) throw new RangeError("Coleta não aceita datas futuras");
	const series = [...new Set(seriesInput.map(value => value.toUpperCase()))].sort();
	if (
		!series.length ||
		series.length > 20 ||
		series.some(value =>
			kind === "INTEREST" ? !["CDI", "SELIC"].includes(value) : !/^[A-Z]{3}$/.test(value),
		)
	)
		throw new RangeError("Séries de coleta inválidas");
	const intervals =
		kind === "CURRENCY"
			? [currencyWindow(reference)]
			: referenceRateBootstrapIntervals(new Date(`${reference}T12:00:00Z`)).map(interval => ({
					endDate: dateKey(interval.endDate),
					startDate: dateKey(interval.startDate),
				}));
	const interestWindow = referenceRateWindow(new Date(`${reference}T12:00:00Z`));
	const window =
		kind === "CURRENCY"
			? intervals[0]!
			: { endDate: dateKey(interestWindow.endDate), startDate: dateKey(interestWindow.startDate) };
	return dependencies.transaction(async query => {
		const key = `${kind}:${series.join(",")}:${window.startDate}:${window.endDate}`;
		const [collection] = await query<{ id: string }>(
			`INSERT INTO "FinancialHistoryCollection" ("id","deduplicationKey","kind","startDate","endDate","series") VALUES ($1,$2,$3,$4::date,$5::date,$6::json)
		 ON CONFLICT ("deduplicationKey") DO UPDATE SET "deduplicationKey"=EXCLUDED."deduplicationKey" RETURNING "id"`,
			[crypto.randomUUID(), key, kind, window.startDate, window.endDate, JSON.stringify(series)],
		);
		if (!collection) throw new Error("Coleta indisponível");
		for (const value of series) {
			await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`history:${kind}:${value}`]);
			if (kind === "CURRENCY") {
				// One statement per phase, independent of the 365-day window size.
				const units = await query<UnitRow>(
					`INSERT INTO "FinancialHistoryUnit" ("id","deduplicationKey","kind","series","startDate","endDate")
					 SELECT gen_random_uuid()::text, 'CURRENCY:' || $1 || ':' || day::date || ':' || day::date,
					 'CURRENCY', $1, day::date, day::date FROM generate_series($2::date,$3::date,interval '1 day') day
					 ON CONFLICT ("deduplicationKey") DO UPDATE SET "deduplicationKey"=EXCLUDED."deduplicationKey"
					 RETURNING ${unitColumns}`,
					[value, window.startDate, window.endDate],
				);
				const ids = units.map(unit => unit.id);
				await query(
					`INSERT INTO "FinancialHistoryCollectionUnit" ("collectionId","unitId") SELECT $1, unnest($2::varchar[]) ON CONFLICT DO NOTHING`,
					[collection.id, ids],
				);
				await query(
					`UPDATE "FinancialHistoryUnit" unit SET "state"='COMPLETED',"completedAt"=now(),"updatedAt"=now()
					 WHERE unit."id"=ANY($1::varchar[]) AND unit."state"='PENDING'
					 AND EXISTS(SELECT 1 FROM "CurrencyRateSnapshot" snapshot WHERE snapshot."date"=unit."startDate" AND snapshot."baseCurrency"=unit."series")`,
					[ids],
				);
				const scheduled = await query<UnitRow>(
					`UPDATE "FinancialHistoryUnit" SET "generation"=1,"nextAttemptAt"=now(),"updatedAt"=now()
					 WHERE "id"=ANY($1::varchar[]) AND "state"='PENDING' AND "generation"=0 AND "attempts"=0 RETURNING ${unitColumns}`,
					[ids],
				);
				if (dependencies.publishBatch) await dependencies.publishBatch(scheduled);
				else for (const unit of scheduled) await dependencies.publish(unit);
				continue;
			}
			let ranges: { startDate: string; endDate: string; covered?: boolean }[] = windowDays(
				window.startDate,
				window.endDate,
			).map(day => ({
				endDate: day,
				startDate: day,
			}));
			if (kind === "INTEREST") {
				// Share previous annual/tail work, including running and failed units, before making gaps.
				const existing = await query<UnitRow>(
					`SELECT ${unitColumns} FROM "FinancialHistoryUnit" WHERE "kind"='INTEREST' AND "series"=$1 AND "startDate"<=$3::date AND "endDate">=$2::date ORDER BY "startDate" FOR UPDATE`,
					[value, window.startDate, window.endDate],
				);
				const occupied = new Set(existing.flatMap(unit => windowDays(unit.startDate, unit.endDate)));
				for (const unit of existing)
					await query(
						`INSERT INTO "FinancialHistoryCollectionUnit" ("collectionId","unitId") VALUES ($1,$2) ON CONFLICT DO NOTHING`,
						[collection.id, unit.id],
					);
				const coveredRows = await query<{ date: string }>(referenceRateCoveredDaysSql, [
					value,
					window.startDate,
					window.endDate,
				]);
				const covered = new Set(coveredRows.map(row => row.date));
				for (const unit of existing)
					if (
						(unit.state === "PENDING" || unit.state === "FAILED") &&
						windowDays(unit.startDate, unit.endDate).every(day => covered.has(day))
					)
						await query(
							`UPDATE "FinancialHistoryUnit" SET "state"='COMPLETED',"completedAt"=now(),"updatedAt"=now(),"lastError"=NULL WHERE "id"=$1 AND "state" IN ('PENDING','FAILED')`,
							[unit.id],
						);
				ranges = intervals.flatMap(interval =>
					historyCoverageRanges(
						interval.startDate < window.startDate ? window.startDate : interval.startDate,
						interval.endDate,
						covered,
						occupied,
					),
				);
			}
			for (const interval of ranges) {
				const unitKey = `${kind}:${value}:${interval.startDate}:${interval.endDate}`;
				const [unit] = await query<UnitRow>(
					`INSERT INTO "FinancialHistoryUnit" ("id","deduplicationKey","kind","series","startDate","endDate") VALUES ($1,$2,$3,$4,$5::date,$6::date)
				 ON CONFLICT ("deduplicationKey") DO UPDATE SET "deduplicationKey"=EXCLUDED."deduplicationKey" RETURNING ${unitColumns}`,
					[crypto.randomUUID(), unitKey, kind, value, interval.startDate, interval.endDate],
				);
				if (!unit) throw new Error("Unidade de coleta indisponível");
				await query(
					`INSERT INTO "FinancialHistoryCollectionUnit" ("collectionId","unitId") VALUES ($1,$2) ON CONFLICT DO NOTHING`,
					[collection.id, unit.id],
				);
				if (unit.state !== "PENDING") continue;
				const [covered] = interval.covered
					? [{ complete: true }]
					: await query<{ complete: boolean }>(
							`SELECT NOT EXISTS(SELECT 1 FROM generate_series($2::date,$3::date,interval '1 day') day WHERE NOT EXISTS(SELECT 1 FROM "OutboxEvent" e WHERE e."eventType"='referenceRate.historyFetched' AND e."payload"->>'referenceType'=$1 AND (e."payload"->>'startDate')::date<=day::date AND (e."payload"->>'endDate')::date>=day::date)) AS complete`,
							[value, interval.startDate, interval.endDate],
						);
				if (covered?.complete)
					await query(
						`UPDATE "FinancialHistoryUnit" SET "state"='COMPLETED',"completedAt"=now(),"updatedAt"=now() WHERE "id"=$1 AND "state"='PENDING'`,
						[unit.id],
					);
				else if (unit.generation === 0 && unit.attempts === 0) {
					await query(
						`UPDATE "FinancialHistoryUnit" SET "generation"=1,"nextAttemptAt"=now(),"updatedAt"=now() WHERE "id"=$1`,
						[unit.id],
					);
					await dependencies.publish({ ...unit, generation: 1 });
				}
			}
		}
		return dependencies.read(collection.id);
	});
}

export async function getHistoryCollection(id: string) {
	const [collection] = await queryRaw<{
		id: string;
		kind: CollectionKind;
		startDate: string;
		endDate: string;
		series: string[];
	}>(
		`SELECT "id","kind",to_char("startDate",'YYYY-MM-DD') AS "startDate",to_char("endDate",'YYYY-MM-DD') AS "endDate","series" FROM "FinancialHistoryCollection" WHERE "id"=$1`,
		[id],
	);
	if (!collection) return null;
	const rows = await queryRaw<UnitRow>(
		`SELECT ${unitColumns} FROM "FinancialHistoryUnit" WHERE "id" IN (SELECT "unitId" FROM "FinancialHistoryCollectionUnit" WHERE "collectionId"=$1) ORDER BY "startDate","series"`,
		[id],
	);
	const units = rows.map(({ leaseToken: _token, lockedUntil: _lease, ...row }) => ({
		...row,
		lastError: row.lastError ?? null,
		updatedAt: new Date(row.updatedAt).toISOString(),
	}));
	return { ...collection, progress: historyProgress(collection.kind, units, collection), units };
}

export async function retryHistoryCollection(id: string) {
	await withRawTransaction(async query => {
		const units = await query<UnitRow>(
			`UPDATE "FinancialHistoryUnit" SET "state"='PENDING',"attempts"=0,"generation"="generation"+1,"lastError"=NULL,"nextAttemptAt"=now(),"updatedAt"=now() WHERE "state"='FAILED' AND "id" IN (SELECT "unitId" FROM "FinancialHistoryCollectionUnit" WHERE "collectionId"=$1) RETURNING ${unitColumns}`,
			[id],
		);
		for (const unit of units) await publishUnit(unit);
	});
	return getHistoryCollection(id);
}

/** Recovery only revisits previously demanded, unfinished work. */
export async function recoverHistoryCollections() {
	await withRawTransaction(async query => {
		const units =
			await query<UnitRow>(`WITH candidates AS (SELECT "id" FROM "FinancialHistoryUnit" WHERE ("state"='RUNNING' AND "lockedUntil"<now()) OR ("state"='PENDING' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt"<=now()) AND "updatedAt"<now()-interval '90 seconds') ORDER BY "updatedAt" LIMIT 100 FOR UPDATE SKIP LOCKED)
		 UPDATE "FinancialHistoryUnit" SET "state"='PENDING',"leaseToken"=NULL,"lockedUntil"=NULL,"generation"="generation"+1,"nextAttemptAt"=now(),"updatedAt"=now() WHERE "id" IN (SELECT "id" FROM candidates) RETURNING ${unitColumns}`);
		for (const unit of units) await publishUnit(unit);
	});
}

export class HistoryLeaseLostError extends Error {}
export async function runHistoryUnit(
	event: EventEnvelope,
	operation: (unit: HistoryUnit, assertLease: () => Promise<void>) => Promise<"COMPLETED" | "NO_DATA">,
	execute: typeof queryRaw = queryRaw,
) {
	const payload = event.payload as { unitId?: string; generation?: number };
	if (!payload.unitId) throw new Error("Comando sem unidade de histórico");
	const token = crypto.randomUUID();
	const [unit] = await execute<UnitRow>(
		`UPDATE "FinancialHistoryUnit" SET "state"='RUNNING',"attempts"="attempts"+1,"leaseToken"=$2,"lockedUntil"=now()+interval '90 seconds',"updatedAt"=now() WHERE "id"=$1 AND "generation"=$3 AND "state"='PENDING' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt"<=now()) RETURNING ${unitColumns}`,
		[payload.unitId, token, payload.generation],
	);
	if (!unit) return;
	let lost = false;
	const heartbeat = setInterval(() => {
		execute(
			`UPDATE "FinancialHistoryUnit" SET "lockedUntil"=now()+interval '90 seconds',"updatedAt"=now() WHERE "id"=$1 AND "leaseToken"=$2 AND "lockedUntil">now() AND "state"='RUNNING' RETURNING "id"`,
			[unit.id, token],
		)
			.then(rows => {
				if (!rows.length) lost = true;
			})
			.catch(() => {
				lost = true;
			});
	}, 20_000);
	const assertLease = async () => {
		if (lost) throw new HistoryLeaseLostError("Lease da coleta expirada");
		const rows = await execute(
			`SELECT "id" FROM "FinancialHistoryUnit" WHERE "id"=$1 AND "leaseToken"=$2 AND "lockedUntil">now() AND "state"='RUNNING' FOR UPDATE`,
			[unit.id, token],
		);
		if (!rows.length) throw new HistoryLeaseLostError("Lease da coleta substituída");
	};
	try {
		// Adapter downloads before its transaction, then fences data + completion atomically.
		await operation(unit, async () => {
			await assertLease();
		});
	} catch (error) {
		const details = error as { retryAfter?: string; retryAfterMs?: number };
		const retryAfter =
			details.retryAfterMs ??
			(details.retryAfter
				? Number(details.retryAfter) * 1000 || Math.max(0, Date.parse(details.retryAfter) - Date.now())
				: 0);
		await execute(
			`UPDATE "FinancialHistoryUnit" SET "state"=$3,"leaseToken"=NULL,"lockedUntil"=NULL,"nextAttemptAt"=now()+($4 * interval '1 millisecond'),"lastError"=$5,"updatedAt"=now() WHERE "id"=$1 AND "leaseToken"=$2`,
			[
				unit.id,
				token,
				unit.attempts >= 5 ? "FAILED" : "PENDING",
				retryDelay(unit.attempts, retryAfter),
				(error instanceof Error ? error.message : String(error)).slice(0, 1000),
			],
		);
		if (unit.attempts >= 5 && error instanceof Error) Object.assign(error, { historyExhausted: true });
		throw error;
	} finally {
		clearInterval(heartbeat);
	}
}

/** Must be called inside adapter transaction after assertLease, with downloaded rows. */
export async function completeHistoryUnit(id: string, state: "COMPLETED" | "NO_DATA") {
	await queryRaw(
		`UPDATE "FinancialHistoryUnit" SET "state"=$2,"completedAt"=now(),"lockedUntil"=NULL,"leaseToken"=NULL,"nextAttemptAt"=NULL,"lastError"=NULL,"updatedAt"=now() WHERE "id"=$1 AND "state"='RUNNING'`,
		[id, state],
	);
}
