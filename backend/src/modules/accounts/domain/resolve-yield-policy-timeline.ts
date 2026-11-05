export interface YieldTimelineEntry {
	id: string;
	/** Clone of another entry created when a period is split in two. */
	sourceId?: string;
	/** First day covered (inclusive), `YYYY-MM-DD`. */
	start: string;
	/** Day the period ends (exclusive); `null` while open. */
	until: null | string;
	/** Everything but the dates; equal signatures mean the same yield. */
	signature: string;
}

/**
 * Resolves overlaps in the yield history of one scope (institution, profile, country, currency).
 *
 * The `focusId` policy was just saved and wins over what it overlaps: covered periods disappear,
 * a period that contains it is split in two and one that it clips is shortened. A blank end date
 * means "until the next change", so it runs up to the next period instead of replacing it.
 * Afterwards each period is closed where the next starts and a period identical to the previous
 * one, with no gap between them, is absorbed into it.
 */
export function resolveYieldPolicyTimeline(
	entries: YieldTimelineEntry[],
	focusId: null | string,
	newId: () => string,
): YieldTimelineEntry[] {
	let timeline = entries.map(entry => ({ ...entry }));
	const focus = focusId ? timeline.find(entry => entry.id === focusId) : undefined;
	if (focus) {
		const nextStart = timeline
			.filter(entry => entry !== focus && entry.start > focus.start)
			.map(entry => entry.start)
			.toSorted()[0];
		const focusEnd = focus.until ?? nextStart ?? null;
		const resolved: YieldTimelineEntry[] = [];
		for (const entry of timeline) {
			if (entry === focus) {
				resolved.push(entry);
				continue;
			}
			const endsBeforeFocus = entry.until !== null && entry.until <= focus.start;
			const startsAfterFocus = focusEnd !== null && entry.start >= focusEnd;
			if (endsBeforeFocus || startsAfterFocus) {
				resolved.push(entry);
				continue;
			}
			const endsInsideFocus = focusEnd === null || (entry.until !== null && entry.until <= focusEnd);
			if (entry.start >= focus.start) {
				if (!endsInsideFocus) resolved.push({ ...entry, start: focusEnd! });
				continue;
			}
			if (!endsInsideFocus)
				resolved.push({ ...entry, id: newId(), sourceId: entry.id, start: focusEnd! });
			resolved.push({ ...entry, until: focus.start });
		}
		timeline = resolved;
	}

	timeline.sort((left, right) => left.start.localeCompare(right.start));
	const result: YieldTimelineEntry[] = [];
	for (const entry of timeline) {
		const previous = result.at(-1);
		if (!previous) {
			result.push(entry);
			continue;
		}
		const contiguous = previous.until === null || previous.until >= entry.start;
		if (contiguous && previous.signature === entry.signature) {
			previous.until = entry.until;
			continue;
		}
		if (previous.until === null || previous.until > entry.start) previous.until = entry.start;
		result.push(entry);
	}
	return result;
}
