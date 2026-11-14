import { expect, test } from "bun:test";
import { currentDateKey } from "@zaimu/finance/credit-card";
import { businessNow, financialDateKey } from "@zaimu/finance/time-zone";
import { resolveDashboardRange } from "../src/modules/dashboard/application/dashboard-calculations";
import { yieldSchedulerClock } from "../src/modules/reference-rates/domain/yield-scheduler-clock";
import { installPerformanceClock, PERFORMANCE_REFERENCE_TIMESTAMP } from "./clock";

test("financial defaults use the fixture without replacing native Date", async () => {
	const native = Date;
	const wallStart = Date.now();
	const restore = installPerformanceClock();
	try {
		expect(Date).toBe(native);
		expect(businessNow().toISOString()).toBe(PERFORMANCE_REFERENCE_TIMESTAMP);
		expect(financialDateKey()).toBe("2026-10-04");
		expect(currentDateKey()).toBe("2026-10-04");
		expect(resolveDashboardRange().start.getFullYear()).toBe(2026);
		expect(yieldSchedulerClock()).toEqual(yieldSchedulerClock(new Date(PERFORMANCE_REFERENCE_TIMESTAMP)));
		const expiry = new Date(Date.now() + 60_000);
		const initialTtl = expiry.getTime() - Date.now();
		await Bun.sleep(35);
		expect(Date.now()).toBeGreaterThan(wallStart);
		expect(expiry.getTime() - Date.now()).toBeLessThan(initialTtl);
		expect(businessNow().toISOString()).toBe(PERFORMANCE_REFERENCE_TIMESTAMP);
		// Returned dates cannot mutate the installed reference.
		businessNow().setUTCFullYear(2000);
		expect(businessNow().toISOString()).toBe(PERFORMANCE_REFERENCE_TIMESTAMP);
	} finally {
		restore();
	}
	expect(Date).toBe(native);
	expect(Math.abs(businessNow().getTime() - Date.now())).toBeLessThan(1000);
});

test("invalid reference preserves native and business clocks", () => {
	const native = Date;
	expect(() => installPerformanceClock("invalid")).toThrow("Invalid performance reference date");
	expect(Date).toBe(native);
});

test("a bundled application shares the launcher's business clock", async () => {
	const result = await Bun.build({
		entrypoints: [new URL("../../packages/finance/src/time-zone.ts", import.meta.url).pathname],
		target: "bun",
	});
	expect(result.success).toBe(true);
	const module = await import(
		`data:text/javascript;base64,${Buffer.from(await result.outputs[0]!.text()).toString("base64")}`
	);
	const restore = installPerformanceClock();
	try {
		expect(module.businessNow().toISOString()).toBe(PERFORMANCE_REFERENCE_TIMESTAMP);
	} finally {
		restore();
	}
});
