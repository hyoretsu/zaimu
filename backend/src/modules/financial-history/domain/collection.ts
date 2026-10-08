export type CollectionKind = "CURRENCY" | "INTEREST";
export type UnitState = "PENDING" | "RUNNING" | "COMPLETED" | "NO_DATA" | "FAILED";
export type CollectionState = "PENDING" | "RUNNING" | "COMPLETED" | "COMPLETED_WITH_GAPS" | "FAILED";
export interface HistoryUnit {
	id: string;
	kind: CollectionKind;
	series: string;
	startDate: string;
	endDate: string;
	state: UnitState;
	attempts: number;
	generation: number;
	updatedAt: string;
	lastError?: string | null;
}

export function dateKey(value: Date | string): string {
	const key = value instanceof Date ? value.toISOString().slice(0, 10) : value;
	const date = new Date(`${key}T00:00:00Z`);
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(key) ||
		!Number.isFinite(date.getTime()) ||
		date.toISOString().slice(0, 10) !== key
	)
		throw new RangeError("Data de coleta inválida");
	return key;
}
export function shiftDay(key: string, count: number): string {
	const date = new Date(`${dateKey(key)}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + count);
	return dateKey(date);
}
export function currencyWindow(reference: string) {
	return { endDate: shiftDay(reference, -1), startDate: shiftDay(reference, -365) };
}
export function windowDays(start: string, end: string): string[] {
	const days: string[] = [];
	for (let day = dateKey(start); day <= dateKey(end); day = shiftDay(day, 1)) days.push(day);
	return days;
}
export function historyProgress(
	kind: CollectionKind,
	units: readonly HistoryUnit[],
	window?: { startDate: string; endDate: string },
) {
	const completed = units.filter(
		unit => unit.state === "COMPLETED" || (kind === "INTEREST" && unit.state === "NO_DATA"),
	).length;
	const unavailable = kind === "CURRENCY" ? units.filter(unit => unit.state === "NO_DATA").length : 0;
	const failed = units.filter(unit => unit.state === "FAILED").length;
	const running = units.filter(unit => unit.state === "RUNNING").length;
	const pending = units.filter(unit => unit.state === "PENDING").length;
	let state: CollectionState = "PENDING";
	if (units.length && completed === units.length) state = "COMPLETED";
	else if (running || (pending && completed)) state = "RUNNING";
	else if (!pending && !running && completed) state = "COMPLETED_WITH_GAPS";
	else if (!pending && !running && failed) state = "FAILED";
	else if (!pending && !running && unavailable) state = "COMPLETED_WITH_GAPS";
	const requestedDays = new Set<string>();
	const coveredDays = new Set<string>();
	for (const unit of units) {
		for (const day of windowDays(unit.startDate, unit.endDate)) {
			if (window && (day < window.startDate || day > window.endDate)) continue;
			const key = `${unit.series}:${day}`;
			requestedDays.add(key);
			if (unit.state === "COMPLETED" || (kind === "INTEREST" && unit.state === "NO_DATA"))
				coveredDays.add(key);
		}
	}
	return {
		canRetry: failed > 0,
		completed,
		coveredDays: coveredDays.size,
		failed,
		lastActivity: units.reduce<string | null>(
			(latest, unit) => (!latest || unit.updatedAt > latest ? unit.updatedAt : latest),
			null,
		),
		pending,
		requestedDays: requestedDays.size,
		running,
		state,
		total: units.length,
		unavailable,
	};
}
export function retryDelay(attempt: number, retryAfterMs = 0, random = Math.random): number {
	return Math.max(
		retryAfterMs,
		Math.min(30 * 60_000, 5_000 * 2 ** Math.max(0, attempt - 1)) * (0.8 + random() * 0.4),
	);
}

export function weightedCurrencyRate(samples: readonly { date: string; rate: number }[], reference: string) {
	let weight = 0;
	let total = 0;
	const valid = samples.filter(
		sample =>
			Number.isFinite(sample.rate) &&
			sample.rate > 0 &&
			sample.date < reference &&
			sample.date >= shiftDay(reference, -365),
	);
	for (const sample of valid) {
		const age = (Date.parse(`${reference}T00:00:00Z`) - Date.parse(`${sample.date}T00:00:00Z`)) / 86_400_000;
		const current = 2 ** (-age / 90);
		weight += current;
		total += sample.rate * current;
	}
	return {
		firstDate: valid.reduce<string | null>(
			(date, sample) => (!date || sample.date < date ? sample.date : date),
			null,
		),
		lastDate: valid.reduce<string | null>(
			(date, sample) => (!date || sample.date > date ? sample.date : date),
			null,
		),
		rate: weight ? total / weight : null,
		samples: valid.length,
	};
}
