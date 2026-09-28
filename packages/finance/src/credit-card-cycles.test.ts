import { describe, expect, test } from "bun:test";
import { statementCycles } from "./credit-card";

const card = { dueDay: 20, statementDay: 15 };
const statement = (month: string, totalAmount: number) => ({
	dueDate: `2024-${month}-20`,
	id: month,
	statementDate: `2024-${month}-15`,
	totalAmount,
});
const create = (dates: { dueDate: string; statementDate: string }) => ({
	...dates,
	id: `cycle-${dates.statementDate}`,
	totalAmount: 0,
});

describe("statement cycles before first activity", () => {
	test("does not fill months preceding first non-zero invoice", () => {
		const cycles = statementCycles(
			[statement("01", 0), statement("05", 10)],
			card,
			[],
			create,
			"2024-07-01",
		);
		expect(cycles.map(cycle => cycle.statementDate)).toEqual([
			"2024-01-15",
			"2024-05-15",
			"2024-06-15",
			"2024-07-15",
		]);
	});

	test("retains a payment cycle before the first purchase invoice", () => {
		const cycles = statementCycles(
			[statement("05", 10)],
			card,
			[{ amount: 5, date: "2024-03-01" }],
			create,
			"2024-05-01",
		);
		expect(cycles.map(cycle => cycle.statementDate)).toEqual(["2024-05-15", "2024-03-15", "2024-04-15"]);
	});
});
