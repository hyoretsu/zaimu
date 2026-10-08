import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";

test("loan payments commit together, stay owner scoped and reject double payment", async () => {
	Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { location: { origin: "http://localhost" } },
	});
	const storage = await import("../localStorage");
	const owner = "guest:loan_test";
	const loan = {
		amortization: "PRICE" as const,
		dueDay: 10,
		firstDueDate: "2026-10-10",
		id: "loan",
		installmentAmount: 100,
		interestRate: 0,
		lender: "Bank",
		principalAmount: 100,
		startDate: "2026-10-01",
		totalInstallments: 1,
		userId: "guest",
	};
	const payment = {
		dueDate: "2026-10-10",
		id: "payment",
		installmentNumber: 1,
		interestPaid: 0,
		isAdvanced: false,
		loanId: "loan",
		principalPaid: 100,
		totalPaid: 100,
	};
	await storage.createLocalLoanWithPayments(loan, [payment], owner);
	expect(await storage.localLoans.getAll(owner)).toHaveLength(1);
	expect(await storage.localLoanPayments.getAll("guest:other")).toHaveLength(0);
	await storage.payLocalLoanInstallment("loan", 1, "2026-10-10", "account", owner, {
		accountAmounts: { payment: 30.125 },
		accountCurrency: "KWD",
	});
	expect((await storage.localLoanPayments.getById("payment", owner))?.data).toMatchObject({
		accountAmount: 30.125,
		accountCurrency: "KWD",
		financialAccountId: "account",
		totalPaid: 100,
	});
	await expect(storage.payLocalLoanInstallment("loan", 1, "2026-10-10", undefined, owner)).rejects.toThrow(
		"Parcela indisponível",
	);
	expect((await storage.localLoanPayments.getById("payment", owner))?.data.paidDate).toBe("2026-10-10");
});
test("advancement serializes overlapping batches and respects owner and calendar dates", async () => {
	const storage = await import("../localStorage");
	const owner = "guest:advance_test";
	const loan = {
		amortization: "SAC" as const,
		dueDay: 10,
		firstDueDate: "2026-10-10",
		id: "advance",
		installmentAmount: 100,
		interestRate: 0,
		lender: "Bank",
		principalAmount: 300,
		startDate: "2026-10-01",
		totalInstallments: 3,
		userId: "guest",
	};
	const payments = [1, 2, 3].map(n => ({
		dueDate: "2026-10-10",
		id: `advance-${n}`,
		installmentNumber: n,
		interestPaid: 0,
		isAdvanced: false,
		loanId: loan.id,
		principalPaid: 100,
		totalPaid: 100,
	}));
	await storage.createLocalLoanWithPayments(loan, payments, owner);
	await expect(
		storage.advanceLocalLoanInstallments(loan.id, 1, "FRONT", "2026-02-30", owner),
	).rejects.toThrow("Data inválida");
	await expect(
		storage.advanceLocalLoanInstallments(loan.id, 1, "FRONT", "2026-10-01", "guest:other"),
	).rejects.toThrow();
	const results = await Promise.all([
		storage.advanceLocalLoanInstallments(loan.id, 1, "BACK", "2026-10-01", owner),
		storage.advanceLocalLoanInstallments(loan.id, 1, "BACK", "2026-10-01", owner),
	]);
	expect(results.map(row => row.totalPaid)).toEqual([100, 100]);
	const rows = await storage.localLoanPayments.getAll(owner);
	expect(
		rows
			.filter(row => row.data.paidDate)
			.map(row => row.data.installmentNumber)
			.sort(),
	).toEqual([2, 3]);
});

test("legacy migration is idempotent, skips signed owners and isolates invalid loans", async () => {
	const storage = await import("../localStorage");
	const owner = "guest:legacy_test";
	const loan = {
		amortization: "PRICE" as const,
		dueDay: 10,
		firstDueDate: "2026-10-10",
		id: "legacy",
		installmentAmount: 100,
		interestRate: 0,
		lender: "Bank",
		paidInstallments: 2,
		principalAmount: 300,
		startDate: "2026-10-01",
		totalInstallments: 3,
		totalPaid: 200,
		userId: "guest",
	};
	await storage.localLoans.put(loan, loan.id, owner);
	await storage.localLoans.put({ ...loan, id: "invalid", totalInstallments: 0 }, "invalid", owner);
	await storage.localLoans.put({ ...loan, id: "signed" }, "signed", "user:test");
	const database = await storage.initLocalDb();
	await (await import("../upgrades/local-upgrade")).migrateGuestLoanPayments(database);
	await (await import("../upgrades/local-upgrade")).migrateGuestLoanPayments(database);
	expect(await storage.localLoanPayments.getAll(owner)).toHaveLength(3);
	expect(await storage.localLoanPayments.getAll("user:test")).toHaveLength(0);
	expect((await storage.localLoans.getById("legacy", owner))?.data.needsPaymentReview).toBe(true);
	expect((await storage.localLoanPayments.getAll(owner)).every(row => !row.data.paidDate)).toBe(true);
	await (await import("../upgrades/review-loan-payments")).reviewLocalLoanPayments(
		loan.id,
		"2026-09-30",
		"PRICE",
		owner,
	);
	expect((await storage.localLoans.getById("legacy", owner))?.data.needsPaymentReview).toBe(false);
	const paid = (await storage.localLoanPayments.getAll(owner)).filter(row => row.data.paidDate);
	expect(paid.map(row => row.data.installmentNumber).sort()).toEqual([1, 2]);
	expect(paid.every(row => !row.data.isAdvanced)).toBe(true);
	await expect(
		(await import("../upgrades/review-loan-payments")).reviewLocalLoanPayments(
			loan.id,
			"2026-09-30",
			"PRICE",
			owner,
		),
	).rejects.toThrow();
});
