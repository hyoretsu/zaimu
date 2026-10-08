import { addDays, format, isWeekend, startOfDay } from "date-fns";

export type YieldPeriod = "MONTHLY" | "YEARLY";
export type ReferenceRateType = "CDI" | "SELIC";

export interface YieldAccount {
	createdAt: Date;
	id: string;
	institutionYieldPolicies?: InstitutionYieldPolicy[];
	type: string;
	yieldFixedRate?: null | number;
	yieldPeriod?: null | YieldPeriod;
	yieldReferencePercentage?: null | number;
	yieldReferenceType?: null | ReferenceRateType;
	yieldTaxRate?: null | number;
	yieldRateHistories?: YieldRateHistory[];
}

export interface InstitutionYieldPolicy {
	effectiveDate: Date;
	rules: InstitutionYieldRule[];
	yieldPeriod?: null | YieldPeriod;
	yieldTaxRate?: null | number;
}

export interface InstitutionYieldRule {
	upToBalance?: null | number;
	yieldFixedRate?: null | number;
	yieldReferencePercentage?: null | number;
	yieldReferenceType?: null | ReferenceRateType;
}

export interface YieldRateHistory {
	effectiveDate: Date;
	yieldFixedRate?: null | number;
	yieldPeriod?: null | YieldPeriod;
	yieldReferencePercentage?: null | number;
	yieldReferenceType?: null | ReferenceRateType;
	yieldTaxRate?: null | number;
}

export interface YieldTransaction {
	destinationAmount?: number | null;
	amount: number;
	date: Date;
	destinationFinancialAccountId?: null | string;
	originFinancialAccountId?: null | string;
}

export interface CashbackCredit {
	cashbackAccountId?: null | string;
	cashbackAmount?: null | number;
	cashbackYieldPeriod?: null | YieldPeriod;
	cashbackYieldReferencePercentage?: null | number;
	cashbackYieldReferenceRate?: null | number;
	purchaseDate: Date;
}

export interface FinancialAccountYield {
	amount?: null | number;
	date: Date;
	financialAccountId: string;
	isExcluded: boolean;
	kind: "AUTOMATIC" | "MANUAL";
	origin?: "SYSTEM" | "USER";
}

export interface BalanceAdjustment {
	balance: number;
	date: Date;
	financialAccountId: string;
}

export function calculateFinancialAccountYieldBalances({
	accounts,
	adjustments = [],
	cashbackCredits,
	holidays,
	initialRewardsBalances,
	today = new Date(),
	transactions,
	yields = [],
}: {
	accounts: YieldAccount[];
	adjustments?: BalanceAdjustment[];
	cashbackCredits: CashbackCredit[];
	holidays: Date[];
	initialRewardsBalances: Map<string, number>;
	today?: Date;
	transactions: YieldTransaction[];
	yields?: FinancialAccountYield[];
}) {
	const todayKey = format(startOfDay(today), "yyyy-MM-dd");
	const holidayKeys = new Set(holidays.map(dateKey));
	const accountById = new Map(
		accounts.filter(account => account.type !== "CREDIT_CARD").map(account => [account.id, account]),
	);
	const events = new Map<string, Map<string, number>>();
	const cashbackEvents = new Map<string, Map<string, CashbackCredit[]>>();
	const yieldsByAccountId = new Map<string, FinancialAccountYield[]>();
	const adjustmentsByAccountId = new Map<string, Map<string, number>>();
	for (const adjustment of adjustments) {
		const accountAdjustments = adjustmentsByAccountId.get(adjustment.financialAccountId) ?? new Map();
		accountAdjustments.set(dateKey(adjustment.date), adjustment.balance);
		adjustmentsByAccountId.set(adjustment.financialAccountId, accountAdjustments);
	}
	for (const yieldEntry of yields) {
		const accountYields = yieldsByAccountId.get(yieldEntry.financialAccountId) ?? [];
		accountYields.push(yieldEntry);
		yieldsByAccountId.set(yieldEntry.financialAccountId, accountYields);
	}
	const addEvent = (accountId: string, date: Date, amount: number) => {
		const day = dateKey(date);
		if (day > todayKey || !accountById.has(accountId)) return;
		const accountEvents = events.get(accountId) ?? new Map<string, number>();
		accountEvents.set(day, (accountEvents.get(day) ?? 0) + amount);
		events.set(accountId, accountEvents);
	};
	for (const account of accounts.filter(account => account.type === "REWARDS"))
		addEvent(account.id, account.createdAt, initialRewardsBalances.get(account.id) ?? 0);
	for (const transaction of transactions) {
		if (transaction.originFinancialAccountId)
			addEvent(transaction.originFinancialAccountId, transaction.date, -transaction.amount);
		if (transaction.destinationFinancialAccountId)
			addEvent(
				transaction.destinationFinancialAccountId,
				transaction.date,
				transaction.destinationAmount ?? transaction.amount,
			);
	}
	for (const credit of cashbackCredits) {
		if (!credit.cashbackAccountId || !credit.cashbackAmount || !accountById.has(credit.cashbackAccountId))
			continue;
		const day = dateKey(credit.purchaseDate);
		if (day > todayKey) continue;
		const accountEvents = cashbackEvents.get(credit.cashbackAccountId) ?? new Map<string, CashbackCredit[]>();
		const entries = accountEvents.get(day) ?? [];
		entries.push(credit);
		accountEvents.set(day, entries);
		cashbackEvents.set(credit.cashbackAccountId, accountEvents);
	}
	return new Map(
		accounts.map(account => [
			account.id,
			account.type === "CREDIT_CARD"
				? 0
				: Number(
						calculateYieldedBalance(
							account,
							events.get(account.id),
							adjustmentsByAccountId.get(account.id),
							cashbackEvents.get(account.id),
							holidayKeys,
							todayKey,
							yieldsByAccountId.get(account.id),
						).toFixed(4),
					),
		]),
	);
}

