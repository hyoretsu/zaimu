import { expect, test } from "bun:test";
import { freezePerformanceDate } from "./clock";

test("fixes wall date while preserving explicit calendar construction and monotonic timing", () => {
	const native = Date;
	try {
		const startedAt = performance.now();
		freezePerformanceDate();
		expect(new Date().toISOString()).toBe("2026-10-04T12:00:00.000Z");
		expect(new Date(2026, 0, 1).getFullYear()).toBe(2026);
		expect(new Date("2020-01-01").toISOString()).toBe("2020-01-01T00:00:00.000Z");
		expect(performance.now()).toBeGreaterThanOrEqual(startedAt);
	} finally {
		globalThis.Date = native;
	}
});
