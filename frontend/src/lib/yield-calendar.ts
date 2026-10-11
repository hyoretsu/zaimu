import { currencyHolidayDates, type YieldCalendarCountry } from "@zaimu/finance/yield-calendar";
export interface YieldCalendar {
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
	const { fetchWithAuth } = await import("./dataService");
	const response = await fetchWithAuth<{ countries: YieldCalendarCountry[] }>("/yield-calendar");
	const calendar = {
		countries: response.countries.map(({ code, name }) => ({ code, name })),
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
