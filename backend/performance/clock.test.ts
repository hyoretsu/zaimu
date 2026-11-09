import { expect, test } from "bun:test";
import { installPerformanceClock, PERFORMANCE_REFERENCE_TIMESTAMP } from "./clock";

test("shifted clock keeps Date constructors, subclasses and explicit dates consistent", () => {
	const native = Date;
	const restore = installPerformanceClock();
	try {
		const reference = Date.parse(PERFORMANCE_REFERENCE_TIMESTAMP);
		expect(Date.now()).toBeGreaterThanOrEqual(reference);
		expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-04");
		expect(new Date(2026, 0, 1).getFullYear()).toBe(2026);
		expect(new Date("2020-01-01").toISOString()).toBe("2020-01-01T00:00:00.000Z");
		expect(Reflect.construct(Date, [undefined]).getTime()).toBeNaN();
		expect(Date()).toBe(new Date().toString());
		class DerivedDate extends Date {}
		expect(new DerivedDate()).toBeInstanceOf(DerivedDate);
		expect(new DerivedDate()).toBeInstanceOf(native);
	} finally {
		restore();
	}
	expect(Date).toBe(native);
});

test("shifted clock advances cache age, session TTL and polling deadlines", async () => {
	const native = Date;
	const restore = installPerformanceClock();
	try {
		const wallStart = Date.now();
		const monotonicStart = performance.now();
		const expiresAt = new Date(wallStart + 60_000);
		const initialTtl = expiresAt.getTime() - Date.now();
		await Bun.sleep(35);
		const elapsed = Date.now() - wallStart;
		expect(elapsed).toBeGreaterThanOrEqual(20);
		expect(expiresAt.getTime() - Date.now()).toBeLessThan(initialTtl);
		expect(Date.now()).toBeGreaterThan(wallStart);
		expect(Math.abs(elapsed - (performance.now() - monotonicStart))).toBeLessThan(50);
		// Cache age and Date.now-based polling must progress even with a fixed fixture epoch.
		const deadline = Date.now() + 20;
		let polls = 0;
		while (Date.now() < deadline && polls < 100) {
			await Bun.sleep(5);
			polls++;
		}
		expect(polls).toBeLessThan(100);
		expect(Date.now()).toBeGreaterThanOrEqual(deadline);
	} finally {
		restore();
	}
	expect(Date).toBe(native);
});

test("invalid reference does not install a process clock", () => {
	const native = Date;
	expect(() => installPerformanceClock("invalid")).toThrow("Invalid performance reference date");
	expect(Date).toBe(native);
});
