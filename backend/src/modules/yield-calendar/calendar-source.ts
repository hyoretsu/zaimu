import { countryCodes } from "@zaimu/finance/country-codes";
import currencyData from "cldr-core/supplemental/currencyData.json";
import Holidays from "date-holidays";

export const calendarSourceVersion = "date-holidays@3.37.0";
export const currencySourceVersion = "cldr-core@48.2.0";
export const supportedCountryCodes = countryCodes;

export function officialCurrencyAssociations(currency?: string) {
	return Object.entries(currencyData.supplemental.currencyData.region).flatMap(([countryCode, entries]) =>
		entries.flatMap(entry =>
			Object.entries(entry).flatMap(([code, value]) => {
				const range = value as { _from?: string; _to?: string; _tender?: string };
				return countryCodes.includes(countryCode) &&
					range._tender !== "false" &&
					(!currency || code === currency)
					? [
							{
								countryCode,
								currency: code,
								effectiveFrom: range._from ?? "0001-01-01",
								effectiveUntil: range._to ?? null,
							},
						]
					: [];
			}),
		),
	);
}

export function nationalHolidays(countryCode: string, year: number) {
	if (!countryCodes.includes(countryCode) || !Number.isInteger(year) || year < 1900 || year > 2200)
		throw new RangeError("País ou ano inválido");
	const source = new Holidays();
	if (!(countryCode in source.getCountries())) return { holidays: [], status: "UNAVAILABLE" };
	source.init(countryCode, { types: ["public", "bank"] });
	const holidays = source
		.getHolidays(year)
		.filter(holiday => holiday.type === "public" || holiday.type === "bank");
	const days = new Map<string, string[]>();
	for (const holiday of holidays) {
		// date-holidays exposes the civil date in the country's timezone. Do not convert start to UTC.
		const date = holiday.date.slice(0, 10);
		if (!date.startsWith(`${year}-`)) continue;
		const names = days.get(date) ?? [];
		if (!names.includes(holiday.name)) names.push(holiday.name);
		days.set(date, names);
	}
	return {
		holidays: [...days].map(([date, names]) => ({ date, name: names.join(" / ").slice(0, 100) })),
		status: "COMPLETE",
	};
}
