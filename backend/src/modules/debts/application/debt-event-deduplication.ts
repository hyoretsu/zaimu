interface CreatorLink {
	debtPersonId: null | string;
	eventId: string;
	isCreator: boolean;
}

interface SourcedDebtEvent {
	createdByUserId: string;
	debtPersonId: string;
	id: string;
}

export function getDuplicateCreatorDebtEventIds(links: CreatorLink[]) {
	const eventIds = new Set<string>();
	const people = new Set<string>();
	for (const link of links) {
		if (!link.isCreator || !link.debtPersonId) continue;
		if (people.has(link.debtPersonId)) eventIds.add(link.eventId);
		else people.add(link.debtPersonId);
	}
	return eventIds;
}

export function removeDuplicateSourcedDebtEvents<Event extends SourcedDebtEvent>(
	events: Event[],
	sourceByEventId: Map<string, string>,
) {
	const sources = new Set<string>();
	return events.filter(event => {
		const source = sourceByEventId.get(event.id);
		if (!source) return true;
		const key = `${event.createdByUserId}:${event.debtPersonId}:${source}`;
		if (sources.has(key)) return false;
		sources.add(key);
		return true;
	});
}
