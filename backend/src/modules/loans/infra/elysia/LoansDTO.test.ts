import { expect, test } from "bun:test";
import Elysia from "elysia";
import { LoanPaymentPageReturn } from "./LoansDTO";

test("payment page validates serialized cache entries with nullable payment fields", async () => {
	const page = {
		hasMore: false,
		items: [
			{
				accountAmount: null,
				accountCurrency: null,
				advanceType: null,
				createdAt: "2026-10-01T00:00:00.000Z",
				currency: "KWD",
				dueDate: "2026-10-10T00:00:00.000Z",
				financialAccountId: null,
				id: "payment",
				installmentNumber: 1,
				interestPaid: 10,
				isAdvanced: false,
				loanId: "loan",
				paidDate: null,
				principalPaid: 100,
				totalPaid: 110,
				updatedAt: "2026-10-01T00:00:00.000Z",
			},
		],
		nextCursor: null,
	};
	const app = new Elysia().get("/", () => JSON.parse(JSON.stringify(page)), {
		response: LoanPaymentPageReturn,
	});
	const response = await app.handle(new Request("http://localhost/"));
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual(page);
});
