export const PERFORMANCE_REFERENCE_DATE = "2026-10-04";
export const PERFORMANCE_REFERENCE_TIMESTAMP = `${PERFORMANCE_REFERENCE_DATE}T12:00:00.000Z`;

export function freezePerformanceDate(reference = PERFORMANCE_REFERENCE_TIMESTAMP) {
	const NativeDate = Date;
	const timestamp = NativeDate.parse(reference);
	if (!Number.isFinite(timestamp)) throw new Error("Invalid performance reference date");
	globalThis.Date = new Proxy(NativeDate, {
		apply() {
			return new NativeDate(timestamp).toString();
		},
		construct(target, args) {
			return args.length ? Reflect.construct(target, args) : new NativeDate(timestamp);
		},
		get(target, key) {
			return key === "now" ? () => timestamp : Reflect.get(target, key);
		},
	});
}
