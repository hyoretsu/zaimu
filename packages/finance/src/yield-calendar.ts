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
