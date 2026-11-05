import { describe, expect, test } from "bun:test";
import { resolveYieldPolicyTimeline, type YieldTimelineEntry } from "./resolve-yield-policy-timeline";

const entry = (id: string, start: string, until: null | string, signature: string): YieldTimelineEntry => ({
	id,
	signature,
	start,
	until,
});
let counter = 0;
const newId = () => `new-${++counter}`;
const view = (entries: YieldTimelineEntry[]) =>
	entries.map(item => [item.signature, item.start, item.until] as const);

describe("resolveYieldPolicyTimeline", () => {
	test("absorbs a later policy identical to the one saved before it", () => {
		const result = resolveYieldPolicyTimeline(
			[entry("nov", "2026-11-01", null, "a"), entry("jul", "2026-07-01", null, "a")],
			"jul",
			newId,
		);
		expect(view(result)).toEqual([["a", "2026-07-01", null]]);
	});

	test("closes the previous period where a different one starts", () => {
		const result = resolveYieldPolicyTimeline(
			[entry("jul", "2026-07-01", null, "a"), entry("nov", "2026-11-01", null, "b")],
			"nov",
			newId,
		);
		expect(view(result)).toEqual([
			["a", "2026-07-01", "2026-11-01"],
			["b", "2026-11-01", null],
		]);
	});

	test("splits a period that contains the saved one", () => {
		const result = resolveYieldPolicyTimeline(
			[entry("big", "2026-01-01", null, "a"), entry("mid", "2026-04-01", "2026-06-01", "b")],
			"mid",
			newId,
		);
		expect(view(result)).toEqual([
			["a", "2026-01-01", "2026-04-01"],
			["b", "2026-04-01", "2026-06-01"],
			["a", "2026-06-01", null],
		]);
		expect(result[2]?.sourceId).toBe("big");
	});

	test("drops a saved period identical to the one that contains it", () => {
		const result = resolveYieldPolicyTimeline(
			[entry("big", "2026-01-01", null, "a"), entry("mid", "2026-04-01", "2026-06-01", "a")],
			"mid",
			newId,
		);
		expect(view(result)).toEqual([["a", "2026-01-01", null]]);
	});

	test("replaces periods fully covered by the saved one", () => {
		const result = resolveYieldPolicyTimeline(
			[
				entry("x", "2026-03-01", "2026-04-01", "a"),
				entry("y", "2026-04-01", "2026-05-01", "c"),
				entry("new", "2026-02-01", "2026-06-01", "b"),
			],
			"new",
			newId,
		);
		expect(view(result)).toEqual([["b", "2026-02-01", "2026-06-01"]]);
	});

	test("clips the start of a period overlapped at its end", () => {
		const result = resolveYieldPolicyTimeline(
			[entry("old", "2026-03-01", "2026-08-01", "a"), entry("new", "2026-01-01", "2026-05-01", "b")],
			"new",
			newId,
		);
		expect(view(result)).toEqual([
			["b", "2026-01-01", "2026-05-01"],
			["a", "2026-05-01", "2026-08-01"],
		]);
	});

	test("keeps an explicit gap between periods", () => {
		const result = resolveYieldPolicyTimeline(
			[entry("a", "2026-01-01", "2026-02-01", "a"), entry("b", "2026-04-01", null, "a")],
			"b",
			newId,
		);
		expect(view(result)).toEqual([
			["a", "2026-01-01", "2026-02-01"],
			["a", "2026-04-01", null],
		]);
	});
});
