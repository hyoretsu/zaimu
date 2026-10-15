import type { CoverageItem } from "./types";

export function groupCoverageItems(items: CoverageItem[]) {
	const groups = new Map<
		string,
		{ id: string; title: string; collapsible: boolean; items: CoverageItem[] }
	>();
	const seen = new Set<string>();
	for (const item of items) {
		if (item.kind === "POLICY" || item.kind === "PROFILE_HISTORY" || item.kind === "ASSOCIATION") continue;
		const collapsible = item.kind === "CALENDAR" || item.kind === "ASSOCIATION";
		const id =
			item.kind === "CALENDAR"
				? `CALENDAR:${item.countryCode}`
				: item.kind === "ASSOCIATION"
					? `ASSOCIATION:${item.name}`
					: item.id;
		const signature = JSON.stringify([
			id,
			item.name,
			item.source,
			item.version,
			item.startDate,
			item.endDate,
			item.status,
			item.gaps,
		]);
		if (seen.has(signature)) continue;
		seen.add(signature);
		let group = groups.get(id);
		if (!group) {
			group = {
				collapsible,
				id,
				items: [],
				title:
					item.kind === "CALENDAR" ? `Calendário - ${item.countryCode}` : `Associação CLDR - ${item.name}`,
			};
			groups.set(id, group);
		}
		group.items.push(item);
	}
	return [...groups.values()];
}