function dateKey(date: Date) {
	return date.toISOString().slice(0, 10);
}

export function effectiveYieldRate(settings: {
	fixedRate?: null | number;
	referencePercentage?: null | number;
	referenceRate?: null | number;
}) {
	return (
		(settings.fixedRate ?? 0) + ((settings.referenceRate ?? 0) * (settings.referencePercentage ?? 0)) / 100
	);
}

function fixedDailyRate(fixedRate?: null | number, period?: null | YieldPeriod) {
	if (!fixedRate || !period) return 0;
	return (1 + fixedRate / 100) ** (1 / (period === "MONTHLY" ? 21 : 252)) - 1;
}

function referenceDailyRate(
	type: null | ReferenceRateType | undefined,
	percentage: null | number | undefined,
	referenceRates: Partial<Record<ReferenceRateType, number>>,
) {
	if (!type || !percentage || referenceRates[type] === undefined) return null;
	return (referenceRates[type]! / 100) * (percentage / 100);
}

function dailyRate(settings: Parameters<typeof effectiveYieldRate>[0], period?: null | YieldPeriod) {
	const rate = effectiveYieldRate(settings);
	if (!rate || !period) return 0;
	return (1 + rate / 100) ** (1 / (period === "MONTHLY" ? 21 : 252)) - 1;
}

