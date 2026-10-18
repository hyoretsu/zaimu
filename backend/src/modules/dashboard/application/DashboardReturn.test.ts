import { expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { DashboardReturn } from "./DashboardReturn";
import type { loadDashboardData } from "./load-dashboard-data";
import { nativeDashboardBooks } from "./native-dashboard-books";

test("native cashback accounts satisfy the dashboard response contract", () => {
	const loaded = {
		accounts: [
			{ currency: "BRL", id: "cashback", institutionName: "Banco", name: "Cashback", type: "CASHBACK" },
		],
		balanceRows: [{ accountId: "cashback", balance: 25, date: "2026-10-18" }],
		cards: [],
	} as unknown as Awaited<ReturnType<typeof loadDashboardData>>;
	const books = nativeDashboardBooks(loaded, new Date(2026, 9, 18));
	const accounts = Value.Decode(DashboardReturn.properties.accounts, books.accounts);
	expect(accounts).toEqual([
		{
			balance: 25,
			currency: "BRL",
			id: "cashback",
			institutionName: "Banco",
			name: "Cashback",
			type: "CASHBACK",
		},
	]);
	expect(Value.Check(DashboardReturn.properties.accounts, [{ ...accounts[0], type: "UNKNOWN" }])).toBe(false);
});
