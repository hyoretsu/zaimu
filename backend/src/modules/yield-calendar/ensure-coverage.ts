import { randomUUID } from "node:crypto";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import {
	calendarSourceVersion,
	currencySourceVersion,
	nationalHolidays,
	officialCurrencyAssociations,
} from "./calendar-source";

export async function ensureCurrencyAssociations(currency: string) {
	const expected = officialCurrencyAssociations(currency);
	if (!expected.length) return;
	const [coverage] = await queryRaw<{ complete: boolean }>(
		`SELECT NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS expected("countryCode" text,"effectiveFrom" text,"effectiveUntil" text)
          WHERE NOT EXISTS (
            SELECT 1 FROM "CurrencyCountryAssociation" association
            WHERE association."countryCode"=expected."countryCode" AND association."currency"=$2::varchar(3)
              AND association."effectiveFrom" IS NOT DISTINCT FROM expected."effectiveFrom"::date
              AND association."effectiveUntil" IS NOT DISTINCT FROM expected."effectiveUntil"::date
              AND association."sourceVersion"=$3::varchar(64)
          ) OR (expected."effectiveUntil" IS NULL AND NOT EXISTS (
            SELECT 1 FROM "YieldCalendarCurrency" mapping
            WHERE mapping."countryCode"=expected."countryCode" AND mapping."currency"=$2::varchar(3)
          ))
        ) AS complete`,
		[JSON.stringify(expected), currency, currencySourceVersion],
	);
	if (coverage?.complete) return;
	await withRawTransaction(async query => {
		await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`cldr:${currency}`]);
		await query(
			`INSERT INTO "YieldCalendarCountry" ("code")
             SELECT DISTINCT expected."countryCode" FROM jsonb_to_recordset($1::jsonb) AS expected("countryCode" text)
             ON CONFLICT DO NOTHING`,
			[JSON.stringify(expected)],
		);
		await query(
			`INSERT INTO "CurrencyCountryAssociation" ("id","countryCode","currency","effectiveFrom","effectiveUntil","sourceVersion","source","createdAt","updatedAt")
             SELECT gen_random_uuid()::text, expected."countryCode", $2::varchar(3), expected."effectiveFrom", expected."effectiveUntil", $3::varchar(64), 'CLDR', NOW(), NOW()
             FROM jsonb_to_recordset($1::jsonb) AS expected("countryCode" text,"effectiveFrom" date,"effectiveUntil" date)
             WHERE NOT EXISTS (SELECT 1 FROM "CurrencyCountryAssociation" existing
               WHERE existing."countryCode"=expected."countryCode" AND existing."currency"=$2::varchar(3)
                 AND existing."effectiveFrom" IS NOT DISTINCT FROM expected."effectiveFrom"
                 AND existing."effectiveUntil" IS NOT DISTINCT FROM expected."effectiveUntil"
                 AND existing."sourceVersion"=$3::varchar(64))`,
			[JSON.stringify(expected), currency, currencySourceVersion],
		);
		await query(
			`INSERT INTO "YieldCalendarCurrency" ("countryCode","currency","source","sourceVersion","effectiveFrom")
             SELECT expected."countryCode", $2::varchar(3), 'CLDR', $3::varchar(64), expected."effectiveFrom"
             FROM jsonb_to_recordset($1::jsonb) AS expected("countryCode" text,"effectiveFrom" date,"effectiveUntil" date)
             WHERE expected."effectiveUntil" IS NULL ON CONFLICT DO NOTHING`,
			[JSON.stringify(expected), currency, currencySourceVersion],
		);
	});
}

interface CalendarCoverage extends Record<string, unknown> {
	status: string;
	sourceVersion: string;
	source: string;
}
function reusableCoverage(existing: CalendarCoverage | undefined) {
	return (
		existing &&
		((existing.source === "ADMIN" && existing.status === "COMPLETE") ||
			existing.sourceVersion === calendarSourceVersion)
	);
}

export async function ensureCalendarCoverage(countryCode: string, year: number) {
	const [known] = await queryRaw<CalendarCoverage>(
		`SELECT "status","sourceVersion","source" FROM "YieldCalendarCoverage" WHERE "countryCode"=$1 AND "year"=$2`,
		[countryCode, year],
	);
	if (reusableCoverage(known)) return known!.status;
	return withRawTransaction(async query => {
		await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
			`calendar:${countryCode}:${year}`,
		]);
		await query(`INSERT INTO "YieldCalendarCountry" ("code") VALUES ($1) ON CONFLICT DO NOTHING`, [
			countryCode,
		]);
		const [existing] = await query<CalendarCoverage>(
			`SELECT "status","sourceVersion","source" FROM "YieldCalendarCoverage" WHERE "countryCode"=$1 AND "year"=$2 FOR UPDATE`,
			[countryCode, year],
		);
		if (reusableCoverage(existing)) return existing!.status;
		const generated = nationalHolidays(countryCode, year);
		const overrides = await query<{ date: string }>(
			`SELECT "date"::text FROM "YieldCalendarOverride" WHERE "countryCode"=$1 AND EXTRACT(YEAR FROM "date")=$2`,
			[countryCode, year],
		);
		const protectedDates = new Set(overrides.map(row => row.date));
		await query(
			`DELETE FROM "YieldCalendarHoliday" h WHERE h."countryCode"=$1 AND EXTRACT(YEAR FROM h."date")=$2 AND NOT EXISTS (SELECT 1 FROM "YieldCalendarOverride" o WHERE o."countryCode"=h."countryCode" AND o."date"=h."date")`,
			[countryCode, year],
		);
		const holidays = generated.holidays
			.filter(holiday => !protectedDates.has(holiday.date))
			.map(holiday => ({ ...holiday, id: randomUUID() }));
		if (holidays.length)
			await query(
				`INSERT INTO "YieldCalendarHoliday" ("id","countryCode","date","name")
                 SELECT entry.id,$1,entry.date,entry.name FROM jsonb_to_recordset($2::jsonb) AS entry(id text,date date,name text)
                 ON CONFLICT ("countryCode","date") DO NOTHING`,
				[countryCode, JSON.stringify(holidays)],
			);
		await query(
			`INSERT INTO "YieldCalendarCoverage" ("countryCode","year","status","source","sourceVersion","generatedAt","updatedAt") VALUES ($1,$2,$3,'DATE_HOLIDAYS',$4,NOW(),NOW()) ON CONFLICT ("countryCode","year") DO UPDATE SET "status"=EXCLUDED."status","source"=EXCLUDED."source","sourceVersion"=EXCLUDED."sourceVersion","generatedAt"=NOW(),"updatedAt"=NOW()`,
			[countryCode, year, generated.status, calendarSourceVersion],
		);
		return generated.status;
	});
}

export async function ensureAccountCoverage(
	currency: string,
	countryCode?: string | null,
	years = [new Date().getFullYear()],
) {
	await ensureCurrencyAssociations(currency);
	if (!countryCode) return false;
	const statuses = await Promise.all(
		[...new Set(years)].map(year => ensureCalendarCoverage(countryCode, year)),
	);
	return statuses.every(status => status === "COMPLETE");
}
