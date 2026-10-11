import { getYieldSettings, projectedNetYield, type ReferenceRateType } from "@zaimu/finance/projected-yield";
import type { YieldTaxLedger } from "@zaimu/finance/yield-tax";
import { format } from "date-fns";
import { queryRaw } from "~/shared/infra/sql";
import { getReferenceRateAverages } from "./get-reference-rate-averages";
import { loadYieldAccounts } from "./reference-rate-jobs";

export async function projectedYieldContext(userId: string, accountIds: string[]) {
	const [accounts, rateResult, holidayRows] = await Promise.all([
		loadYieldAccounts(accountIds),
		getReferenceRateAverages(),
		queryRaw<{ date: Date }>(`SELECT "date" FROM "FinancialAccountYieldHoliday" WHERE "userId" = $1`, [
			userId,
		]),
	]);
	const accountMap = new Map(accounts.flatMap(account => (account ? [[account.id, account] as const] : [])));
	const holidays = new Set(holidayRows.map(row => format(row.date, "yyyy-MM-dd")));
	const averages: Partial<Record<ReferenceRateType, number>> = {};
	for (const type of ["CDI", "SELIC"] as const)
		if (rateResult.averages[type] !== null) averages[type] = rateResult.averages[type];
	return {
		available: rateResult.ready,
		lots: new Map(accounts.map(account => [account.id, account.yieldLots ?? []])),
		netYield: (account: { id: string }, balance: number, day: string, ledger?: YieldTaxLedger) => {
			const settings = accountMap.get(account.id);
			return settings ? projectedNetYield(settings, balance, day, averages, holidays, ledger) : 0;
		},
		settleYield: (account: { id: string }, amount: number, day: string, ledger: YieldTaxLedger) => {
			const settings = accountMap.get(account.id);
			ledger.accrueRecordedNet(amount, settings ? getYieldSettings(settings, day) : undefined, day);
		},
	};
}
