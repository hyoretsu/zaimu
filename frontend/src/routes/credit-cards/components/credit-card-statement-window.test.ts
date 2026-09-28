import { describe, expect, test } from "bun:test";
import type { CreditCardStatement } from "@/lib/api";
import { getStatementWindow, getStatementWindowRadius } from "./credit-card-statement-window";

const card = { dueDay: 15, id: "card-1", statementDay: 5 };
const actual: CreditCardStatement = {
	balanceAmount: 287.44,
	creditCardId: card.id,
	dueDate: "2026-08-15",
	id: "august-statement",
	isPaid: true,
	paidAmount: 287.44,
	statementDate: "2026-08-05",
	totalAmount: 287.44,
};

describe("credit card statement window", () => {
	test("mobile starts with three months on either side and keeps recorded invoices", () => {
		const window = getStatementWindow(card, [actual], "2026-09", 3, 3);
		expect(window.map(statement => statement.dueDate.slice(0, 7))).toEqual([
			"2026-06",
			"2026-07",
			"2026-08",
			"2026-09",
			"2026-10",
			"2026-11",
			"2026-12",
		]);
		expect(window[2]).toEqual(actual);
		expect(window[3]?.isEmptyCycle).toBe(true);
	});

	test("extends both ends without gaps across year boundaries", () => {
		const window = getStatementWindow(card, [], "2026-01", 6, 6);
		expect(window[0]?.dueDate).toBe("2025-07-15");
		expect(window.at(-1)?.dueDate).toBe("2026-07-15");
		expect(new Set(window.map(statement => statement.id)).size).toBe(13);
	});

	test("desktop keeps two extra items beyond the visible center on each side", () => {
		expect(getStatementWindowRadius(true, 612, 60)).toBe(6);
		expect(getStatementWindowRadius(false, 612, 60)).toBe(3);
	});
});
