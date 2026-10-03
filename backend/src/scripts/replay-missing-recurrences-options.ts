import {
	type RecurrenceDefinition,
	recurrenceDates,
	recurrenceNeedsConfiguration,
	shiftRecurrenceDate,
} from "@zaimu/finance/recurrence";

export interface ReplayMissingRecurrencesOptions {
	apply: boolean;
	from: string;
	through: string;
	includeInactive: boolean;
	recurrenceId?: string;
	userId?: string;
	name?: string;
}

export function parseReplayMissingRecurrencesOptions(
	args: string[],
	today: string,
): ReplayMissingRecurrencesOptions {
	const values = new Map<string, string>();
	const flags = new Set<string>();
	const argumentsIterator = args.values();
	for (const arg of argumentsIterator) {
		if (arg === "--apply" || arg === "--include-inactive") {
			if (flags.has(arg)) throw new Error(`Opção repetida: ${arg}`);
			flags.add(arg);
			continue;
		}
		if (!["--from", "--through", "--recurrence-id", "--user-id", "--name"].includes(arg))
			throw new Error(`Opção desconhecida: ${arg}`);
		const value = argumentsIterator.next().value;
		if (!value?.trim() || value.startsWith("--")) throw new Error(`Informe um valor para ${arg}`);
		if (values.has(arg)) throw new Error(`Opção repetida: ${arg}`);
		values.set(arg, value);
	}
	const from = values.get("--from");
	if (!from) throw new Error("Informe --from YYYY-MM-DD para delimitar a recomposição histórica.");
	const through = values.get("--through") ?? today;
	for (const value of [from, through]) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Data inválida: ${value}. Use YYYY-MM-DD.`);
		shiftRecurrenceDate(value, 0);
	}
	if (from > through) throw new Error("Data inicial deve ser igual ou anterior à final.");
	if (through > today) throw new Error("Ocorrências futuras são somente previsões.");
	return {
		apply: flags.has("--apply"),
		from,
		includeInactive: flags.has("--include-inactive"),
		name: values.get("--name"),
		recurrenceId: values.get("--recurrence-id"),
		through,
		userId: values.get("--user-id"),
	};
}

/** Ignore the processing cursor only for this explicitly bounded historical repair. */
export function missingRecurrenceDates(
	recurrence: RecurrenceDefinition,
	occupiedDates: ReadonlySet<string>,
	options: ReplayMissingRecurrencesOptions,
) {
	if (recurrenceNeedsConfiguration(recurrence) || (!recurrence.isActive && !options.includeInactive))
		return [];
	return recurrenceDates(recurrence, options.from, options.through).filter(date => !occupiedDates.has(date));
}

/** Legacy migration could store the edited financial date as the occurrence identity. */
export function resolveOccupiedRecurrenceDates(
	recurrence: RecurrenceDefinition,
	storedDates: Array<string | null>,
	options: ReplayMissingRecurrencesOptions,
) {
	const occupied = new Set<string>();
	const unresolved = new Set<string>();
	for (const date of storedDates) {
		if (!date) {
			unresolved.add("sem data");
			continue;
		}
		occupied.add(date);
		if (recurrenceDates(recurrence, date, date).length > 0) continue;
		if (recurrence.unit === "MONTH" || recurrence.unit === "YEAR") {
			const from = recurrence.unit === "MONTH" ? `${date.slice(0, 7)}-01` : `${date.slice(0, 4)}-01-01`;
			const through =
				recurrence.unit === "MONTH"
					? new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0))
							.toISOString()
							.slice(0, 10)
					: `${date.slice(0, 4)}-12-31`;
			const candidates = recurrenceDates(recurrence, from, through);
			if (candidates.length === 1) {
				occupied.add(candidates[0]!);
				continue;
			}
			if (through < options.from || from > options.through) continue;
		} else if (date < options.from || date > options.through) continue;
		unresolved.add(date);
	}
	return { occupied, unresolved: [...unresolved] };
}
