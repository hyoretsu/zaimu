/** Calendar dates are timezone-free ISO dates. Never advance from a clamped date. */
export type RecurrenceUnit = "DAY" | "WEEK" | "MONTH" | "YEAR";
export type RecurrenceMovement = "INCOME" | "EXPENSE" | "TRANSFER" | "CARD_PURCHASE" | "CARD_PAYMENT";
export interface RecurrenceSchedule {
	unit: RecurrenceUnit;
	interval: number;
	startDate: string;
	endDate?: string | null;
	dayOfMonth?: number | null;
	dayOfWeek?: number | null;
}
export interface RecurrenceDefinition extends RecurrenceSchedule {
	id: string;
	userId: string;
	name: string;
	amount: number;
	movement: RecurrenceMovement;
	originFinancialAccountId?: string | null;
	destinationFinancialAccountId?: string | null;
	creditCardId?: string | null;
	storeName?: string | null;
	isActive: boolean;
	materializedThrough: string;
	createdAt: string;
	updatedAt: string;
}
const DAY = 86_400_000;
const parseDate = (value: string) => {
	const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) ||
		!Number.isFinite(date.getTime()) ||
		date.toISOString().slice(0, 10) !== value.slice(0, 10)
	)
		throw new Error("Data inválida.");
	return date;
};
export const recurrenceDateKey = (value: Date | string) =>
	typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
export function shiftRecurrenceDate(value: string, days: number) {
	return new Date(parseDate(value).getTime() + days * DAY).toISOString().slice(0, 10);
}
export function validateRecurrenceSchedule(schedule: RecurrenceSchedule) {
	if (
		!["DAY", "WEEK", "MONTH", "YEAR"].includes(schedule.unit) ||
		!Number.isSafeInteger(schedule.interval) ||
		schedule.interval < 1 ||
		schedule.interval > 10_000
	)
		throw new Error("Intervalo deve ser inteiro entre 1 e 10.000.");
	parseDate(schedule.startDate);
	if (schedule.endDate && parseDate(schedule.endDate) < parseDate(schedule.startDate))
		throw new Error("Data final deve ser igual ou posterior à inicial.");
	if (
		schedule.dayOfMonth != null &&
		(!Number.isInteger(schedule.dayOfMonth) || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31)
	)
		throw new Error("Dia do mês inválido.");
	if (
		schedule.dayOfWeek != null &&
		(!Number.isInteger(schedule.dayOfWeek) || schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6)
	)
		throw new Error("Dia da semana inválido.");
}
export function recurrenceDates(
	schedule: RecurrenceSchedule,
	from: string,
	through: string,
	maximum = Number.POSITIVE_INFINITY,
): string[] {
	validateRecurrenceSchedule(schedule);
	const start = parseDate(schedule.startDate);
	const lower = parseDate(from);
	const upper = parseDate(through);
	const end = schedule.endDate ? parseDate(schedule.endDate) : upper;
	const limit = Math.min(upper.getTime(), end.getTime());
	const anchor =
		start.getTime() +
		(schedule.unit === "WEEK" && schedule.dayOfWeek != null
			? ((schedule.dayOfWeek - start.getUTCDay() + 7) % 7) * DAY
			: 0);
	const step = schedule.interval * (schedule.unit === "WEEK" ? 7 : 1);
	let index =
		schedule.unit === "DAY" || schedule.unit === "WEEK"
			? Math.max(0, Math.floor((lower.getTime() - anchor) / DAY / step))
			: Math.max(
					0,
					Math.floor(
						((lower.getUTCFullYear() - start.getUTCFullYear()) * 12 +
							lower.getUTCMonth() -
							start.getUTCMonth()) /
							(schedule.interval * (schedule.unit === "YEAR" ? 12 : 1)),
					),
				);
	const dates: string[] = [];
	while (true) {
		let occurrence: Date;
		if (schedule.unit === "DAY" || schedule.unit === "WEEK")
			occurrence = new Date(anchor + index * step * DAY);
		else {
			const month = new Date(
				Date.UTC(
					start.getUTCFullYear(),
					start.getUTCMonth() + index * schedule.interval * (schedule.unit === "YEAR" ? 12 : 1),
					1,
				),
			);
			const lastDay = new Date(
				Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
			).getUTCDate();
			occurrence = new Date(
				Date.UTC(
					month.getUTCFullYear(),
					month.getUTCMonth(),
					Math.min(schedule.dayOfMonth ?? start.getUTCDate(), lastDay),
				),
			);
		}
		if (!Number.isFinite(occurrence.getTime()) || occurrence.getTime() > limit) break;
		if (occurrence >= start && occurrence >= lower) dates.push(occurrence.toISOString().slice(0, 10));
		if (dates.length >= maximum) break;
		index++;
	}
	return dates;
}
export function legacyRecurrenceSchedule(
	frequency: string,
	startDate: string,
	dayOfMonth?: number | null,
	dayOfWeek?: number | null,
): RecurrenceSchedule {
	const units: Record<string, RecurrenceUnit> = {
		BIWEEKLY: "WEEK",
		DAILY: "DAY",
		MONTHLY: "MONTH",
		WEEKLY: "WEEK",
		YEARLY: "YEAR",
	};
	return {
		dayOfMonth,
		dayOfWeek,
		interval: frequency === "BIWEEKLY" ? 2 : 1,
		startDate: recurrenceDateKey(startDate),
		unit: units[frequency] ?? "MONTH",
	};
}
export function recurrenceNeedsConfiguration(
	recurrence: Pick<
		RecurrenceDefinition,
		"movement" | "originFinancialAccountId" | "destinationFinancialAccountId" | "creditCardId"
	>,
) {
	switch (recurrence.movement) {
		case "INCOME":
			return !recurrence.destinationFinancialAccountId;
		case "EXPENSE":
			return !recurrence.originFinancialAccountId;
		case "TRANSFER":
			return (
				!recurrence.originFinancialAccountId ||
				!recurrence.destinationFinancialAccountId ||
				recurrence.originFinancialAccountId === recurrence.destinationFinancialAccountId
			);
		case "CARD_PURCHASE":
			return !recurrence.creditCardId;
		case "CARD_PAYMENT":
			return !recurrence.originFinancialAccountId || !recurrence.creditCardId;
	}
}

