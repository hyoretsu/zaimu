import {
	getYieldSettings,
	projectedNetYield,
	type ReferenceRateType,
	settingsRequireReference,
} from "@zaimu/finance/projected-yield";
import { countryHolidayDates } from "@zaimu/finance/yield-calendar";
import type { YieldTaxLedger } from "@zaimu/finance/yield-tax";
import { addDays } from "date-fns";
import { loadYieldCalendar } from "~/modules/yield-calendar/catalog";
import { ensureAccountCoverage } from "~/modules/yield-calendar/ensure-coverage";
import { queryRaw } from "~/shared/infra/sql";
import { getReferenceRateAverages } from "./get-reference-rate-averages";
import { loadYieldAccounts } from "./reference-rate-jobs";

export async function projectedYieldContext(
	userId: string,
	accountIds: string[],
	from = new Date(),
	through = from,
) {
	const owned = accountIds.length
		? await queryRaw<{ id: string }>(
				`SELECT "id" FROM "FinancialAccount" WHERE "userId"=$1 AND "id"=ANY($2)`,
				[userId, accountIds],
			)
		: [];
	const [accounts, rateResult] = await Promise.all([
		loadYieldAccounts(owned.map(account => account.id)),
		getReferenceRateAverages(),
	]);
	const years = Array.from(
		{ length: Math.max(0, through.getFullYear() - from.getFullYear()) + 1 },
		(_, index) => from.getFullYear() + index,
	);
	const coverage = new Map(
		await Promise.all(
			accounts.map(
				async account =>
					[
						account.id,
						await ensureAccountCoverage(account.currency ?? "BRL", account.countryCode, years),
					] as const,
			),
		),
	);
	const calendar = await loadYieldCalendar();
	const accountMap = new Map(accounts.map(account => [account.id, account] as const));
	const holidaysByCountry = new Map(
		accounts.map(account => [
			account.countryCode ?? "",
			countryHolidayDates(calendar.countries, account.countryCode ?? ""),
		]),
	);
	const averages: Partial<Record<ReferenceRateType, number>> = {};
	for (const type of ["CDI", "SELIC"] as const)
		if (rateResult.averages[type] !== null) averages[type] = rateResult.averages[type];
	const unavailableAccountIds = new Set<string>();
	for (const account of accounts) {
		const hasYield =
			account.type === "CHECKING" ||
			account.type === "SAVINGS" ||
			account.yieldReferenceType ||
			(account.yieldFixedRate !== null && account.yieldFixedRate !== undefined);
		if (!hasYield) continue;
		if (!coverage.get(account.id)) unavailableAccountIds.add(account.id);
		for (let date = from; date <= through; date = addDays(date, 1)) {
			const settings = getYieldSettings(account, date.toISOString().slice(0, 10));
			if (!settings || (settingsRequireReference(settings) && !rateResult.ready))
				unavailableAccountIds.add(account.id);
		}
	}
	return {
		available: unavailableAccountIds.size === 0,
		lots: new Map(accounts.map(account => [account.id, account.yieldLots ?? []])),
		netYield: (account: { id: string }, balance: number, day: string, ledger?: YieldTaxLedger) => {
			const settings = accountMap.get(account.id);
			return settings && coverage.get(account.id)
				? projectedNetYield(
						settings,
						balance,
						day,
						averages,
						holidaysByCountry.get(settings.countryCode ?? ""),
						ledger,
					)
				: 0;
		},
		settleYield: (account: { id: string }, amount: number, day: string, ledger: YieldTaxLedger) => {
			const settings = accountMap.get(account.id);
			ledger.accrueRecordedNet(amount, settings ? getYieldSettings(settings, day) : undefined, day);
		},
		unavailableAccountIds: [...unavailableAccountIds],
	};
}
