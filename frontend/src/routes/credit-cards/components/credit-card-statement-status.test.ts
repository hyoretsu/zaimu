import { describe, expect, test } from "bun:test";
import { LuClock } from "react-icons/lu";
import type { CreditCardStatement } from "@/lib/api";
import { getCreditCardStatementStatus } from "./credit-card-statement-status";

const statement: CreditCardStatement = {
	balanceAmount: 100,
	creditCardId: "card",
	dueDate: "2099-01-20",
	id: "statement",
	isPaid: false,
	paidAmount: 0,
	statementDate: "2099-01-15",
	totalAmount: 100,
};

describe("getCreditCardStatementStatus", () => {
	test("recognizes scheduled payments from invoice details without the aggregate", () => {
		expect(
			getCreditCardStatementStatus(
				{ ...statement, payments: [{ amount: 100, date: "2099-01-20" }] },
				"2099-01-16",
			).label,
		).toBe("Pagamento agendado");
		expect(
			getCreditCardStatementStatus(
				{ ...statement, payments: [{ amount: 100, date: "2099-01-15" }] },
				"2099-01-16",
			).label,
		).toBe("Fatura fechada");
	});
	test("shows scheduled payments without marking the invoice paid", () => {
		const status = getCreditCardStatementStatus({ ...statement, scheduledPaymentAmount: 100 }, "2099-01-16");
		expect(status.label).toBe("Pagamento agendado");
		expect(status.icon).not.toBeNull();
	});
	test.each([
		[100, "text-success-600"],
		[110, "text-success-600"],
	])("colors scheduled amount %s by its coverage", (scheduledPaymentAmount, className) => {
		expect(
			getCreditCardStatementStatus({ ...statement, scheduledPaymentAmount }, "2099-01-16"),
		).toMatchObject({ className, icon: LuClock, label: "Pagamento agendado" });
	});

	test("compares the schedule with the remaining balance after credit and settled payments", () => {
		expect(
			getCreditCardStatementStatus(
				{
					...statement,
					amountDue: 100,
					creditInAmount: 20,
					periodPaymentAmount: 30,
					scheduledPaymentAmount: 50,
				},
				"2099-01-16",
			).className,
		).toBe("text-success-600");
	});

	test("does not treat carried balances reset to zero as fully covered", () => {
		expect(
			getCreditCardStatementStatus({
				...statement,
				amountDue: 100,
				balanceAmount: 0,
				periodPaymentAmount: 0,
				scheduledPaymentAmount: 40,
				status: "CARRIED",
			}).className,
		).toBe("text-destructive");
	});

	test("sums only future positive payments without counting the aggregate twice", () => {
		const payments = [
			{ amount: 40, date: "2099-01-20" },
			{ amount: 59.99, date: "2099-01-21" },
			{ amount: 100, date: "2099-01-15" },
			{ amount: -10, date: "2099-01-21" },
		];
		expect(
			getCreditCardStatementStatus({ ...statement, payments, scheduledPaymentAmount: 99.99 }, "2099-01-16")
				.label,
		).toBe("Fatura fechada");
		expect(
			getCreditCardStatementStatus(
				{ ...statement, payments: [...payments, { amount: 0.01, date: "2099-01-22" }] },
				"2099-01-16",
			).className,
		).toBe("text-success-600");
	});

	test.each(["2099-01-01", "2099-01-14"])(
		"keeps invoices open before closing despite future payments on %s",
		today => {
			expect(
				getCreditCardStatementStatus(
					{ ...statement, payments: [{ amount: 150, date: "2099-01-14" }], scheduledPaymentAmount: 150 },
					today,
				).label,
			).toBe("Fatura aberta");
		},
	);
	test.each([40, 99.99])("keeps closed invoices closed with only %s scheduled", scheduledPaymentAmount => {
		expect(getCreditCardStatementStatus({ ...statement, scheduledPaymentAmount }, "2099-01-16").label).toBe(
			"Fatura fechada",
		);
	});
	test("does not schedule an invoice with no remaining balance", () => {
		expect(
			getCreditCardStatementStatus(
				{ ...statement, balanceAmount: 0, scheduledPaymentAmount: 100 },
				"2099-01-16",
			).label,
		).toBe("Fatura fechada");
	});

	test("shows forecast invoices without a status", () => {
		const status = getCreditCardStatementStatus({ ...statement, isForecast: true });
		expect(status.label).toBe("");
		expect(status.icon).toBeNull();
	});
	test("hides status before the cycle opens, including month and year boundaries", () => {
		expect(getCreditCardStatementStatus(statement, "2098-12-14")).toMatchObject({ icon: null, label: "" });
		expect(getCreditCardStatementStatus(statement, "2098-12-15").label).toBe("Fatura aberta");
		const march = { ...statement, dueDate: "2026-04-10", statementDate: "2026-03-31" };
		expect(getCreditCardStatementStatus(march, "2026-02-27").label).toBe("");
		expect(getCreditCardStatementStatus(march, "2026-02-28").label).toBe("Fatura aberta");
	});
	test("distinguishes open, closed and overdue invoices by their dates", () => {
		expect(getCreditCardStatementStatus(statement, "2099-01-01").label).toBe("Fatura aberta");
		expect(
			getCreditCardStatementStatus({ ...statement, dueDate: "2099-01-20", statementDate: "2020-01-15" })
				.label,
		).toBe("Fatura fechada");
		expect(
			getCreditCardStatementStatus({ ...statement, dueDate: "2020-01-20", statementDate: "2020-01-15" })
				.label,
		).toBe("Fatura atrasada");
	});

	test("shows paid invoices as paid and carried debt as overdue", () => {
		expect(
			getCreditCardStatementStatus({
				...statement,
				dueDate: "2020-01-20",
				isPaid: true,
				statementDate: "2020-01-15",
			}).label,
		).toBe("Fatura paga");
		expect(getCreditCardStatementStatus({ ...statement, status: "CARRIED" }).label).toBe("Fatura atrasada");
	});
});
