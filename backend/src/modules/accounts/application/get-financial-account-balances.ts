import { differenceInMonths, differenceInYears } from "date-fns";
import {
	calculateFinancialAccountYieldBalances,
	type YieldPeriod,
} from "~/modules/accounts/domain/calculate-financial-account-yields";
import { db, queryRows } from "~/shared/infra/sql";

export function calculateCashbackValue(
	amount: number,
	awardedAt: Date,
	yieldReferenceRate?: null | number,
	yieldReferencePercentage?: null | number,
	yieldPeriod?: null | string,
	today = new Date(),
) {
	if (!yieldReferenceRate || !yieldReferencePercentage || !yieldPeriod) return amount;
	const periods = Math.max(
		0,
		yieldPeriod === "MONTHLY" ? differenceInMonths(today, awardedAt) : differenceInYears(today, awardedAt),
	);
	const rate = (yieldReferenceRate * yieldReferencePercentage) / 100;
	return amount * (1 + rate / 100) ** periods;
}

async function loadFinancialAccountBalanceInput(accountIds: string[]) {
	const balances = new Map(accountIds.map(accountId => [accountId, 0]));
	if (accountIds.length === 0) return { balances } as const;
	const accounts = await queryRows(
		db.sql.public.FinancialAccount.select(
			"id",
			"userId",
			"type",
			"createdAt",
			"yieldFixedRate",
			"yieldReferenceRate",
			"yieldReferencePercentage",
			"yieldPeriod",
			"yieldTaxRate",
		)
			.where((fields, functions) => functions.in(fields.id, accountIds))
			.build(),
	);
	const transactions = await queryRows(
		db.sql.public.Transaction.select(
			"amount",
			"date",
			"destinationFinancialAccountId",
			"originFinancialAccountId",
		)
			.where((fields, functions) =>
				functions.or(
					functions.in(fields.originFinancialAccountId, accountIds),
					functions.in(fields.destinationFinancialAccountId, accountIds),
				),
			)
			.build(),
	);
	const rewardsAccounts = await queryRows(
		db.sql.public.RewardsAccount.select("financialAccountId", "initialBalance")
			.where((fields, functions) => functions.in(fields.financialAccountId, accountIds))
			.build(),
	);
	const yieldRateHistories = await queryRows(
		db.sql.public.FinancialAccountYieldRateHistory.select(
			"financialAccountId",
			"effectiveDate",
			"yieldFixedRate",
			"yieldReferenceRate",
			"yieldReferencePercentage",
			"yieldPeriod",
			"yieldTaxRate",
		)
			.where((fields, functions) => functions.in(fields.financialAccountId, accountIds))
			.build(),
	);
	const yields = await queryRows(
		db.sql.public.FinancialAccountYield.select("amount", "date", "financialAccountId", "isExcluded", "kind")
			.where((fields, functions) => functions.in(fields.financialAccountId, accountIds))
			.build(),
	);
	const yieldRateHistoriesByAccountId = new Map<string, typeof yieldRateHistories>();
	for (const history of yieldRateHistories) {
		const accountHistories = yieldRateHistoriesByAccountId.get(history.financialAccountId) ?? [];
		accountHistories.push(history);
		yieldRateHistoriesByAccountId.set(history.financialAccountId, accountHistories);
	}
	const rewardsAccountIds = rewardsAccounts.map(account => account.financialAccountId);
	const cashbackPurchases = rewardsAccountIds.length
		? await queryRows(
				db.sql.public.CreditPurchase.select(
					"cashbackAccountId",
					"cashbackAmount",
					"cashbackYieldPeriod",
					"cashbackYieldReferenceRate",
					"cashbackYieldReferencePercentage",
					"purchaseDate",
				)
					.where((fields, functions) => functions.in(fields.cashbackAccountId, rewardsAccountIds))
					.build(),
			)
		: [];
	const holidays = accounts.length
		? await queryRows(
				db.sql.public.FinancialAccountYieldHoliday.select("date")
					.where((fields, functions) =>
						functions.in(fields.userId, [...new Set(accounts.map(account => account.userId))]),
					)
					.build(),
			)
		: [];
	return {
		balances,
		input: {
			accounts: accounts.map(account => ({
				...account,
				yieldPeriod: account.yieldPeriod as null | YieldPeriod,
				yieldRateHistories: (yieldRateHistoriesByAccountId.get(account.id) ?? []).map(history => ({
					...history,
					yieldPeriod: history.yieldPeriod as null | YieldPeriod,
				})),
			})),
			cashbackCredits: cashbackPurchases.map(purchase => ({
				...purchase,
				cashbackAmount: Number(purchase.cashbackAmount ?? 0),
				cashbackYieldPeriod: purchase.cashbackYieldPeriod as null | YieldPeriod,
				cashbackYieldReferencePercentage: purchase.cashbackYieldReferencePercentage,
				cashbackYieldReferenceRate: purchase.cashbackYieldReferenceRate,
			})),
			holidays: holidays.map(holiday => holiday.date),
			initialRewardsBalances: new Map(
				rewardsAccounts.map(account => [account.financialAccountId, Number(account.initialBalance)]),
			),
			transactions: transactions.map(transaction => ({ ...transaction, amount: Number(transaction.amount) })),
			yields: yields.map(yieldEntry => ({
				...yieldEntry,
				amount: yieldEntry.amount === null ? null : Number(yieldEntry.amount),
				kind: yieldEntry.kind as "AUTOMATIC" | "MANUAL",
			})),
		},
	} as const;
}

export async function getFinancialAccountBalances(accountIds: string[], asOf = new Date()) {
	const loaded = await loadFinancialAccountBalanceInput(accountIds);
	if (!("input" in loaded)) return loaded.balances;
	return calculateFinancialAccountYieldBalances({ ...loaded.input, today: asOf });
}

export async function getFinancialAccountBalancesAtDates(accountIds: string[], dates: Date[]) {
	const loaded = await loadFinancialAccountBalanceInput(accountIds);
	if (!("input" in loaded)) return dates.map(date => ({ balances: loaded.balances, date }));
	return dates.map(date => ({
		balances: calculateFinancialAccountYieldBalances({ ...loaded.input, today: date }),
		date,
	}));
}
