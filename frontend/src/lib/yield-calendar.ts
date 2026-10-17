import { currencyHolidayDates } from "@zaimu/finance/yield-calendar";
export interface YieldCalendar {
	coverage?: { countryCode: string; year: number; status: string }[];
	countries: { code: string; name: string }[];
	currencyCountries: { currency: string; countryCode: string }[];
	holidays: { id: string; countryCode: string; date: string; name: string }[];
}
const cacheKey = "zaimu-yield-calendar-v1";
export function cachedYieldCalendar(): YieldCalendar {
	try {
		const saved = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
		if (
			saved &&
			Array.isArray(saved.countries) &&
			Array.isArray(saved.currencyCountries) &&
			Array.isArray(saved.holidays)
		)
			return saved;
	} catch {}
	return { countries: [], currencyCountries: [], holidays: [] };
}
export function holidayDatesForCurrency(calendar: YieldCalendar, currency: string) {
	return [
		...currencyHolidayDates(
			calendar.countries.map(country => ({
				...country,
				currencies: calendar.currencyCountries
					.filter(row => row.countryCode === country.code)
					.map(row => row.currency),
				holidays: calendar.holidays.filter(row => row.countryCode === country.code),
			})),
			currency,
		),
	];
}
export async function fetchYieldCalendar(): Promise<YieldCalendar> {
	const { getYieldCalendar } = await import("./api");
	const response = await getYieldCalendar({ authenticated: false });
	const calendar = {
		countries: response.countries.map(({ code, name }) => ({ code, name })),
		coverage: response.coverage ?? [],
		currencyCountries: response.countries.flatMap(country =>
			country.currencies.map(currency => ({ countryCode: country.code, currency })),
		),
		holidays: response.countries.flatMap(country =>
			country.holidays.map(holiday => ({ ...holiday, countryCode: country.code })),
		),
	};
	try {
		localStorage.setItem(cacheKey, JSON.stringify(calendar));
	} catch {}
	return calendar;
}

export function holidayDatesForAccount(
	calendar: YieldCalendar,
	account: { countryCode?: string | null; currency?: string },
) {
	return account.countryCode
		? calendar.holidays
				.filter(holiday => holiday.countryCode === account.countryCode)
				.map(holiday => holiday.date)
		: [];
}

export function accountCalendarCovered(
	calendar: YieldCalendar,
	account: { countryCode?: string | null },
	from: Date,
	through: Date,
) {
	if (!account.countryCode) return false;
	for (let year = from.getFullYear(); year <= through.getFullYear(); year++) {
		if (
			!calendar.coverage?.some(
				row => row.countryCode === account.countryCode && row.year === year && row.status === "COMPLETE",
			)
		)
			return false;
	}
	return true;
}