export function nextRecurrenceDate(schedule: RecurrenceSchedule, from: string) {
	return recurrenceDates(schedule, from, "9999-12-31", 1)[0];
}

/** Account effects of forecasts, including both sides of own-account transfers. */
export function recurrenceAccountEffects(
	recurrences: RecurrenceDefinition[],
	from: string,
	through: string,
	processed: ReadonlySet<string> = new Set(),
) {
	const cents = new Map<string, number>();
	const add = (id: string | null | undefined, amount: number) => {
		if (id) cents.set(id, (cents.get(id) ?? 0) + amount);
	};
	for (const recurrence of recurrences) {
		if (
			!recurrence.isActive ||
			recurrenceNeedsConfiguration(recurrence) ||
			recurrence.movement === "CARD_PURCHASE"
		)
			continue;
		for (const date of recurrenceDates(recurrence, from, through)) {
			if (processed.has(`${recurrence.id}:${date}`)) continue;
			const amount = Math.round(recurrence.amount * 100);
			add(recurrence.originFinancialAccountId, -amount);
			add(recurrence.destinationFinancialAccountId, amount);
		}
	}
	return new Map([...cents].map(([id, amount]) => [id, amount / 100]));
}

/** Next scheduled occurrence strictly after today, preserving the original schedule. */
export function getNextRecurrenceDate(schedule: RecurrenceSchedule, today: string) {
	return nextRecurrenceDate(schedule, shiftRecurrenceDate(today, 1));
}
