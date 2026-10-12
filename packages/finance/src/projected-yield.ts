import { type YieldLot, YieldTaxLedger } from "./yield-tax";
export interface LegacyYieldCalendar {
	throughDate: string;
	holidays: string[];
}
/** Frozen migration calendar applies only to days preceding the migration boundary. */
export function legacyCalendarHoliday(
	account: { legacyYieldCalendar?: LegacyYieldCalendar | null },
	day: string,
): boolean | undefined {
	const snapshot = account.legacyYieldCalendar;
	return snapshot && day < snapshot.throughDate ? snapshot.holidays.includes(day) : undefined;
}
export type YieldPeriod = "MONTHLY" | "YEARLY";
export type ReferenceRateType = "CDI" | "SELIC";

export interface YieldAccount {
	currency?: string;
	countryCode?: null | string;
	defaultInstitutionProfileId?: null | string;
	globalRulesFrom?: null | Date | string;
	institutionProfileChanges?: InstitutionProfileChange[];
	createdAt: Date | string;
	yieldLots?: YieldLot[];
	id: string;
	institutionYieldPolicies?: InstitutionYieldPolicy[];
	legacyInstitutionYieldPolicies?: InstitutionYieldPolicy[];
	type: string;
	yieldFixedRate?: null | number;
	yieldPeriod?: null | YieldPeriod;
	yieldReferencePercentage?: null | number;
	yieldReferenceType?: null | ReferenceRateType;
	yieldTaxRate?: null | number;
	yieldTaxIds?: string[] | null;
	yieldRateHistories?: YieldRateHistory[];
}

export interface InstitutionProfileChange {
	profileId: string;
	effectiveDate: Date | string;
}

export interface InstitutionYieldPolicy {
	profileId?: null | string;
	countryCode?: null | string;
	effectiveUntil?: null | Date | string;
	status?: "APPROVED" | "PENDING" | "REJECTED";
	currency?: string;
	effectiveDate: Date | string;
	rules: InstitutionYieldRule[];
	yieldPeriod?: null | YieldPeriod;
	yieldTaxRate?: null | number;
	yieldTaxIds?: string[] | null;
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
	yieldTaxIds?: string[] | null;
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
		yieldTaxIds: account.yieldTaxIds,
		yieldTaxRate: account.yieldTaxRate,
	};
	if (
		accountSettings.yieldReferenceType ||
		(accountSettings.yieldFixedRate !== null &&
			accountSettings.yieldFixedRate !== undefined &&
			accountSettings.yieldPeriod)
	)
		return accountSettings;
	if (account.type !== "CHECKING" && account.type !== "SAVINGS") return accountSettings;
	const profileId =
		account.institutionProfileChanges
			?.filter(change => dateKey(change.effectiveDate) <= day)
			.toSorted((left, right) =>
				dateKey(left.effectiveDate).localeCompare(dateKey(right.effectiveDate)),
			)
			.at(-1)?.profileId ?? account.defaultInstitutionProfileId;
	const policies =
		account.legacyInstitutionYieldPolicies &&
		(account.globalRulesFrom === null ||
			(account.globalRulesFrom && day < dateKey(account.globalRulesFrom)))
			? account.legacyInstitutionYieldPolicies
			: account.institutionYieldPolicies;
	return policies
		?.filter(
			policy =>
				dateKey(policy.effectiveDate) <= day &&
				(!policy.effectiveUntil || day < dateKey(policy.effectiveUntil)) &&
				(!policy.status || policy.status === "APPROVED") &&
				(!policy.profileId ||
					(policy.profileId === profileId &&
						account.globalRulesFrom !== null &&
						(!account.globalRulesFrom || day >= dateKey(account.globalRulesFrom)))) &&
				(!policy.countryCode || policy.countryCode === account.countryCode) &&
				(policy.currency ?? "BRL") === (account.currency ?? "BRL"),
		)
		.toSorted(
			(left, right) =>
				Number(Boolean(left.countryCode)) - Number(Boolean(right.countryCode)) ||
				dateKey(left.effectiveDate).localeCompare(dateKey(right.effectiveDate)),
		)
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

/** Keep absent policy coverage distinct from an explicitly configured zero rate. */
export function resolveYieldCoverage(account: YieldAccount, day: string) {
	const settings = getYieldSettings(account, day);
	return settings
		? { settings, status: "COMPLETE" as const }
		: { settings: undefined, status: "PENDING" as const };
}
export function projectedNetYield(
	account: YieldAccount,
	balance: number,
	day: string,
	averages: Partial<Record<ReferenceRateType, number>>,
	holidays: ReadonlySet<string> = new Set(),
	ledger?: YieldTaxLedger,
) {
	const weekday = new Date(`${day}T12:00:00`).getDay();
	if (balance <= 0 || weekday === 0 || weekday === 6 || holidays.has(day)) return 0;
	const settings = getYieldSettings(account, day);
	const contributions = ledger ?? new YieldTaxLedger(account.yieldLots ?? []);
	if (!ledger) contributions.adjustBalance(balance, day);
	return contributions.netYield(calculateGrossYield(balance, settings, averages), settings, day);
}
