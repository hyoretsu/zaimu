import { randomUUID } from "node:crypto";
import Elysia, { t } from "elysia";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { requireAdmin } from "~/modules/taxes/admin-access";
import { HttpException } from "~/shared/errors";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { loadYieldCalendar } from "./catalog";
import { CountryPreferencesController } from "./country-preference";
import { ensureCalendarCoverage } from "./ensure-coverage";
import { InvoicePaymentPreferencesController } from "./invoice-payment-preference";

const Code = t.String({ pattern: "^[A-Z]{2}$" });
const Currency = t.String({ pattern: "^[A-Z]{3}$" });
const Holiday = t.Object({
	date: t.String({ format: "date" }),
	name: t.String({ maxLength: 100, minLength: 1 }),
});
const Country = t.Object({
	code: Code,
	currencies: t.Array(Currency, { uniqueItems: true }),
	name: t.String({ maxLength: 100, minLength: 1 }),
});
const Result = t.Object({ success: t.Boolean() });

async function recalculate(currencies: string[], date: string, cause: string) {
	const accounts = await queryRaw<{ id: string }>(
		`SELECT "id" FROM "FinancialAccount" WHERE "type" <> 'CREDIT_CARD' AND "currency"=ANY($1::text[])`,
		[currencies],
	);
	for (const account of accounts)
		await enqueueAccountYieldRecalculation(account.id, new Date(`${date}T12:00:00`), cause);
}
async function countryCurrencies(code: string) {
	const [country] = await queryRaw(`SELECT "code" FROM "YieldCalendarCountry" WHERE "code"=$1`, [code]);
	if (!country) throw new HttpException("País não encontrado", 404);
	return (
		await queryRaw<{ currency: string }>(
			`SELECT "currency" FROM "YieldCalendarCurrency" WHERE "countryCode"=$1`,
			[code],
		)
	).map(row => row.currency);
}
function checkedName(name: string) {
	const value = name.trim();
	if (!value) throw new HttpException("Informe um nome", 400);
	return value;
}
function checkedDate(date: string) {
	const parsed = new Date(`${date}T12:00:00Z`);
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
		Number.isNaN(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== date
	)
		throw new HttpException("Data inválida", 400);
	return date;
}
export const YieldCalendarController = new Elysia()
	.use(CountryPreferencesController)
	.use(InvoicePaymentPreferencesController)
	.post(
		"/admin/yield-calendar/countries/:code/coverage/:year",
		async ({ request, params }) => {
			await requireAdmin(request);
			const status = await ensureCalendarCoverage(params.code, Number(params.year));
			await recalculateCountry(params.code, `${params.year}-01-01`, `calendar:${randomUUID()}`);
			return { status };
		},
		{
			params: t.Object({ code: Code, year: t.String({ pattern: "^(19|20|21|22)[0-9]{2}$" }) }),
			response: t.Object({ status: t.String() }),
		},
	)
	.post(
		"/admin/yield-calendar/countries/:code/coverage/:year/confirm",
		async ({ request, params }) => {
			const admin = await requireAdmin(request);
			await queryRaw(`INSERT INTO "YieldCalendarCountry" ("code") VALUES ($1) ON CONFLICT DO NOTHING`, [
				params.code,
			]);
			await queryRaw(
				`INSERT INTO "YieldCalendarCoverage" ("countryCode","year","status","source","sourceVersion","confirmedBy","generatedAt","updatedAt") VALUES ($1,$2,'COMPLETE','ADMIN','manual-v1',$3,NOW(),NOW()) ON CONFLICT ("countryCode","year") DO UPDATE SET "status"='COMPLETE',"source"='ADMIN',"sourceVersion"='manual-v1',"confirmedBy"=$3,"generatedAt"=NOW(),"updatedAt"=NOW()`,
				[params.code, Number(params.year), admin],
			);
			await recalculateCountry(params.code, `${params.year}-01-01`, `calendar:${randomUUID()}`);
			return { success: true };
		},
		{
			params: t.Object({ code: Code, year: t.String({ pattern: "^(19|20|21|22)[0-9]{2}$" }) }),
			response: Result,
		},
	)
	.get(
		"/admin/yield-calendar/access",
		async ({ request }) => {
			await requireAdmin(request);
			return { success: true };
		},
		{ response: Result },
	)
	.get("/yield-calendar", () => loadYieldCalendar(), {
		response: t.Object({
			countries: t.Array(
				t.Object({
					...Country.properties,
					holidays: t.Array(t.Object({ ...Holiday.properties, id: t.String() })),
				}),
			),
			coverage: t.Array(t.Object({ countryCode: t.String(), status: t.String(), year: t.Number() })),
		}),
	})
	.put(
		"/admin/yield-calendar/countries/:code",
		async ({ request, params, body }) => {
			await requireAdmin(request);
			checkedName(body.name);
			await withRawTransaction(async query => {
				const previous = await query<{ currency: string }>(
					`SELECT "currency" FROM "YieldCalendarCurrency" WHERE "countryCode"=$1`,
					[params.code],
				);
				await query(`INSERT INTO "YieldCalendarCountry" ("code") VALUES ($1) ON CONFLICT DO NOTHING`, [
					params.code,
				]);
				await query(`DELETE FROM "YieldCalendarCurrency" WHERE "countryCode"=$1`, [params.code]);
				for (const currency of body.currencies)
					await query(`INSERT INTO "YieldCalendarCurrency" ("countryCode","currency") VALUES ($1,$2)`, [
						params.code,
						currency,
					]);
				await recalculate(
					[...new Set([...previous.map(row => row.currency), ...body.currencies])],
					"0001-01-01",
					`calendar:${randomUUID()}`,
				);
			});
			return { success: true };
		},
		{
			body: t.Object({ currencies: Country.properties.currencies, name: Country.properties.name }),
			params: t.Object({ code: Code }),
			response: Result,
		},
	)
	.put(
		"/admin/yield-calendar/currencies/:currency",
		async ({ request, params, body }) => {
			await requireAdmin(request);
			await withRawTransaction(async query => {
				await countryCurrencies(body.countryCode);
				if (body.previousCountryCode)
					await query(`DELETE FROM "YieldCalendarCurrency" WHERE "currency"=$1 AND "countryCode"=$2`, [
						params.currency,
						body.previousCountryCode,
					]);
				await query(
					`INSERT INTO "YieldCalendarCurrency" ("currency","countryCode") VALUES ($1,$2) ON CONFLICT DO NOTHING`,
					[params.currency, body.countryCode],
				);
				await recalculate([params.currency], "0001-01-01", `calendar:${randomUUID()}`);
			});
			return { success: true };
		},
		{
			body: t.Object({ countryCode: Code, previousCountryCode: t.Optional(Code) }),
			params: t.Object({ currency: Currency }),
			response: Result,
		},
	)

	.delete(
		"/admin/yield-calendar/countries/:code",
		async ({ request, params }) => {
			await requireAdmin(request);
			await withRawTransaction(async query => {
				const currencies = await countryCurrencies(params.code);
				await query(`DELETE FROM "YieldCalendarCountry" WHERE "code"=$1`, [params.code]);
				await recalculate(currencies, "0001-01-01", `calendar:${randomUUID()}`);
			});
			return { success: true };
		},
		{ params: t.Object({ code: Code }), response: Result },
	)
	.post(
		"/admin/yield-calendar/countries/:code/holidays",
		async ({ request, params, body }) => {
			await requireAdmin(request);
			const id = randomUUID();
			const date = checkedDate(body.date);
			const name = checkedName(body.name);
			await withRawTransaction(async query => {
				await countryCurrencies(params.code);
				const existing = await query(
					`SELECT "id" FROM "YieldCalendarHoliday" WHERE "countryCode"=$1 AND "date"=$2`,
					[params.code, date],
				);
				if (existing.length) throw new HttpException("País já possui feriado nesta data", 409);
				await query(
					`INSERT INTO "YieldCalendarHoliday" ("id","countryCode","date","name") VALUES ($1,$2,$3,$4)`,
					[id, params.code, date, name],
				);
				await saveOverride(params.code, date, name, "INCLUDE");
				await recalculateCountry(params.code, date, `calendar:${id}`);
			});
			return { id };
		},
		{ body: Holiday, params: t.Object({ code: Code }), response: t.Object({ id: t.String() }) },
	)
	.put(
		"/admin/yield-calendar/holidays/:id",
		async ({ request, params, body }) => {
			await requireAdmin(request);
			const date = checkedDate(body.date);
			const name = checkedName(body.name);
			await withRawTransaction(async query => {
				const [holiday] = await query<{ countryCode: string; date: string }>(
					`SELECT "countryCode","date"::text FROM "YieldCalendarHoliday" WHERE "id"=$1 FOR UPDATE`,
					[params.id],
				);
				if (!holiday) throw new HttpException("Feriado não encontrado", 404);
				const existing = await query(
					`SELECT "id" FROM "YieldCalendarHoliday" WHERE "countryCode"=$1 AND "date"=$2 AND "id"<>$3`,
					[holiday.countryCode, date, params.id],
				);
				if (existing.length) throw new HttpException("País já possui feriado nesta data", 409);
				await query(`UPDATE "YieldCalendarHoliday" SET "date"=$2,"name"=$3 WHERE "id"=$1`, [
					params.id,
					date,
					name,
				]);
				await saveOverride(holiday.countryCode, holiday.date, null, "EXCLUDE");
				await saveOverride(holiday.countryCode, date, name, "INCLUDE");
				await recalculateCountry(
					holiday.countryCode,
					date < holiday.date ? date : holiday.date,
					`calendar:${randomUUID()}`,
				);
			});
			return { success: true };
		},
		{ body: Holiday, response: Result },
	)
	.delete(
		"/admin/yield-calendar/holidays/:id",
		async ({ request, params }) => {
			await requireAdmin(request);
			await withRawTransaction(async query => {
				const [holiday] = await query<{ countryCode: string; date: string }>(
					`DELETE FROM "YieldCalendarHoliday" WHERE "id"=$1 RETURNING "countryCode","date"::text`,
					[params.id],
				);
				if (!holiday) throw new HttpException("Feriado não encontrado", 404);
				await saveOverride(holiday.countryCode, holiday.date, null, "EXCLUDE");
				await recalculateCountry(holiday.countryCode, holiday.date, `calendar:${randomUUID()}`);
			});
			return { success: true };
		},
		{ response: Result },
	);

async function recalculateCountry(countryCode: string, date: string, cause: string) {
	const accounts = await queryRaw<{ id: string }>(
		`SELECT "id" FROM "FinancialAccount" WHERE "countryCode"=$1 AND "type" <> 'CREDIT_CARD'`,
		[countryCode],
	);
	for (const account of accounts)
		await enqueueAccountYieldRecalculation(account.id, new Date(`${date}T12:00:00`), cause);
}
async function saveOverride(countryCode: string, date: string, name: string | null, action: string) {
	await queryRaw(
		`INSERT INTO "YieldCalendarOverride" ("id","countryCode","date","name","action","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT ("countryCode","date") DO UPDATE SET "name"=EXCLUDED."name","action"=EXCLUDED."action","updatedAt"=NOW()`,
		[randomUUID(), countryCode, date, name, action],
	);
}
