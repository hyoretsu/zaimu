export type YieldPeriod = "MONTHLY" | "YEARLY";
export type ReferenceRateType = "CDI" | "SELIC";

export interface YieldAccount {
	createdAt: Date | string;
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
	effectiveDate: Date | string;
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
	effectiveDate: Date | string;
	yieldFixedRate?: null | number;
	yieldPeriod?: null | YieldPeriod;
	yieldReferencePercentage?: null | number;
	yieldReferenceType?: null | ReferenceRateType;
	yieldTaxRate?: null | number;
}

function dateKey(date: Date | string) {
	return typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
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

function getYieldSettings(account: YieldAccount, day: string) {
	const history = account.yieldRateHistories
		?.filter(item => dateKey(item.effectiveDate) <= day)
		.toSorted((left, right) => dateKey(left.effectiveDate).localeCompare(dateKey(right.effectiveDate)))
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
		.toSorted((left, right) => dateKey(left.effectiveDate).localeCompare(dateKey(right.effectiveDate)))
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
	if (!("rules" in settings))
		return balance * ruleDailyRate(settings, settings.yieldPeriod, referenceRates);
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

	return fixedDailyRate(rule.yieldFixedRate, period) + (reference ?? 0);
}

export { getYieldSettings };
export function projectedNetYield(
	account: YieldAccount,
	balance: number,
	day: string,
	averages: Partial<Record<ReferenceRateType, number>>,
	holidays: ReadonlySet<string> = new Set(),
) {
	const weekday = new Date(`${day}T12:00:00`).getDay();
	if (balance <= 0 || weekday === 0 || weekday === 6 || holidays.has(day)) return 0;
	const settings = getYieldSettings(account, day);
	return calculateGrossYield(balance, settings, averages) * (1 - (settings?.yieldTaxRate ?? 0) / 100);
}
