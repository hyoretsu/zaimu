import { expect, test } from "bun:test";
import type { FinancialAccount, FinancialAccountYield } from "../api";
import { calculateFinancialAccountBalances } from "../financial-account";

// Keep the frontend composite project boundary while comparing both runtime implementations.
const { calculateFinancialAccountYieldBalances } = (await import(
	new URL(
		"../../../../backend/src/modules/accounts/domain/calculate-financial-account-yields.ts",
		import.meta.url,
	).href
)) as { calculateFinancialAccountYieldBalances(input: Record<string, unknown>): Map<string, number> };

for (const day of ["2026-01-10", "2026-01-12"]) {
	for (const holiday of [false, true]) {
		for (const manual of ["none", "excluded", "mixed"]) {
			test(`indexed yield replay keeps visitor/connected parity: ${day}, holiday=${holiday}, manual=${manual}`, () => {
				const account = {
					balance: 0,
					createdAt: "2026-01-09T12:00:00Z",
					id: "indexed",
					name: "Parity",
					type: "CHECKING",
					updatedAt: "2026-01-09T12:00:00Z",
					userId: "owner",
					yieldFixedRate: 5,
					yieldPeriod: "MONTHLY",
					yieldTaxRate: 15,
				} satisfies FinancialAccount;
				const yields: FinancialAccountYield[] = [
					{
						amount: 1,
						date: day,
						financialAccountId: account.id,
						id: "excluded-auto",
						isExcluded: true,
						kind: "AUTOMATIC",
						origin: "USER",
					},
					{
						amount: 7,
						date: day,
						financialAccountId: account.id,
						id: "included-auto",
						isExcluded: false,
						kind: "AUTOMATIC",
						origin: "USER",
					},
					{
						amount: 999,
						date: "2026-01-20",
						financialAccountId: account.id,
						id: "future",
						isExcluded: false,
						kind: "AUTOMATIC",
						origin: "USER",
					},
					{
						amount: 999,
						date: day,
						financialAccountId: "other",
						id: "foreign",
						isExcluded: false,
						kind: "AUTOMATIC",
						origin: "USER",
					},
				];
				if (manual !== "none")
					yields.push({
						amount: 9,
						date: day,
						financialAccountId: account.id,
						id: "excluded-manual",
						isExcluded: true,
						kind: "MANUAL",
					});
				if (manual === "mixed")
					yields.push(
						...[1.1, 2.2].map((amount, index) => ({
							amount,
							date: day,
							financialAccountId: account.id,
							id: `manual-${index}`,
							isExcluded: false,
							kind: "MANUAL" as const,
						})),
					);
				const transactions = [
					{ amount: 1000, date: "2026-01-09", destinationFinancialAccountId: account.id },
				];
				const today = new Date(`${day}T12:00:00Z`);
				const guest = calculateFinancialAccountBalances(
					[account],
					transactions,
					[],
					holiday ? [day] : [],
					today,
					yields,
				)[0]?.balance;
				const connected = calculateFinancialAccountYieldBalances({
					accounts: [{ ...account, createdAt: new Date(account.createdAt) }],
					cashbackCredits: [],
					holidays: holiday ? [today] : [],
					initialRewardsBalances: new Map(),
					today,
					transactions: transactions.map(row => ({
						...row,
						date: new Date(`${row.date}T12:00:00Z`),
					})),
					yields: yields.map(row => ({ ...row, date: new Date(`${row.date}T12:00:00Z`) })),
				}).get(account.id);
				if (connected === undefined) throw new Error("Missing connected account balance");
				expect(guest).toBe(connected);
			});
		}
	}
}
