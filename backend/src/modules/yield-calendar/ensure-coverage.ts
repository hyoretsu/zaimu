import { randomUUID } from "node:crypto";
import { withRawTransaction } from "~/shared/infra/sql";
import {
	calendarSourceVersion,
	currencySourceVersion,
	nationalHolidays,
	officialCurrencyAssociations,
} from "./calendar-source";

export async function ensureCurrencyAssociations(currency: string) {
	await withRawTransaction(async query => {
		await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`cldr:${currency}`]);
		for (const row of officialCurrencyAssociations(currency)) {
			await query(`INSERT INTO "YieldCalendarCountry" ("code") VALUES ($1) ON CONFLICT DO NOTHING`, [
				row.countryCode,
			]);
			await query(
				`INSERT INTO "CurrencyCountryAssociation" ("id","countryCode","currency","effectiveFrom","effectiveUntil","sourceVersion","source","createdAt","updatedAt") SELECT $1::varchar(36),$2::varchar(2),$3::varchar(3),$4::date,$5::date,$6::varchar(64),'CLDR',NOW(),NOW() WHERE NOT EXISTS (SELECT 1 FROM "CurrencyCountryAssociation" WHERE "countryCode"=$2 AND "currency"=$3 AND "effectiveFrom" IS NOT DISTINCT FROM $4::date AND "effectiveUntil" IS NOT DISTINCT FROM $5::date AND "sourceVersion"=$6)`,
				[
					randomUUID(),
					row.countryCode,
					row.currency,
					row.effectiveFrom,
					row.effectiveUntil,
					currencySourceVersion,
				],
			);
			if (!row.effectiveUntil)
				await query(
					`INSERT INTO "YieldCalendarCurrency" ("countryCode","currency","source","sourceVersion","effectiveFrom") VALUES ($1,$2,'CLDR',$3,$4) ON CONFLICT DO NOTHING`,
					[row.countryCode, row.currency, currencySourceVersion, row.effectiveFrom],
				);
		}
	});
}

export async function ensureCalendarCoverage(countryCode: string, year: number) {
	const generated = nationalHolidays(countryCode, year);
	return withRawTransaction(async query => {
		await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`calendar:${countryCode}:${year}`]);
		await query(`INSERT INTO "YieldCalendarCountry" ("code") VALUES ($1) ON CONFLICT DO NOTHING`, [
			countryCode,
		]);
		const [existing] = await query<{ status: string; sourceVersion: string; source: string }>(
			`SELECT "status","sourceVersion","source" FROM "YieldCalendarCoverage" WHERE "countryCode"=$1 AND "year"=$2 FOR UPDATE`,
			[countryCode, year],
		);
		if (
			(existing?.source === "ADMIN" && existing.status === "COMPLETE") ||
			existing?.sourceVersion === calendarSourceVersion
		)
			return existing.status;
		const overrides = await query<{ date: string }>(
			`SELECT "date"::text FROM "YieldCalendarOverride" WHERE "countryCode"=$1 AND EXTRACT(YEAR FROM "date")=$2`,
			[countryCode, year],
		);
		const protectedDates = new Set(overrides.map(row => row.date));
		await query(
			`DELETE FROM "YieldCalendarHoliday" h WHERE h."countryCode"=$1 AND EXTRACT(YEAR FROM h."date")=$2 AND NOT EXISTS (SELECT 1 FROM "YieldCalendarOverride" o WHERE o."countryCode"=h."countryCode" AND o."date"=h."date")`,
			[countryCode, year],
		);
		for (const holiday of generated.holidays) {
			if (protectedDates.has(holiday.date)) continue;
			await query(
				`INSERT INTO "YieldCalendarHoliday" ("id","countryCode","date","name") VALUES ($1,$2,$3,$4) ON CONFLICT ("countryCode","date") DO NOTHING`,
				[randomUUID(), countryCode, holiday.date, holiday.name],
			);
		}
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
