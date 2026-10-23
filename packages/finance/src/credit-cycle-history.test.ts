import { expect, test } from "bun:test";
import {
	type CreditBook,
	changeBookCalendar,
	creditBookPlan,
	ensureBookStatement,
	materializeBookInstallments,
	newBookPurchase,
	synchronizeImportedStatementDates,
	updateBookPurchaseDate,
} from "./credit-book";
import {
	calculateStatementBalances,
	calendarCycles,
	paymentStatement,
	previewCalendarTransition,
	readCalendarHistory,
} from "./credit-card";

const fixture = (): CreditBook => ({
	card: {
		dueDay: 8,
		id: "card",
		ignoreStatementsBefore: null,
		institutionId: null,
		refundPolicy: null,
		statementDay: 1,
		userId: "owner",
		workingDueDate: true,
	},
	charges: [],
	installments: [],
	payments: [],
	purchases: [],
	refunds: [],
	statements: [],
});
const transition = () => ({
	...previewCalendarTransition(
		{ dueDay: 8, statementDay: 1 },
		{ dueDay: 24, statementDay: 17, workingDueDate: true },
		"2024-10-02",
		"EXTRA_CYCLE",
		"PER_CYCLE",
	),
	firstDueDate: "2024-10-24",
	firstStatementDate: "2024-10-17",
});

test("Nubank transition preserves October 8 and adds October 24 with consecutive installments", () => {
	const book = fixture();
	const original = ensureBookStatement(book, "2024-10-01", {
		dueDate: "2024-10-08",
		statementDate: "2024-10-01",
	});
	const purchase = newBookPurchase(book, {
		description: "Purchase",
		installments: 12,
		purchaseDate: "2024-09-15",
		totalAmount: 248.8,
	});
	materializeBookInstallments(book, "2024-09-15");
	const old = structuredClone(book.card);
	changeBookCalendar(book, old, transition());
	const plan = creditBookPlan(book);
	const dates = plan.installments
		.filter(item => item.purchaseId === purchase.id)
		.slice(0, 3)
		.map(item => plan.statements.find(s => s.id === item.statementId)!.dueDate);
	expect(dates).toEqual(["2024-10-08", "2024-10-24", "2024-11-25"]);
	expect(book.statements.find(s => s.id === original.id)?.dueDate).toBe("2024-10-08");
	expect(calendarCycles(book.card, "2024-09-01", "2024-11-30").map(item => item.statementDate)).toEqual([
		"2024-09-01",
		"2024-10-01",
		"2024-10-17",
		"2024-11-17",
	]);
});

test("monthly installment policy skips extra same-month invoice", () => {
	const book = fixture();
	ensureBookStatement(book, "2024-10-01", { dueDate: "2024-10-08", statementDate: "2024-10-01" });
	newBookPurchase(book, {
		description: "Purchase",
		installments: 3,
		purchaseDate: "2024-09-15",
		totalAmount: 90,
	});
	changeBookCalendar(book, structuredClone(book.card), { ...transition(), installmentMode: "PER_MONTH" });
	const plan = creditBookPlan(book);
	expect(
		plan.installments.map(item => plan.statements.find(s => s.id === item.statementId)!.dueDate),
	).toEqual(["2024-10-08", "2024-11-25", "2024-12-24"]);
});

test("imports create distinct October cycles in either order and repeat without duplication", () => {
	for (const reverse of [false, true]) {
		const book = fixture();
		const dates = [
			{ dueDate: "2024-09-09", statementDate: "2024-09-01" },
			{ dueDate: "2024-10-08", statementDate: "2024-10-01" },
			{ dueDate: "2024-10-24", statementDate: "2024-10-17" },
			{ dueDate: "2024-11-25", statementDate: "2024-11-17" },
		];
		for (const item of reverse ? dates.toReversed() : dates)
			synchronizeImportedStatementDates(book, item).isFullySynced = true;
		const ids = book.statements.map(item => item.id).sort();
		for (const item of dates) synchronizeImportedStatementDates(book, item);
		expect(book.statements).toHaveLength(4);
		expect(book.statements.map(item => item.id).sort()).toEqual(ids);
	}
});

test("explicit correction preserves statement identity, payments and manual amount", () => {
	const book = fixture();
	const first = synchronizeImportedStatementDates(book, {
		dueDate: "2024-10-08",
		statementDate: "2024-10-01",
	});
	first.manualTotalAmount = 154.15;
	book.payments = [{ amount: 154.15, date: "2024-10-01", id: "payment" }];
	expect(
		synchronizeImportedStatementDates(
			book,
			{ dueDate: "2024-10-09", statementDate: "2024-10-02" },
			first.id,
		).id,
	).toBe(first.id);
	expect(book.statements).toHaveLength(1);
	expect(first.manualTotalAmount).toBe(154.15);
	expect(book.payments).toHaveLength(1);
});

test("two October invoices keep payment assignment and carry principal exactly once", () => {
	const statements = [
		{ dueDate: "2024-10-08", id: "a", statementDate: "2024-10-01", totalAmount: 100 },
		{ dueDate: "2024-10-24", id: "b", statementDate: "2024-10-17", totalAmount: 50 },
	];
	expect(paymentStatement(statements, "2024-10-01")?.id).toBe("a");
	expect(paymentStatement(statements, "2024-10-17")?.id).toBe("b");
	const replay = calculateStatementBalances(
		statements,
		[
			{ amount: 100, date: "2024-10-01" },
			{ amount: 50, date: "2024-10-17" },
		],
		"2024-11-01",
	);
	expect(replay.map(item => item.balanceAmount)).toEqual([0, 0]);
});

test("next-cycle default, short February and year rollover produce valid dates", () => {
	const period = previewCalendarTransition(
		{ dueDay: 8, statementDay: 1 },
		{ dueDay: 24, statementDay: 17 },
		"2024-10-02",
	);
	expect(period.firstStatementDate).toBe("2024-11-17");
	const cycles = calendarCycles({ dueDay: 8, statementDay: 31 }, "2024-12-01", "2025-03-31");
	expect(cycles[0]).toEqual({ dueDate: "2025-01-08", statementDate: "2024-12-31" });
	expect(cycles[2]?.statementDate).toBe("2025-02-28");
});

test("calendar transport decoding validates dates and converts numeric transport values", () => {
	const period = transition();
	expect(readCalendarHistory([{ ...period, dueDay: "24", statementDay: "17" }])).toEqual([period]);
	expect(readCalendarHistory(null)).toBeNull();
	expect(() => readCalendarHistory({})).toThrow("Histórico");
	expect(() => readCalendarHistory([{ ...period, firstDueDate: "2024-02-30" }])).toThrow("Data");
});

test("purchase date recomposition retains consecutive calendar cycles", () => {
	const book = fixture();
	changeBookCalendar(book, structuredClone(book.card), transition());
	const purchase = newBookPurchase(book, {
		description: "Purchase",
		installments: 3,
		purchaseDate: "2024-09-15",
		totalAmount: 90,
	});
	updateBookPurchaseDate(book, purchase.id, "2024-09-16");
	expect(purchase.installmentStatementDates?.map(item => item?.dueDate)).toEqual([
		"2024-10-08",
		"2024-10-24",
		"2024-11-25",
	]);
});
