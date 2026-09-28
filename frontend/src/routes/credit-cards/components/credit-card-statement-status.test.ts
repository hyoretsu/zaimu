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
	test("distinguishes open, closed and overdue invoices by their dates", () => {
		expect(getCreditCardStatementStatus(statement).label).toBe("Fatura em aberto");
		expect(
			getCreditCardStatementStatus({ ...statement, dueDate: "2099-01-20", statementDate: "2020-01-15" })
				.label,
		).toBe("Fatura fechada");
		expect(
			getCreditCardStatementStatus({ ...statement, dueDate: "2020-01-20", statementDate: "2020-01-15" })
				.label,
		).toBe("Fatura vencida");
	});

	test("shows paid invoices as closed and carried debt as overdue", () => {
		expect(
			getCreditCardStatementStatus({
				...statement,
				dueDate: "2020-01-20",
				isPaid: true,
				statementDate: "2020-01-15",
			}).label,
		).toBe("Fatura fechada");
		expect(getCreditCardStatementStatus({ ...statement, status: "CARRIED" }).label).toBe("Fatura vencida");
	});
});
