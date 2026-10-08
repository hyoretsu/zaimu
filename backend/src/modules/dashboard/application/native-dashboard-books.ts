import { roundMoney } from "@zaimu/finance/money";
import { dateKey } from "./dashboard-calculations";
import type { loadDashboardData } from "./load-dashboard-data";

/** Native records remain independently available when consolidation is unavailable. */
export function nativeDashboardBooks(
	loaded: Awaited<ReturnType<typeof loadDashboardData>>,
	at: Date,
	balances?: Map<string, number>,
) {
	const asOf = dateKey(at);
	const accounts = loaded.accounts
		.filter(account => !["CREDIT_CARD", "REWARDS"].includes(account.type))
		.map(account => ({
			balance:
				balances?.get(account.id) ??
				Number(
					loaded.balanceRows
						.filter(row => row.accountId === account.id && row.date <= asOf)
						.toSorted((a, b) => b.date.localeCompare(a.date))[0]?.balance ?? 0,
				),
			currency: account.currency ?? "BRL",
			id: account.id,
			institutionName: account.institutionName,
			name: account.name,
			type: account.type,
		}));
	const creditCards = loaded.cards.map(card => {
		const statements = loaded.statements.filter(statement => statement.creditCardId === card.id);
		const statement =
			statements
				.filter(row => dateKey(row.dueDate) >= asOf)
				.toSorted((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0] ??
			statements.toSorted((a, b) => b.dueDate.getTime() - a.dueDate.getTime())[0];
		const denomination = card.currency ?? "BRL";
		const used = roundMoney(
			statements.reduce((sum, row) => sum + Number(row.balanceAmount), 0),
			denomination,
		);
		return {
			availableLimit: Math.max(0, Number(card.creditLimit) - used),
			creditLimit: Number(card.creditLimit),
			currency: denomination,
			excludeFromTotals: card.excludeFromTotals,
			financialAccountId: card.financialAccountId,
			id: card.id,
			institutionName: card.institutionName,
			name: card.name,
			statement: statement
				? {
						balanceAmount: Math.max(0, statement.balanceAmount),
						dueDate: dateKey(statement.dueDate),
						id: statement.id,
					}
				: null,
		};
	});
	return { accounts, creditCards, nativeAsOf: asOf };
}
