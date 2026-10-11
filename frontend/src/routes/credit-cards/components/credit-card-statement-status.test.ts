import { describe, expect, test } from "bun:test";
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
	test("shows forecast invoices without an icon", () => {
		const status = getCreditCardStatementStatus({ ...statement, isForecast: true });
		expect(status.label).toBe("Fatura prevista");
		expect(status.icon).toBeNull();
	});
	test("distinguishes open, closed and overdue invoices by their dates", () => {
		expect(getCreditCardStatementStatus(statement).label).toBe("Fatura aberta");
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
