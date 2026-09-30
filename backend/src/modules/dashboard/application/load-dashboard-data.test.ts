import { describe, expect, test } from "bun:test";
import { type DashboardCard, type DashboardDataRow, replayDashboardStatements } from "./load-dashboard-data";

const card = (id: string): DashboardCard => ({
	creditLimit: 1_000,
	dueDay: 10,
	excludeFromTotals: false,
	financialAccountId: `account-${id}`,
	id,
	ignoreStatementsBefore: null,
	institutionId: null,
	institutionName: null,
	name: id,
	refundPolicy: null,
	statementDay: 1,
	workingDueDate: false,
});

const creditRows = (cardId: string, amount: number): DashboardDataRow[] => {
	const purchaseId = `purchase-${cardId}`;
	const statementId = `statement-${cardId}`;
	return [
		{
			data: {
				categoryId: null,
				createdAt: "2026-01-10T12:00:00.000Z",
				creditCardId: cardId,
				description: "Compra",
				id: purchaseId,
				importedNumbers: [],
				installmentAmounts: [amount],
				purchaseDate: "2026-01-10",
				statementDates: [{ dueDate: "2026-02-10", statementDate: "2026-02-01" }],
				storeName: null,
				subscriptionOccurrenceDate: null,
				totalAmount: amount,
				updatedAt: "2026-01-10T12:00:00.000Z",
			},
			kind: "purchase",
		},
		{
			data: {
				amount,
				creditCardId: cardId,
				hasImportedAmount: false,
				id: purchaseId,
				isSettled: false,
				number: 1,
				occurrenceDate: "2026-01-10",
				purchaseId,
				settledByPurchaseId: null,
				statementId,
			},
			kind: "installment",
		},
		{
			data: {
				creditCardId: cardId,
				dueDate: "2026-02-10",
				id: statementId,
				isFullySynced: true,
				isPaid: false,
				paidAmount: 0,
				statementDate: "2026-02-01",
				totalAmount: amount,
			},
			kind: "statement",
		},
	];
};

describe("replayDashboardStatements", () => {
	test("replays all cards from one batched result without mixing their ledgers", () => {
		const statements = replayDashboardStatements(
			"user-1",
			[card("card-a"), card("card-b")],
			[...creditRows("card-a", 100), ...creditRows("card-b", 250)],
			"2026-01-20",
		);

		expect(statements).toHaveLength(2);
		expect(
			statements.map(statement => ({
				balanceAmount: (statement as typeof statement & { balanceAmount: number }).balanceAmount,
				creditCardId: statement.creditCardId,
			})),
		).toEqual([
			{ balanceAmount: 100, creditCardId: "card-a" },
			{ balanceAmount: 250, creditCardId: "card-b" },
		]);
	});
});
