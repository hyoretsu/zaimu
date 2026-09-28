import { describe, expect, test } from "bun:test";
import type { CreditCard, CreditCardStatement } from "./api";
import {
	applyStatementCredits,
	calculateCreditCardLimit,
	getCreditCardDisplayName,
	getCurrentCreditCardStatement,
} from "./credit-card";

const card = { creditLimit: 1_000 } as CreditCard;

const statement = (
	id: string,
	statementDate: string,
	totalAmount: number,
	paidAmount: number,
): CreditCardStatement => ({
	balanceAmount: totalAmount - paidAmount,
	creditCardId: "card-id",
	dueDate: statementDate,
	id,
	isPaid: false,
	paidAmount,
	statementDate,
	totalAmount,
});

describe("applyStatementCredits", () => {
	test("carries an overpayment into following statements", () => {
		const result = applyStatementCredits([
			statement("second", "2026-09-01", 80, 0),
			statement("first", "2026-08-01", 100, 150),
		]);

		expect(result).toEqual([
			expect.objectContaining({ balanceAmount: 30, id: "second", isPaid: false }),
			expect.objectContaining({ balanceAmount: 0, id: "first", isPaid: true }),
		]);
	});

	test("recalculates credit when older purchases are filled later", () => {
		const result = applyStatementCredits([
			statement("first", "2026-08-01", 150, 150),
			statement("second", "2026-09-01", 80, 0),
		]);

		expect(result).toEqual([
			expect.objectContaining({ balanceAmount: 0, id: "first", isPaid: true }),
			expect.objectContaining({ balanceAmount: 80, id: "second", isPaid: false }),
		]);
	});

	test("marks fully paid statements immediately and advances excess credit", () => {
		const result = applyStatementCredits([
			statement("current", "2026-09-04", 100, 150),
			statement("next", "2026-10-04", 80, 0),
		]);

		expect(result).toEqual([
			expect.objectContaining({ balanceAmount: 0, id: "current", isPaid: true }),
			expect.objectContaining({ balanceAmount: 30, id: "next", isPaid: false }),
		]);
	});

	test("keeps a partial pre-closing payment open", () => {
		const result = applyStatementCredits([statement("current", "2026-09-04", 100, 40)]);

		expect(result).toEqual([expect.objectContaining({ balanceAmount: 60, id: "current", isPaid: false })]);
	});

	test("recalculates excess credit through every following statement", () => {
		const result = applyStatementCredits([
			statement("first", "2026-09-04", 100, 350),
			statement("second", "2026-10-04", 80, 0),
			statement("third", "2026-11-04", 20, 0),
		]);

		expect(result).toEqual([
			expect.objectContaining({ balanceAmount: 0, id: "first" }),
			expect.objectContaining({ balanceAmount: -170, id: "second" }),
			expect.objectContaining({ balanceAmount: -150, id: "third" }),
		]);
	});

	test("shows the remaining credit on every following statement", () => {
		const result = applyStatementCredits([
			statement("september", "2026-09-04", 278.98, 3166.82),
			statement("october", "2026-10-04", 248, 0),
			statement("november", "2026-11-04", 248, 0),
		]);

		expect(result).toEqual([
			expect.objectContaining({ balanceAmount: 0, id: "september", isPaid: true }),
			expect.objectContaining({ balanceAmount: -2639.84, id: "october", isPaid: true }),
			expect.objectContaining({ balanceAmount: -2391.84, id: "november", isPaid: true }),
		]);
	});
});

describe("calculateCreditCardLimit", () => {
	test("uses payments to release limit before they exceed all remaining statements", () => {
		const statements = [statement("first", "2026-08-01", 100, 150), statement("second", "2026-09-01", 80, 0)];

		expect(calculateCreditCardLimit(card, statements, "2026-08-01")).toEqual({
			availableLimit: 970,
			effectiveLimit: 1_000,
			temporaryCredit: 0,
			usedLimit: 30,
		});
	});

	test("adds only the payment beyond every remaining statement to the temporary limit", () => {
		const statements = [statement("first", "2026-08-01", 100, 150), statement("second", "2026-09-01", 20, 0)];

		expect(calculateCreditCardLimit(card, statements, "2026-08-01")).toEqual({
			availableLimit: 1_030,
			effectiveLimit: 1_030,
			temporaryCredit: 30,
			usedLimit: 0,
		});
	});

	test("ignores overdue statements when calculating the current limit", () => {
		const statements = [
			statement("overdue", "2026-08-01", 900, 0),
			statement("current", "2026-09-01", 100, 200),
		];

		expect(calculateCreditCardLimit(card, statements, "2026-09-01")).toEqual({
			availableLimit: 1_100,
			effectiveLimit: 1_100,
			temporaryCredit: 100,
			usedLimit: 0,
		});
	});

	test("keeps the temporary credit separate from the configured security deposit", () => {
		const cardWithDeposit = { creditLimit: 1_000, securityDeposit: 500 } as CreditCard;

		expect(
			calculateCreditCardLimit(cardWithDeposit, [statement("first", "2026-08-01", 100, 150)], "2026-08-01")
				.effectiveLimit,
		).toBe(1_050);
	});
});

describe("getCreditCardDisplayName", () => {
	test("uses the account name and falls back to its institution", () => {
		expect(
			getCreditCardDisplayName({ accountName: "Cartão viagens", institutionName: "Banco Exemplo" }),
		).toBe("Cartão viagens");
		expect(getCreditCardDisplayName({ accountName: null, institutionName: "Banco Exemplo" })).toBe(
			"Banco Exemplo",
		);
	});
});

describe("getCurrentCreditCardStatement", () => {
	test("selects the current cycle instead of the oldest open statement", () => {
		const statements = [
			statement("april", "2026-04-17", 30.66, 0),
			statement("september", "2026-09-17", 140, 0),
			statement("october", "2026-10-17", 80, 0),
		];

		expect(
			getCurrentCreditCardStatement(statements, { statementDay: 17 }, new Date("2026-09-17T12:00:00")),
		).toMatchObject({ id: "september" });
	});

	test("moves to the next cycle after the statement closes", () => {
		const statements = [
			statement("september", "2026-09-17", 140, 0),
			statement("october", "2026-10-17", 80, 0),
		];

		expect(
			getCurrentCreditCardStatement(statements, { statementDay: 17 }, new Date("2026-09-18T12:00:00")),
		).toMatchObject({ id: "october" });
	});
});
