import { expect, test } from "bun:test";
import { chartScale } from "./chart-scale";

test("60 thousand does not expand to an 80 thousand ceiling", () => {
	const { domain, ticks } = chartScale([0, 338.19, 60084.55, 60422.73]);
	expect(domain[0]).toBe(0);
	expect(domain[1]).toBeGreaterThan(60422.73);
	expect(domain[1]).toBeLessThan(65000);
	expect(ticks).toEqual([0, 20000, 40000, 60000]);
});

test("negative and mixed values remain inside the scale with zero guide", () => {
	for (const values of [
		[-60000, -200],
		[-10000, 60000],
		[0.02, 0.08],
	]) {
		const { domain, ticks } = chartScale(values);
		expect(domain[0]).toBeLessThanOrEqual(Math.min(...values));
		expect(domain[1]).toBeGreaterThanOrEqual(Math.max(...values));
		expect(ticks).toContain(0);
		expect(ticks.every(tick => tick >= domain[0] && tick <= domain[1])).toBe(true);
	}
});

test("empty, zero and invalid data retain a usable scale", () => {
	for (const values of [[], [0], [Number.NaN, Number.POSITIVE_INFINITY]]) {
		expect(chartScale(values).domain).toEqual([0, 1]);
	}
});
