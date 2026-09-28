import { describe, expect, test } from "bun:test";
import Elysia from "elysia";
import { DebtLedgerReturn, DebtSummaryReturn } from "./DebtsDTO";
import { normalizeDebtLedgerPerson } from "./debt-ledger-person";

describe("debt ledger person response", () => {
	for (const connectionStatus of [null, "PENDING", "DECLINED", "ACCEPTED"]) {
		test(`returns valid ledger and summary for connection status ${connectionStatus}`, async () => {
			const person = normalizeDebtLedgerPerson({
				accountEmail: connectionStatus ? "person@example.com" : null,
				balance: "36.90",
				connectionStatus,
				id: "person-1",
				name: "Vitória",
			});
			expect(person.balance).toBe(36.9);
			expect(person.isZaimuUser).toBe(connectionStatus === "ACCEPTED");
			const ledger = {
				people: [person],
				totals: { iOwe: 0, net: 36.9, owedToMe: 36.9 },
			};
			const app = new Elysia()
				.get("/debts", () => ledger, { response: DebtLedgerReturn })
				.get("/debts/summary", () => [person], { response: DebtSummaryReturn });
			for (const [path, expected] of [
				["/debts", ledger],
				["/debts/summary", [person]],
			] as const) {
				const response = await app.handle(new Request(`http://localhost${path}`));
				expect(response.status).toBe(200);
				expect(await response.json()).toEqual(expected);
			}
		});
	}
});
