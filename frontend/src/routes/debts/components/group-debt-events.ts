import type { DebtEvent } from "@/lib/api";
import { formatLocalDate, getLocalMonthKey } from "@/lib/date";
import { compareDebtEventsByDateTimeThenLabel } from "./debt-event";

export function groupDebtEventsByMonth(events: DebtEvent[]) {
	const groups = new Map<string, { events: DebtEvent[]; key: string; title: string }>();
	for (const event of events.toSorted(compareDebtEventsByDateTimeThenLabel)) {
		const key = event.date ? getLocalMonthKey(event.date) : "undated";
		let group = groups.get(key);
		if (!group) {
			group = {
				events: [],
				key,
				title: event.date
					? formatLocalDate(event.date, { month: "long", year: "numeric" })
					: "Sem data",
			};
			groups.set(key, group);
		}
		group.events.push(event);
	}
	return [...groups.values()];
}
