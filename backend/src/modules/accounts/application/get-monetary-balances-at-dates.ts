import { queryRaw } from "~/shared/infra/sql";
import { monetaryBalancesSql } from "./monetary-balances-sql";

interface MonetaryBalanceRow {
	[key: string]: unknown;
	accountId: string;
	balance: number;
	date: string;
}

export async function getMonetaryBalancesAtDates(userId: string, dates: Date[]) {
	const dateKeys = [...new Set(dates.map(date => date.toISOString().slice(0, 10)))];
	if (dateKeys.length === 0) return new Map<string, number>();
	const rows = await queryRaw<MonetaryBalanceRow>(monetaryBalancesSql, [userId, dateKeys]);
	const balances = new Map(dateKeys.map(date => [date, 0]));
	for (const row of rows) balances.set(row.date, (balances.get(row.date) ?? 0) + Number(row.balance));
	return balances;
}