function calculateYieldedBalance(
	account: YieldAccount,
	events: Map<string, number> | undefined,
	adjustments: Map<string, number> | undefined,
	cashbackEvents: Map<string, CashbackCredit[]> | undefined,
	holidays: Set<string>,
	todayKey: string,
	yields: FinancialAccountYield[] | undefined,
) {
	const firstDay = [
		...(events?.keys() ?? []),
		...(adjustments?.keys() ?? []),
		...(cashbackEvents?.keys() ?? []),
		...(yields?.map(yieldEntry => dateKey(yieldEntry.date)) ?? []),
	].toSorted()[0];
	if (!firstDay) return 0;
	let balance = 0;
	const cashbackBalances = new Map<number, number>();
	for (let day = new Date(`${firstDay}T12:00:00`); dateKey(day) <= todayKey; day = addDays(day, 1)) {
		const key = dateKey(day);
		balance += events?.get(key) ?? 0;
		for (const credit of cashbackEvents?.get(key) ?? []) {
			const rate = dailyRate(
				{
					referencePercentage: credit.cashbackYieldReferencePercentage,
					referenceRate: credit.cashbackYieldReferenceRate,
				},
				credit.cashbackYieldPeriod,
			);
			if (rate) cashbackBalances.set(rate, (cashbackBalances.get(rate) ?? 0) + Number(credit.cashbackAmount));
			else balance += Number(credit.cashbackAmount);
		}
		const manualYields = yields?.filter(
			yieldEntry =>
				yieldEntry.kind === "MANUAL" && dateKey(yieldEntry.date) === key && !yieldEntry.isExcluded,
		);
		if (isWeekend(day) || holidays.has(key)) {
			for (const manualYield of manualYields ?? []) balance += manualYield.amount ?? 0;
			if (adjustments?.has(key)) balance = adjustments.get(key)!;
			continue;
		}
		const yieldSettings = getYieldSettings(account, key);
		const automaticYield = yields?.find(
			yieldEntry => yieldEntry.kind === "AUTOMATIC" && dateKey(yieldEntry.date) === key,
		);
		if (balance > 0 && !automaticYield?.isExcluded) {
			const hasReference = settingsRequireReference(yieldSettings);
			const grossAmount = hasReference ? 0 : calculateGrossYield(balance, yieldSettings, {});
			const calculatedAmount = grossAmount * (1 - (yieldSettings?.yieldTaxRate ?? 0) / 100);
			if (automaticYield?.amount !== null && automaticYield?.amount !== undefined)
				balance += automaticYield.amount;
			else if (!hasReference) balance += calculatedAmount;
		}
		for (const [rate, cashbackBalance] of cashbackBalances) {
			if (cashbackBalance > 0) cashbackBalances.set(rate, cashbackBalance * (1 + rate));
		}
		for (const manualYield of manualYields ?? []) {
			balance += manualYield.amount ?? 0;
		}
		if (adjustments?.has(key)) balance = adjustments.get(key)!;
	}
	return balance + [...cashbackBalances.values()].reduce((total, value) => total + value, 0);
}

function getYieldSettings(account: YieldAccount, day: string) {
	const history = account.yieldRateHistories
		?.filter(item => dateKey(item.effectiveDate) <= day)
		.toSorted((left, right) => left.effectiveDate.valueOf() - right.effectiveDate.valueOf())
		.at(-1);
	const accountSettings = history ?? {
		yieldFixedRate: account.yieldFixedRate,
		yieldPeriod: account.yieldPeriod,
		yieldReferencePercentage: account.yieldReferencePercentage,
		yieldReferenceType: account.yieldReferenceType,
		yieldTaxRate: account.yieldTaxRate,
	};
	if (accountSettings.yieldReferenceType || (accountSettings.yieldFixedRate && accountSettings.yieldPeriod))
		return accountSettings;
	if (account.type !== "CHECKING" && account.type !== "SAVINGS") return accountSettings;
	return account.institutionYieldPolicies
		?.filter(policy => dateKey(policy.effectiveDate) <= day)
		.toSorted((left, right) => left.effectiveDate.valueOf() - right.effectiveDate.valueOf())
		.at(-1);
}

export function settingsRequireReference(settings: ReturnType<typeof getYieldSettings>) {
	if (!settings) return false;
	return "rules" in settings
		? settings.rules.some(rule => Boolean(rule.yieldReferenceType))
		: Boolean(settings.yieldReferenceType);
}

export function calculateGrossYield(
	balance: number,
	settings: ReturnType<typeof getYieldSettings>,
	referenceRates: Partial<Record<ReferenceRateType, number>>,
) {
	if (!settings) return 0;
	if (!("rules" in settings)) return balance * ruleDailyRate(settings, settings.yieldPeriod, referenceRates);
	let previousLimit = 0;
	let grossYield = 0;
	for (const rule of settings.rules) {
		const upperLimit = rule.upToBalance ?? balance;
		const amountInBracket = Math.max(0, Math.min(balance, upperLimit) - previousLimit);
		grossYield += amountInBracket * ruleDailyRate(rule, settings.yieldPeriod, referenceRates);
		previousLimit = upperLimit;
		if (previousLimit >= balance) break;
	}
	return grossYield;
}

function ruleDailyRate(
	rule: InstitutionYieldRule,
	period: null | YieldPeriod | undefined,
	referenceRates: Partial<Record<ReferenceRateType, number>>,
) {
	const reference = referenceDailyRate(
		rule.yieldReferenceType,
		rule.yieldReferencePercentage,
		referenceRates,
	);
	if (rule.yieldReferenceType && reference === null) return 0;
	return fixedDailyRate(rule.yieldFixedRate, period) + (reference ?? 0);
}

export { getYieldSettings };
