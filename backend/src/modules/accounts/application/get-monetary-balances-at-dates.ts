import { queryRaw } from "~/shared/infra/sql";
import { monetaryBalancesSql } from "./monetary-balances-sql";

interface MonetaryBalanceRow {
	[key: string]: unknown;
	accountId: string;
	balance: number;
	currency: string;
	date: string;
}

export async function getMonetaryBalancesAtDates(userId: string, dates: Date[]) {
	const dateKeys = [...new Set(dates.map(date => date.toISOString().slice(0, 10)))];
	if (dateKeys.length === 0) return new Map<string, Array<{ currency: string; amount: number }>>();
	const rows = await queryRaw<MonetaryBalanceRow>(monetaryBalancesSql, [userId, dateKeys]);
	const balances = new Map<string, Array<{ currency: string; amount: number }>>(
		dateKeys.map(date => [date, []]),
	);
	for (const row of rows) {
		const values = balances.get(row.date)!;
		const existing = values.find(value => value.currency === row.currency);
		if (existing) existing.amount += Number(row.balance);
		else values.push({ amount: Number(row.balance), currency: row.currency });
	}
	return balances;
}
