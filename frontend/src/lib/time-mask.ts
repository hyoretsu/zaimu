export type DayPeriod = "AM" | "PM";

/** Whether the browser locale displays times on a 12-hour clock (AM/PM). */
export function usesTwelveHourClock(locale: string = navigator.language): boolean {
	const cycle = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle;
	return cycle === "h11" || cycle === "h12";
}

/** Masks free typing as 24-hour `HH:MM`, clamping hours to 23 and minutes to 59. */
export function mask24Hour(raw: string, previous = "", deleting = false): string {
	let digits = raw.replace(/\D/g, "").slice(0, 4);
	// Backspacing over a guide character (`:` or `_`) removes nothing; drop the last digit instead.
	if (deleting && digits === previous.replace(/\D/g, "")) digits = digits.slice(0, -1);
	const hours = digits.length >= 2 && Number(digits.slice(0, 2)) > 23 ? "23" : digits.slice(0, 2);
	const minutes = digits.length === 4 && Number(digits.slice(2)) > 59 ? "59" : digits.slice(2);
	return minutes ? `${hours}:${minutes}` : hours;
}

/** Display text for the 24-hour mask: guide characters are always present, e.g. `14:__`. */
export function format24Hour(value: string): string {
	const digits = value.replace(/\D/g, "").slice(0, 4).padEnd(4, "_");
	return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** Converts a stored 24-hour `HH:MM` value into 12-hour digits and period. */
export function to12Hour(value: string): { digits: string; period: DayPeriod } {
	const match = /^(\d{2}):(\d{2})$/.exec(value);
	if (!match) return { digits: "", period: "AM" };
	const hours = Number(match[1]);
	const period: DayPeriod = hours >= 12 ? "PM" : "AM";
	const hours12 = hours % 12 === 0 ? 12 : hours % 12;
	return { digits: `${String(hours12).padStart(2, "0")}${match[2]}`, period };
}

/** Converts 12-hour digits and period into a stored `HH:MM`; empty until complete. */
export function from12Hour(digits: string, period: DayPeriod): string {
	if (digits.length !== 4) return "";
	const hours12 = Number(digits.slice(0, 2)) % 12;
	const hours = period === "PM" ? hours12 + 12 : hours12;
	return `${String(hours).padStart(2, "0")}:${digits.slice(2)}`;
}

/** Display text for the 12-hour mask: guide characters are always present, e.g. `02:__ AM`. */
export function format12Hour(digits: string, period: DayPeriod): string {
	const padded = digits.padEnd(4, "_");
	return `${padded.slice(0, 2)}:${padded.slice(2)} ${period}`;
}

/** Parses typed 12-hour text: digits clamped to 01-12 / 00-59, plus an optional a/p period key. */
export function parse12Hour(
	raw: string,
	previousPeriod: DayPeriod,
	previousDigits: string,
	deleting: boolean,
) {
	let digits = raw.replace(/\D/g, "").slice(0, 4);
	if (deleting && digits === previousDigits) digits = digits.slice(0, -1);
	if (digits.length >= 2) {
		const hours = Math.min(Math.max(Number(digits.slice(0, 2)), 1), 12);
		digits = `${String(hours).padStart(2, "0")}${digits.slice(2)}`;
	}
	if (digits.length === 4 && Number(digits.slice(2)) > 59) digits = `${digits.slice(0, 2)}59`;
	// The displayed period is always in `raw`; only a newly typed letter can change it.
	const typed = raw.replace(previousPeriod, "");
	const period: DayPeriod = /p/i.test(typed) ? "PM" : /a/i.test(typed) ? "AM" : previousPeriod;
	return { digits, period };
}
