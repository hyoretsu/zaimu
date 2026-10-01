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
	await storage.payLocalLoanInstallment("loan", 1, "2026-10-10", undefined, owner);
	await expect(storage.payLocalLoanInstallment("loan", 1, "2026-10-10", undefined, owner)).rejects.toThrow(
		"Parcela indisponível",
	);
	expect((await storage.localLoanPayments.getById("payment", owner))?.data.paidDate).toBe("2026-10-10");
});
