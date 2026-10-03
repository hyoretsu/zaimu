import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { cachedReferenceRateAverages, refreshReferenceRateAverages } from "./reference-rate-averages";

const values = new Map<string, string>();
const snapshot = {
	averages: { CDI: 0.04, SELIC: 0.045 },
	endDate: "2026-10-02",
	ready: true,
	startDate: "2016-10-03",
};
const originalStorage = globalThis.localStorage;
beforeEach(() => {
	values.clear();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		},
	});
});
afterEach(() => {
	Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
});
test("fresh averages persist and survive offline requests", async () => {
	const request = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(snapshot));
	expect(await refreshReferenceRateAverages()).toEqual(snapshot);
	request.mockRejectedValue(new Error("offline"));
	expect(await refreshReferenceRateAverages()).toEqual(snapshot);
	request.mockRestore();
});
test("unavailable means never invent rates without a prior cache", async () => {
	const request = spyOn(globalThis, "fetch").mockResolvedValue(
		Response.json({ ...snapshot, averages: { CDI: null, SELIC: null }, ready: false }),
	);
	expect(await refreshReferenceRateAverages()).toBeNull();
	expect(cachedReferenceRateAverages()).toBeNull();
	request.mockRestore();
});
test("invalid cached values are ignored", () => {
	values.set(
		"zaimu:reference-rate-averages:v1",
		JSON.stringify({ ...snapshot, averages: { CDI: "0.05", SELIC: null } }),
	);
	expect(cachedReferenceRateAverages()).toBeNull();
});
