export interface YieldCalendarCountry {
	code: string;
	name: string;
	currencies: string[];
	holidays: { id: string; date: string; name: string }[];
}

export function currencyHolidayDates(countries: YieldCalendarCountry[], currency: string): Set<string> {
	return new Set(
		countries
			.filter(country => country.currencies.includes(currency))
			.flatMap(country => country.holidays.map(holiday => holiday.date)),
	);
}

/** Country calendar wins independently of currency. Missing country is never inferred from currency. */
export function countryHolidayDates(countries: YieldCalendarCountry[], countryCode: string): Set<string> {
	return new Set(
		countries.find(country => country.code === countryCode)?.holidays.map(holiday => holiday.date) ?? [],
	);
}
