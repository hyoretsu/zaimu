import { differenceInMonths, differenceInYears } from "date-fns";
import {
	calculateFinancialAccountYieldBalances,
	type YieldPeriod,
} from "~/modules/accounts/domain/calculate-financial-account-yields";
import { db, queryRaw, queryRows } from "~/shared/infra/sql";
import { getFinancialInstitutionYieldPolicies } from "./get-financial-institution-yield-policies";

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
	if (accountIds.length === 0) return { balances, input: null } as const;
	const accounts = await queryRows(
		db.sql.public.FinancialAccount.select(
			"id",
			"institutionId",
			"userId",
			"type",
			"createdAt",
			"yieldFixedRate",
			"yieldReferenceType",
			"yieldReferencePercentage",
			"yieldPeriod",
			"yieldTaxRate",
		)
			.where((fields, functions) => functions.in(fields.id, accountIds))
			.build(),
	);
	const institutionYieldPolicies = await getFinancialInstitutionYieldPolicies([
		...new Set(accounts.flatMap(account => (account.institutionId ? [account.institutionId] : []))),
	]);
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
			"yieldReferenceType",
			"yieldReferencePercentage",
			"yieldPeriod",
			"yieldTaxRate",
		)
			.where((fields, functions) => functions.in(fields.financialAccountId, accountIds))
			.build(),
	);
	const yields = await queryRows(
		db.sql.public.FinancialAccountYield.select(
			"amount",
			"date",
			"financialAccountId",
			"isExcluded",
			"kind",
			"origin",
		)
			.where((fields, functions) => functions.in(fields.financialAccountId, accountIds))
			.build(),
	);
	const adjustments = await queryRows(
		db.sql.public.BalanceAdjustment.select("balance", "date", "financialAccountId")
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
		? await queryRaw<{
				cashbackAccountId: string;
				cashbackAmount: number;
				cashbackYieldPeriod: string | null;
				cashbackYieldReferenceRate: number | null;
				cashbackYieldReferencePercentage: number | null;
				purchaseDate: Date;
			}>(
				`
 WITH refunds AS (
  SELECT r.*, sum(r."amount") OVER (PARTITION BY r."purchaseId" ORDER BY r."creditDate",r."createdAt",r."id") AS cumulative
  FROM "CreditRefundRecord" r WHERE r."deletedAt" IS NULL
 )
 SELECT p."cashbackAccountId",p."cashbackAmount",p."cashbackYieldPeriod",p."cashbackYieldReferenceRate",p."cashbackYieldReferencePercentage",p."purchaseDate" FROM "CreditPurchaseRecord" p WHERE p."cashbackAccountId"=ANY($1) AND p."purchaseDate"<=CURRENT_DATE
 UNION ALL SELECT p."cashbackAccountId",-(round(p."cashbackAmount"*r.cumulative/p."totalAmount",4)-round(p."cashbackAmount"*(r.cumulative-r."amount")/p."totalAmount",4)),p."cashbackYieldPeriod",p."cashbackYieldReferenceRate",p."cashbackYieldReferencePercentage",r."creditDate" FROM refunds r JOIN "CreditPurchaseRecord" p ON p."id"=r."purchaseId" WHERE p."cashbackAccountId"=ANY($1) AND r."creditDate"<=CURRENT_DATE`,
				[rewardsAccountIds],
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
				institutionYieldPolicies: account.institutionId
					? (institutionYieldPolicies.get(account.institutionId) ?? [])
					: [],
				yieldPeriod: account.yieldPeriod as null | YieldPeriod,
				yieldRateHistories: (yieldRateHistoriesByAccountId.get(account.id) ?? []).map(history => ({
					...history,
					yieldPeriod: history.yieldPeriod as null | YieldPeriod,
					yieldReferenceType: history.yieldReferenceType as "CDI" | "SELIC" | null,
				})),
				yieldReferenceType: account.yieldReferenceType as "CDI" | "SELIC" | null,
			})),
			adjustments: adjustments.map(adjustment => ({ ...adjustment, balance: Number(adjustment.balance) })),
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
				origin: yieldEntry.origin as "SYSTEM" | "USER",
			})),
		},
	} as const;
}

export async function getFinancialAccountBalances(accountIds: string[], asOf = new Date()) {
	const loaded = await loadFinancialAccountBalanceInput(accountIds);
	if (!loaded.input) return loaded.balances;
	return calculateFinancialAccountYieldBalances({ ...loaded.input, today: asOf });
}

export async function getFinancialAccountBalancesAtDates(accountIds: string[], dates: Date[]) {
	const loaded = await loadFinancialAccountBalanceInput(accountIds);
	if (!loaded.input) return dates.map(date => ({ balances: loaded.balances, date }));
	return dates.map(date => ({
		balances: calculateFinancialAccountYieldBalances({ ...loaded.input, today: date }),
		date,
	}));
}
