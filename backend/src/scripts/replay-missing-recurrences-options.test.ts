import { describe, expect, test } from "bun:test";
import type { RecurrenceDefinition } from "@zaimu/finance/recurrence";
import {
	missingRecurrenceDates,
	parseReplayMissingRecurrencesOptions,
	resolveOccupiedRecurrenceDates,
} from "./replay-missing-recurrences-options";

const recurrence: RecurrenceDefinition = {
	amount: 14.99,
	createdAt: "2026-01-01T12:00:00Z",
	creditCardId: "card",
	dayOfMonth: 26,
	id: "recurrence",
	interval: 1,
	isActive: true,
	materializedThrough: "2026-10-02",
	movement: "CARD_PURCHASE",
	name: "Quadrinhos na Sarjeta",
	startDate: "2026-01-01",
	unit: "MONTH",
	updatedAt: "2026-10-02T12:00:00Z",
	userId: "owner",
};
const options = parseReplayMissingRecurrencesOptions(["--from", "2026-09-01"], "2026-10-03");

describe("historical recurrence repair", () => {
	test("recognizes July 10 changed to July 12 with a migrated or missing identity", () => {
		const chatgpt = { ...recurrence, dayOfMonth: 10, name: "ChatGPT Plus" };
		const range = { ...options, from: "2026-07-01" };
		const identities = resolveOccupiedRecurrenceDates(chatgpt, ["2026-07-12"], range);
		expect(identities.unresolved).toEqual([]);
		expect(missingRecurrenceDates(chatgpt, identities.occupied, range)).toEqual(["2026-08-10", "2026-09-10"]);
	});
	test("finds shifted legacy records outside a one-day repair window", () => {
		const chatgpt = { ...recurrence, dayOfMonth: 10 };
		const range = { ...options, from: "2026-07-10", through: "2026-07-10" };
		const identities = resolveOccupiedRecurrenceDates(chatgpt, ["2026-07-12"], range);
		expect(missingRecurrenceDates(chatgpt, identities.occupied, range)).toEqual([]);
	});
	test("preserves stable identities and shifted legacy deletion markers", () => {
		const range = { ...options, from: "2026-07-01" };
		const identities = resolveOccupiedRecurrenceDates(recurrence, ["2026-07-26", "2026-08-28"], range);
		expect(missingRecurrenceDates(recurrence, identities.occupied, range)).toEqual(["2026-09-26"]);
	});
	test("does not treat another month as proof that the missing month exists", () => {
		const identities = resolveOccupiedRecurrenceDates(recurrence, ["2026-08-28"], options);
		expect(missingRecurrenceDates(recurrence, identities.occupied, options)).toEqual(["2026-09-26"]);
	});
	test("blocks uncertain weekly, missing-date and off-cycle interval associations", () => {
		expect(
			resolveOccupiedRecurrenceDates({ ...recurrence, dayOfWeek: 1, unit: "WEEK" }, ["2026-09-12"], options)
				.unresolved,
		).toEqual(["2026-09-12"]);
		expect(resolveOccupiedRecurrenceDates(recurrence, [null], options).unresolved).toEqual(["sem data"]);
		expect(
			resolveOccupiedRecurrenceDates({ ...recurrence, interval: 2 }, ["2026-08-28"], {
				...options,
				from: "2026-08-01",
			}).unresolved,
		).toEqual(["2026-08-28"]);
	});
	test("finds the missing card purchase on day 26 even behind the processing cursor", () => {
		expect(missingRecurrenceDates(recurrence, new Set(), options)).toEqual(["2026-09-26"]);
		expect(recurrence.materializedThrough).toBe("2026-10-02");
	});
	test("preserves concrete identities, manual deletion markers and advanced occurrences", () => {
		// All three kinds occupy their original scheduled date, independent of editable financial dates.
		const range = { ...options, from: "2026-01-01" };
		const occupied = new Set(["2026-01-26", "2026-02-26", "2026-03-26"]);
		expect(missingRecurrenceDates(recurrence, occupied, range)).toEqual([
			"2026-04-26",
			"2026-05-26",
			"2026-06-26",
			"2026-07-26",
			"2026-08-26",
			"2026-09-26",
		]);
		for (const date of missingRecurrenceDates(recurrence, occupied, range)) occupied.add(date);
		expect(missingRecurrenceDates(recurrence, occupied, range)).toEqual([]);
	});
	test("respects end dates and skips incomplete or inactive schedules by default", () => {
		expect(missingRecurrenceDates({ ...recurrence, endDate: "2026-09-25" }, new Set(), options)).toEqual([]);
		expect(missingRecurrenceDates({ ...recurrence, creditCardId: null }, new Set(), options)).toEqual([]);
		expect(missingRecurrenceDates({ ...recurrence, isActive: false }, new Set(), options)).toEqual([]);
		expect(
			missingRecurrenceDates({ ...recurrence, isActive: false }, new Set(), {
				...options,
				includeInactive: true,
			}),
		).toEqual(["2026-09-26"]);
	});
	test("supports every movement without relying on the description", () => {
		for (const movement of ["INCOME", "EXPENSE", "TRANSFER", "CARD_PAYMENT", "CARD_PURCHASE"] as const)
			expect(
				missingRecurrenceDates(
					{
						...recurrence,
						destinationFinancialAccountId: "destination",
						movement,
						originFinancialAccountId: "origin",
					},
					new Set(),
					options,
				),
			).toEqual(["2026-09-26"]);
	});
	test("defaults to simulation and accepts explicit scope and apply flags", () => {
		expect(options.apply).toBe(false);
		expect(options.through).toBe("2026-10-03");
		expect(
			parseReplayMissingRecurrencesOptions(
				[
					"--from",
					"2026-09-26",
					"--through",
					"2026-09-26",
					"--name",
					recurrence.name,
					"--user-id",
					"owner",
					"--recurrence-id",
					"recurrence",
					"--include-inactive",
					"--apply",
				],
				"2026-10-03",
			),
		).toEqual({
			apply: true,
			from: "2026-09-26",
			includeInactive: true,
			name: recurrence.name,
			recurrenceId: "recurrence",
			through: "2026-09-26",
			userId: "owner",
		});
	});
	test("rejects invalid, future or reversed ranges and malformed arguments", () => {
		for (const args of [
			[],
			["--from", "2026-02-30"],
			["--from", "2026-09-01T12:00:00Z"],
			["--from", "2026-10-04"],
			["--from", "2026-10-01", "--through", "2026-09-01"],
			["--from", "2026-09-01", "--through", "2026-10-04"],
			["--from", "--apply"],
			["--from", "2026-09-01", "--unknown"],
			["--from", "2026-09-01", "--from", "2026-09-02"],
			["--from", "2026-09-01", "--apply", "--apply"],
		])
			expect(() => parseReplayMissingRecurrencesOptions(args, "2026-10-03")).toThrow();
	});
});
