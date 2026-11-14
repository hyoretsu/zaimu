import countryTimeZones from "./country-time-zones.json";

// Financial calculations may use an explicit reference instant. Authentication,
// cache expiry, audit timestamps and deadlines must continue using native Date.
// Source entrypoints and bundled API entrypoints share the same domain provider.
const clockKey = Symbol.for("zaimu.business-clock");
const globals = globalThis as unknown as Record<symbol, { now?: () => Date }>;
if (!globals[clockKey]) globals[clockKey] = {};
const clockState = globals[clockKey];

export function businessNow(): Date {
	return clockState.now ? new Date(clockState.now().getTime()) : new Date();
}

/** Install a domain clock and restore the previous provider after scoped work. */
export function installBusinessClock(clock: () => Date) {
	if (!Number.isFinite(clock().getTime())) throw new Error("Invalid business clock");
	const previous = clockState.now;
	clockState.now = clock;
	return () => {
		if (clockState.now === clock) clockState.now = previous;
	};
}

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

export function financialDateKey(now = businessNow(), timeZone = "GMT"): string {
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
