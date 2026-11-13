export const PERFORMANCE_REFERENCE_DATE = "2026-10-04";
export const PERFORMANCE_REFERENCE_TIMESTAMP = `${PERFORMANCE_REFERENCE_DATE}T12:00:00.000Z`;

/** Shift the process clock to the fixture epoch without stopping TTLs or deadlines. */
export function installPerformanceClock(reference = PERFORMANCE_REFERENCE_TIMESTAMP) {
	const NativeDate = Date;
	const timestamp = NativeDate.parse(reference);
	if (!Number.isFinite(timestamp)) throw new Error("Invalid performance reference date");
	const startedAt = performance.now();
	const now = () => timestamp + Math.floor(performance.now() - startedAt);
	const clock = new Proxy(NativeDate, {
		apply() {
			return new NativeDate(now()).toString();
		},
		construct(target, args, newTarget) {
			return Reflect.construct(target, args.length ? args : [now()], newTarget);
		},
		get(target, key) {
			return key === "now" ? now : Reflect.get(target, key);
		},
	});
	globalThis.Date = clock;
	return () => {
		if (globalThis.Date === clock) globalThis.Date = NativeDate;
	};
}
