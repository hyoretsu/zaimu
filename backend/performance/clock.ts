import { installBusinessClock } from "@zaimu/finance/time-zone";

export const PERFORMANCE_REFERENCE_DATE = "2026-10-04";
export const PERFORMANCE_REFERENCE_TIMESTAMP = `${PERFORMANCE_REFERENCE_DATE}T12:00:00.000Z`;

/** Fix only the financial reference; operational time always stays native. */
export function installPerformanceClock(reference = PERFORMANCE_REFERENCE_TIMESTAMP) {
	const timestamp = Date.parse(reference);
	if (!Number.isFinite(timestamp)) throw new Error("Invalid performance reference date");
	return installBusinessClock(() => new Date(timestamp));
}
