import { expect, test } from "bun:test";
import { completeTelemetry } from "./telemetry";

test("mandatory telemetry fields cannot be replaced by empty or invalid objects", () => {
	const valid = {
		completed: true,
		cpuMicros: { system: 0, user: 1 },
		eventLoopLagP95Ms: 0,
		memory: { arrayBuffers: 0, external: 0, heapTotal: 1, heapUsed: 1, rss: 1 },
		pool: { idle: 0, total: 1, waiting: 0 },
		spans: [{ durationMs: 1, name: "sql:SELECT", startMs: 0 }],
	};
	expect(completeTelemetry(valid)).toBeTrue();
	for (const field of ["cpuMicros", "pool", "memory"])
		expect(completeTelemetry({ ...valid, [field]: {} })).toBeFalse();
	for (const value of [undefined, Number.NaN, -1, "0"])
		expect(completeTelemetry({ ...valid, eventLoopLagP95Ms: value })).toBeFalse();
	expect(completeTelemetry({ ...valid, spans: [] })).toBeFalse();
	expect(completeTelemetry({ ...valid, completed: false })).toBeFalse();
	expect(
		completeTelemetry({ ...valid, spans: [{ durationMs: Number.NaN, name: "sql:SELECT", startMs: 0 }] }),
	).toBeFalse();
});
