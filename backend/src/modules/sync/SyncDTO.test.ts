import { expect, test } from "bun:test";
import Elysia from "elysia";
import { SyncDebtEvent } from "./SyncDTO";

test("sync accepts legacy debt events and retains explicit native currency", async () => {
	const app = new Elysia().post("/event", ({ body }) => body, { body: SyncDebtEvent });
	const event = {
		amount: 1.001,
		createdAt: "2026-10-01T00:00:00Z",
		date: null,
		debtPersonId: "person",
		effect: 1.001,
		id: "event",
		kind: "ORIGIN",
		updatedAt: "2026-10-01T00:00:00Z",
	};
	async function send(body: unknown) {
		return app.handle(
			new Request("http://localhost/event", {
				body: JSON.stringify(body),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
		);
	}
	const native = await send({ ...event, currency: "KWD" });
	expect(native.status).toBe(200);
	expect(await native.json()).toMatchObject({ amount: 1.001, currency: "KWD" });
	expect((await send(event)).status).toBe(200);
	expect((await send({ ...event, currency: "kwd" })).status).toBe(422);
});

test("sync serializes SQL dates and numbers against concrete entity schemas", async () => {
	const { serializeSyncReturn } = await import("./SyncDTO");
	const empty = {
		categories: [],
		creditBooks: [],
		creditCardStatements: [],
		creditCards: [],
		debtEvents: [],
		debtPeople: [],
		financialAccounts: [],
		financialAccountYieldHolidays: [],
		financialAccountYields: [],
		loanPayments: [],
		loans: [],
		monthlyBudgets: [],
		recurrenceOccurrences: [],
		recurrences: [],
		transactions: [],
	};
	const result = serializeSyncReturn({
		serverData: {
			...empty,
			creditCardStatements: [
				{
					balanceAmount: "75.50",
					creditCardId: "card",
					dueDate: "2026-10-10",
					id: "statement",
					isPaid: false,
					paidAmount: "25",
					statementDate: new Date("2026-10-01T00:00:00Z"),
					totalAmount: "100.50",
				},
			],
		},
		syncResults: {},
	});
	expect(result.serverData.creditCardStatements[0]).toMatchObject({
		balanceAmount: 75.5,
		paidAmount: 25,
		statementDate: "2026-10-01T00:00:00.000Z",
		totalAmount: 100.5,
	});
	expect(() =>
		serializeSyncReturn({
			serverData: { ...empty, financialAccounts: [{ id: "incomplete" }] },
			syncResults: {},
		}),
	).toThrow();
});
