import countryTimeZones from "./country-time-zones.json";

const formatters = new Map<string, Intl.DateTimeFormat>();

// Primary national calendar zones from date-holidays@3.37.0, shared with guest books.
export function countryTimeZone(country?: string | null): string {
	return countryTimeZones[country as keyof typeof countryTimeZones] ?? "GMT";
}

export function isTimeZone(value: string): boolean {
	if (!value || value.length > 100) return false;
	try {
		new Intl.DateTimeFormat("en", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

export function resolveTimeZone(preference?: string | null, country?: string | null): string {
	return preference && isTimeZone(preference) ? preference : countryTimeZone(country);
}

export function financialDateKey(now = new Date(), timeZone = "GMT"): string {
	let formatter = formatters.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-CA", {
			day: "2-digit",
			month: "2-digit",
			timeZone,
			year: "numeric",
		});
		formatters.set(timeZone, formatter);
	}
	const parts = formatter.formatToParts(now);
	const part = (type: string) => parts.find(item => item.type === type)!.value;
	return `${part("year")}-${part("month")}-${part("day")}`;
}
