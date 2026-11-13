export type DayPeriod = "AM" | "PM";

export const DIGIT_SLOT = /\d/;
export const TWELVE_HOUR_SLOT = /[\dAPMapm]/;

interface Edit<T> {
	caretSlots: number;
	next: T;
}

/** Removes the editable character before the caret when backspace only crossed a guide (`:`, `_`, space). */
function dropBeforeCaret(chars: string[], caretSlots: number, guideOnly: boolean) {
	if (!guideOnly || caretSlots <= 0) return caretSlots;
	chars.splice(caretSlots - 1, 1);
	return caretSlots - 1;
}

/** Masks free typing as 24-hour `HH:MM`, clamping hours to 23 and minutes to 59. */
export function mask24Hour(raw: string): string {
	const digits = raw.replace(/\D/g, "").slice(0, 4);
	const hours = digits.length >= 2 && Number(digits.slice(0, 2)) > 23 ? "23" : digits.slice(0, 2);
	const minutes = digits.length === 4 && Number(digits.slice(2)) > 59 ? "59" : digits.slice(2);
	return minutes ? `${hours}:${minutes}` : hours;
}

/** Applies an edit of the 24-hour mask, tracking how many digits precede the caret. */
export function edit24Hour(raw: string, caret: number, previous: string): Edit<string> {
	const chars = [...raw].filter(char => DIGIT_SLOT.test(char));
	const previousDigits = previous.replace(/\D/g, "");
	const guideOnly = raw.length < format24Hour(previous).length && chars.join("") === previousDigits;
	const caretSlots = dropBeforeCaret(
		chars,
		[...raw.slice(0, caret)].filter(char => DIGIT_SLOT.test(char)).length,
		guideOnly,
	);
	const next = mask24Hour(chars.join(""));
	return { caretSlots: Math.min(caretSlots, next.replace(/\D/g, "").length), next };
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

/** Display text for the 12-hour mask: guide characters are always present, e.g. `02:__ AM`; `__` when the period was erased. */
export function format12Hour(digits: string, period: DayPeriod | null): string {
	const padded = digits.padEnd(4, "_");
	return `${padded.slice(0, 2)}:${padded.slice(2)} ${period ?? "__"}`;
}

export interface Draft12Hour {
	digits: string;
	period: DayPeriod | null;
}

/**
 * Applies an edit of the 12-hour mask: digits clamped to 01-12 / 00-59, the period is its own editable
 * part (erasable, then re-typed with `a`/`p`), and the caret slot count follows the edited character.
 */
export function edit12Hour(raw: string, caret: number, previous: Draft12Hour): Edit<Draft12Hour> {
	const chars = [...raw].filter(char => TWELVE_HOUR_SLOT.test(char));
	const previousSlots = `${previous.digits}${previous.period ?? ""}`;
	const guideOnly =
		raw.length < format12Hour(previous.digits, previous.period).length &&
		chars.join("").toUpperCase() === previousSlots;
	const caretSlots = dropBeforeCaret(
		chars,
		[...raw.slice(0, caret)].filter(char => TWELVE_HOUR_SLOT.test(char)).length,
		guideOnly,
	);

	let digits = chars
		.filter(char => DIGIT_SLOT.test(char))
		.join("")
		.slice(0, 4);
	const typedHours = Number(digits.slice(0, 2));
	const is24Hour = digits.length >= 2 && typedHours >= 13 && typedHours <= 23;
	if (digits.length >= 2) {
		const hours = is24Hour ? typedHours - 12 : Math.min(Math.max(typedHours, 1), 12);
		digits = `${String(hours).padStart(2, "0")}${digits.slice(2)}`;
	}
	if (digits.length === 4 && Number(digits.slice(2)) > 59) digits = `${digits.slice(0, 2)}59`;

	// Both letters present means one was just typed over the displayed period: it is the other one.
	const letters = chars
		.filter(char => !DIGIT_SLOT.test(char))
		.join("")
		.toUpperCase();
	const hasA = letters.includes("A");
	const hasP = letters.includes("P");
	const period: DayPeriod | null = is24Hour
		? "PM"
		: hasA && hasP
			? previous.period === "AM"
				? "PM"
				: "AM"
			: hasP
				? "PM"
				: hasA
					? "AM"
					: null;

	const slots = digits.length + (period ? 2 : 0);
	return { caretSlots: Math.min(caretSlots, slots), next: { digits, period } };
}
