import { currencyHolidayDates, type YieldCalendarCountry } from "@zaimu/finance/yield-calendar";
import { queryRaw } from "~/shared/infra/sql";

export async function loadYieldCalendar(): Promise<{ countries: YieldCalendarCountry[] }> {
	const countries = await queryRaw<{ code: string; name: string }>(
		`SELECT "code","name" FROM "YieldCalendarCountry" ORDER BY "name","code"`,
	);
	const currencies = await queryRaw<{ countryCode: string; currency: string }>(
		`SELECT "countryCode","currency" FROM "YieldCalendarCurrency" ORDER BY "currency"`,
	);
	const holidays = await queryRaw<{ id: string; countryCode: string; date: string; name: string }>(
		`SELECT "id","countryCode","date"::text,"name" FROM "YieldCalendarHoliday" ORDER BY "date","name"`,
	);
	return {
		countries: countries.map(country => ({
			...country,
			currencies: currencies.filter(row => row.countryCode === country.code).map(row => row.currency),
			holidays: holidays
				.filter(row => row.countryCode === country.code)
				.map(({ id, date, name }) => ({ date, id, name })),
		})),
	};
}

export async function getCurrencyHolidays(currency: string): Promise<Set<string>> {
	return currencyHolidayDates((await loadYieldCalendar()).countries, currency);
}

export async function loadCurrencyHolidayRows() {
	return queryRaw<{ id: string; countryCode: string; currency: string; date: Date; name: string }>(
		`SELECT h."id",h."countryCode",c."currency",h."date",h."name" FROM "YieldCalendarHoliday" h JOIN "YieldCalendarCurrency" c ON c."countryCode"=h."countryCode" ORDER BY h."date"`,
	);
}
