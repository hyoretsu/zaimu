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

import { loadDashboardRows } from "./load-dashboard-data";

test("comparison loads only chart data and requested balance dates", async () => {
	const queries: Array<{ sql: string; values?: unknown[] }> = [];
	const query = async <Row extends Record<string, unknown>>(
		sql: string,
		values?: unknown[],
	): Promise<Row[]> => {
		queries.push({ sql, values });
		return [];
	};
	const date = new Date("2026-10-03T12:00:00");
	const result = await loadDashboardRows(
		query,
		"chart-user",
		{
			balanceDates: [date],
			comparisonEnd: date,
			comparisonStart: date,
			periodEnd: date,
			periodStart: date,
			projectionStart: date,
			today: date,
		},
		true,
	);
	expect(queries).toHaveLength(4);
	expect(queries[0]!.sql).not.toContain('"DebtPerson"');
	expect(queries[0]!.sql).not.toContain('"DebtEvent"');
	expect(queries[2]!.sql).not.toContain("forecastTransaction");
	expect(queries[2]!.sql).not.toContain("activityDate");
	expect(queries[2]!.values).toHaveLength(4);
	expect(queries[3]!.values).toEqual(["chart-user", ["2026-10-03"]]);
	expect(result.debts).toEqual([]);
	expect(result.forecastTransactions).toEqual([]);
	expect(result.activityDates).toEqual([]);
});

test("future comparisons load intervening scheduled transactions from projection start", async () => {
	const queries: Array<{ sql: string; values?: unknown[] }> = [];
	await loadDashboardRows(
		async <Row extends Record<string, unknown>>(sql: string, values?: unknown[]): Promise<Row[]> => {
			queries.push({ sql, values });
			return [];
		},
		"chart-user",
		{
			balanceDates: [],
			comparisonEnd: new Date("2027-01-31T12:00:00"),
			comparisonStart: new Date("2027-01-01T12:00:00"),
			periodEnd: new Date("2027-01-31T12:00:00"),
			periodStart: new Date("2027-01-01T12:00:00"),
			projectionStart: new Date("2026-10-05T12:00:00"),
			today: new Date("2026-10-04T12:00:00"),
		},
		true,
	);
	expect(queries[2]!.values?.[1]).toBe("2026-10-05");
});

test("recurring card payments use purchase composition instead of full payment amount", async () => {
	const rows = creditRows("card-a", 100);
	rows.push({
		data: { amount: 100, creditCardId: "card-a", date: "2026-02-10", id: "payment-a" },
		kind: "payment",
	});
	let queryIndex = 0;
	const result = await loadDashboardRows(
		async <Row extends Record<string, unknown>>(): Promise<Row[]> => {
			const queryRows = [
				[{ data: card("card-a"), kind: "card" }, ...rows],
				[],
				[
					{
						data: {
							amount: 100,
							cardPayment: true,
							date: "2026-02-10",
							id: "payment-a",
							recurring: true,
							type: "EXPENSE",
						},
						kind: "flow",
					},
				],
				[],
			][queryIndex++]!;
			return queryRows as unknown as Row[];
		},
		"chart-user",
		{
			balanceDates: [],
			comparisonEnd: new Date("2026-02-28T12:00:00"),
			comparisonStart: new Date("2026-02-01T12:00:00"),
			periodEnd: new Date("2026-02-28T12:00:00"),
			periodStart: new Date("2026-02-01T12:00:00"),
			projectionStart: new Date("2026-02-21T12:00:00"),
			today: new Date("2026-02-20T12:00:00"),
		},
		true,
	);
	expect(result.flows[0]!.recurringAmount).toBe(0);
});
