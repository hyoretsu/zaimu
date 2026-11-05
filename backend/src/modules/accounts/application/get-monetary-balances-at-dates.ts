import { queryRawDecimal } from "~/shared/infra/sql";
import { monetaryBalancesSql } from "./monetary-balances-sql";

interface MonetaryBalanceRow {
	[key: string]: unknown;
	accountId: string;
	assetCode: string;
	assetKind: "FIAT" | "CRYPTO";
	balance: string;
	currency: string;
	date: string;
}

export async function getAccountBalancesAtDates(userId: string, dates: Date[]) {
	const dateKeys = [...new Set(dates.map(date => date.toISOString().slice(0, 10)))];
	if (dateKeys.length === 0) return [];
	return queryRawDecimal<MonetaryBalanceRow>(monetaryBalancesSql, [userId, dateKeys]);
}

export async function getMonetaryBalancesAtDates(userId: string, dates: Date[]) {
	const dateKeys = [...new Set(dates.map(date => date.toISOString().slice(0, 10)))];
	if (dateKeys.length === 0) return new Map<string, Array<{ currency: string; amount: number }>>();
	const rows = await getAccountBalancesAtDates(userId, dates);
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
