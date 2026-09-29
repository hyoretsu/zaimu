import { expect, test } from "bun:test";
import { importedAnticipation, withoutImportedAnticipation } from "@zaimu/finance/imported-anticipation";
import { groupAnticipatedInstallments } from "./anticipated-installments";
import type { CreditCardStatementPurchase } from "./credit-card-statement";

const purchase = (number: number, amount: number, date = "26/08"): CreditCardStatementPurchase => ({
	currentInstallment: number,
	description: "MP*ALIEXPRESS",
	installmentAmount: amount,
	installments: 12,
	purchaseDate: `2026-${number === 1 ? "08" : "07"}-26`,
	statementPurchaseDate: date,
	totalAmount: amount * 12,
});

test("groups accelerated installments while preserving each amount and a distinct purchase", () => {
	const rows = [
		purchase(1, 34.5),
		...Array.from({ length: 11 }, (_, index) => purchase(index + 2, 34.46)),
		purchase(1, 34.71),
	];
	const result = groupAnticipatedInstallments(rows);
	expect(result).toHaveLength(2);
	expect(withoutImportedAnticipation(result[0]!.description)).toBe("MP*ALIEXPRESS");
	expect(importedAnticipation(result[0]!.description)).toEqual([
		{ amountCents: 3450, number: 1 },
		...Array.from({ length: 11 }, (_, index) => ({ amountCents: 3446, number: index + 2 })),
	]);
	expect(result[0]!.totalAmount).toBe(413.56);
	expect(result[1]!.description).toBe("MP*ALIEXPRESS");
});

test("does not collapse installments posted in different months", () => {
	const result = groupAnticipatedInstallments([purchase(1, 34.5), purchase(2, 34.5, "26/09")]);
	expect(result).toHaveLength(2);
	expect(result.every(row => importedAnticipation(row.description) === null)).toBe(true);
});
