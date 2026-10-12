import { differenceInMonths, differenceInYears } from "date-fns";
import { getInstitutionProfileContext } from "~/modules/accounts/application/get-institution-profile-context";
import {
	calculateFinancialAccountYieldBalances,
	type YieldPeriod,
} from "~/modules/accounts/domain/calculate-financial-account-yields";
import { loadCountryHolidayRows } from "~/modules/yield-calendar/catalog";
import { ensureAccountCoverage } from "~/modules/yield-calendar/ensure-coverage";
import { db, queryRaw, queryRows } from "~/shared/infra/sql";
import { cashbackReversalsSql } from "./cashback-reversals-sql";
import { getFinancialInstitutionYieldPolicies } from "./get-financial-institution-yield-policies";
import { monetaryBalancesSql } from "./monetary-balances-sql";

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

export async function loadFinancialAccountBalanceInput(accountIds: string[]) {
	const balances = new Map(accountIds.map(accountId => [accountId, 0]));
	if (accountIds.length === 0) return { balances, input: null } as const;
	const accounts = await queryRows(
		db.sql.public.FinancialAccount.select(
			"currency",
			"countryCode",
			"id",
			"institutionId",
			"legacyInstitutionId",
			"currency",
			"userId",
			"type",
			"createdAt",
			"yieldFixedRate",
			"yieldReferenceType",
			"yieldReferencePercentage",
			"yieldPeriod",
			"yieldTaxIds",
			"yieldTaxRate",
		)
			.where((fields, functions) => functions.in(fields.id, accountIds))
			.build(),
	);
	const profileContext = await getInstitutionProfileContext(accountIds);
	const institutionYieldPolicies = await getFinancialInstitutionYieldPolicies([
		...new Set(accounts.flatMap(account => (account.institutionId ? [account.institutionId] : []))),
	]);
	const transactions = await queryRows(
		db.sql.public.Transaction.select(
			"id",
			"amount",
			"date",
			"destinationFinancialAccountId",
			"destinationAmount",
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
	const loanPayments = await queryRaw<{ amount: string; date: Date; originFinancialAccountId: string }>(
		`SELECT COALESCE(payment."accountAmount",payment."totalPaid") AS amount,payment."paidDate" AS date,payment."financialAccountId" AS "originFinancialAccountId" FROM "LoanPayment" payment WHERE payment."financialAccountId"=ANY($1::text[]) AND payment."paidDate" IS NOT NULL`,
		[accountIds],
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
			"yieldTaxIds",
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
 UNION ALL SELECT p."cashbackAccountId",r.amount,p."cashbackYieldPeriod",p."cashbackYieldReferenceRate",p."cashbackYieldReferencePercentage",r."date"
 FROM (${cashbackReversalsSql}) r JOIN "CreditPurchaseRecord" p ON p."id"=r."purchaseId"
 WHERE p."cashbackAccountId"=ANY($1) AND r."date"<=CURRENT_DATE`,
				[rewardsAccountIds],
			)
		: [];
	const startYear = Math.min(
		new Date().getFullYear(),
		...accounts.map(account => account.createdAt.getFullYear()),
		...transactions.map(transaction => transaction.date.getFullYear()),
	);
	const years = Array.from(
		{ length: new Date().getFullYear() - startYear + 1 },
		(_, index) => startYear + index,
	);
	const scopes = [
		...new Map(accounts.map(account => [`${account.currency}:${account.countryCode}`, account])).values(),
	];
	await Promise.all(
		scopes.map(account => ensureAccountCoverage(account.currency, account.countryCode, years)),
	);
	const coverage = await queryRaw<{ countryCode: string; year: number }>(
		`SELECT "countryCode","year" FROM "YieldCalendarCoverage" WHERE "status"='COMPLETE'`,
	);
	const coveredCalendarYears = new Map(
		[...Map.groupBy(coverage, row => row.countryCode)].map(([code, rows]) => [
			code,
			new Set(rows.map(row => row.year)),
		]),
	);
	const holidays = await loadCountryHolidayRows();
	const holidaysByCountry = new Map(
		[...Map.groupBy(holidays, holiday => holiday.countryCode)].map(([country, rows]) => [
			country,
			rows.map(row => row.date),
		]),
	);

	return {
		balances,
		input: {
			accounts: accounts.map(account => ({
				...account,
				...profileContext.get(account.id),
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
			coveredCalendarYears,
			holidays: [],
			holidaysByCountry,
			initialRewardsBalances: new Map(
				rewardsAccounts.map(account => [account.financialAccountId, Number(account.initialBalance)]),
			),
			transactions: [
				...transactions,
				...loanPayments.map(payment => ({
					...payment,
					destinationAmount: null,
					destinationFinancialAccountId: null,
				})),
			].map(transaction => ({
				...transaction,
				amount: Number(transaction.amount),
				destinationAmount:
					transaction.destinationAmount == null ? null : Number(transaction.destinationAmount),
			})),
			yields: yields.map(yieldEntry => ({
				...yieldEntry,
				amount: yieldEntry.amount === null ? null : Number(yieldEntry.amount),
				kind: yieldEntry.kind as "AUTOMATIC" | "MANUAL",
				origin: yieldEntry.origin as "SYSTEM" | "USER",
			})),
		},
	} as const;
}

export async function getFinancialAccountBalances(
	accountIds: string[],
	asOf = new Date(),
	knownAccounts?: Array<{ id: string; userId: string; type: string }>,
) {
	const balances = new Map(accountIds.map(id => [id, 0]));
	if (!accountIds.length) return balances;
	const accounts =
		knownAccounts ??
		(await queryRows(
			db.sql.public.FinancialAccount.select("id", "userId", "type")
				.where((f, fn) => fn.in(f.id, accountIds))
				.build(),
		));
	const monetary = accounts.filter(account => ["CHECKING", "CASH", "SAVINGS"].includes(account.type));
	const userIds = [...new Set(monetary.map(account => account.userId))];
	for (const userId of userIds) {
		const rows = await queryRaw<{ accountId: string; balance: number }>(
			monetaryBalancesSql.replace(
				"ORDER BY requested.date",
				' AND account."id" = ANY($3::text[])\nORDER BY requested.date',
			),
			[
				userId,
				[asOf.toISOString().slice(0, 10)],
				monetary.filter(account => account.userId === userId).map(account => account.id),
			],
		);
		for (const row of rows) balances.set(row.accountId, Number(row.balance));
	}
	const rewards = accounts.filter(account => account.type === "REWARDS").map(account => account.id);
	if (rewards.length) {
		const loaded = await loadFinancialAccountBalanceInput(rewards);
		if (loaded.input)
			for (const [id, balance] of calculateFinancialAccountYieldBalances({ ...loaded.input, today: asOf }))
				balances.set(id, balance);
	}
	return balances;
}
