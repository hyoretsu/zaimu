import {
	legacyCalendarHoliday,
	getYieldSettings as resolveYieldSettings,
} from "@zaimu/finance/projected-yield";
import { type YieldLot, YieldTaxLedger } from "@zaimu/finance/yield-tax";
import { addDays, differenceInMonths, differenceInYears, format, isWeekend, startOfDay } from "date-fns";
import type { FinancialAccount, FinancialAccountYield } from "./api";
import { normalizeInstitutionName } from "./financial-institution";
import {
	accountCalendarCovered,
	cachedYieldCalendar,
	holidayDatesForAccount,
	type YieldCalendar,
} from "./yield-calendar";

type AccountTransaction = Pick<
	import("./api").Transaction,
	"amount" | "destinationAmount" | "destinationFinancialAccountId" | "originFinancialAccountId"
> & { date?: Date | string; id?: string };
type CashbackPurchase = Pick<
	import("./api").CreditPurchase,
	| "cashbackAccountId"
	| "cashbackAmount"
	| "cashbackYieldPeriod"
	| "cashbackYieldReferencePercentage"
	| "cashbackYieldReferenceRate"
	| "purchaseDate"
>;

export interface FinancialAccountYieldEntry {
	endingBalance?: number;
	currency?: string;
	amount: number;
	date: string;
	financialAccountId: string;
	id: string;
	kind: "AUTOMATIC" | "MANUAL";
	isHidden?: boolean;
	time?: string | null;
}

export function calculateCashbackValue(
	amount: number,
	awardedAt: Date,
	yieldReferenceRate?: null | number,
	yieldReferencePercentage?: null | number,
	yieldPeriod?: "MONTHLY" | "YEARLY" | null,
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

export function calculateFinancialAccountBalances(
	accounts: FinancialAccount[],
	transactions: AccountTransaction[],
	cashbackPurchases: CashbackPurchase[] = [],
	holidays: string[] | YieldCalendar = cachedYieldCalendar(),
	today = new Date(),
	yields: FinancialAccountYield[] = [],
): FinancialAccount[] {
	const todayKey = format(startOfDay(today), "yyyy-MM-dd");
	const holidayKeys = Array.isArray(holidays) ? new Set(holidays.map(date => date.slice(0, 10))) : null;
	const accountById = new Map(
		accounts.filter(account => account.type !== "CREDIT_CARD").map(account => [account.id, account]),
	);
	const snapshots = new Map<string, YieldLot[]>();
	const events = new Map<string, Map<string, number[]>>();
	const cashbackEvents = new Map<
		string,
		Map<
			string,
			Array<{
				amount: number;
				yieldPeriod?: "MONTHLY" | "YEARLY" | null;
				yieldReferencePercentage?: null | number;
				yieldReferenceRate?: null | number;
			}>
		>
	>();
	const yieldsByAccountId = new Map<string, FinancialAccountYield[]>();
	for (const yieldEntry of yields) {
		const accountYields = yieldsByAccountId.get(yieldEntry.financialAccountId) ?? [];
		accountYields.push(yieldEntry);
		yieldsByAccountId.set(yieldEntry.financialAccountId, accountYields);
	}
	const addEvent = (accountId: string, date: string | Date | undefined, amount: number) => {
		const day = dateKey(date ?? todayKey);
		if (day > todayKey || !accountById.has(accountId)) return;
		const accountEvents = events.get(accountId) ?? new Map<string, number[]>();
		accountEvents.set(day, [...(accountEvents.get(day) ?? []), amount]);
		events.set(accountId, accountEvents);
	};
	for (const account of accounts.filter(account => account.type === "REWARDS"))
		addEvent(account.id, account.createdAt, account.rewardsAccount?.initialBalance ?? 0);
	for (const transaction of transactions.toSorted(
		(a, b) =>
			dateKey(a.date ?? todayKey).localeCompare(dateKey(b.date ?? todayKey)) ||
			(a.id ?? "").localeCompare(b.id ?? ""),
	)) {
		if (transaction.originFinancialAccountId)
			addEvent(transaction.originFinancialAccountId, transaction.date, -transaction.amount);
		if (transaction.destinationFinancialAccountId)
			addEvent(
				transaction.destinationFinancialAccountId,
				transaction.date,
				transaction.destinationAmount ?? transaction.amount,
			);
	}
	for (const purchase of cashbackPurchases) {
		if (
			!purchase.cashbackAccountId ||
			!purchase.cashbackAmount ||
			!accountById.has(purchase.cashbackAccountId)
		)
			continue;
		const day = purchase.purchaseDate.slice(0, 10);
		if (day > todayKey) continue;
		const accountEvents = cashbackEvents.get(purchase.cashbackAccountId) ?? new Map();
		const entries = accountEvents.get(day) ?? [];
		entries.push({
			amount: purchase.cashbackAmount,
			yieldPeriod: purchase.cashbackYieldPeriod,
			yieldReferencePercentage: purchase.cashbackYieldReferencePercentage,
			yieldReferenceRate: purchase.cashbackYieldReferenceRate,
		});
		accountEvents.set(day, entries);
		cashbackEvents.set(purchase.cashbackAccountId, accountEvents);
	}
	return accounts
		.map(account => ({
			...account,
			balance:
				account.type === "CREDIT_CARD"
					? null
					: Number(
							calculateYieldedBalance(
								account,
								events.get(account.id),
								cashbackEvents.get(account.id),
								holidayKeys ?? new Set(holidayDatesForAccount(holidays as YieldCalendar, account)),
								todayKey,
								yieldsByAccountId.get(account.id),
								snapshots,
								Array.isArray(holidays)
									? undefined
									: day =>
											legacyCalendarHoliday(account, day) !== undefined ||
											accountCalendarCovered(
												holidays,
												account,
												new Date(`${day}T12:00:00`),
												new Date(`${day}T12:00:00`),
											),
							).toFixed(4),
						),
		}))
		.map(account => ({ ...account, yieldLots: snapshots.get(account.id) ?? [] }));
}

export function calculateFinancialAccountYieldEntries(
	account: FinancialAccount,
	transactions: AccountTransaction[],
	holidays: string[] | YieldCalendar = cachedYieldCalendar(),
	today = new Date(),
	yields: FinancialAccountYield[] = [],
): FinancialAccountYieldEntry[] {
	if (account.type === "CREDIT_CARD") return [];
	const todayKey = format(startOfDay(today), "yyyy-MM-dd");
	const events = new Map<string, number[]>();
	for (const transaction of transactions.toSorted(
		(a, b) =>
			dateKey(a.date ?? todayKey).localeCompare(dateKey(b.date ?? todayKey)) ||
			(a.id ?? "").localeCompare(b.id ?? ""),
	)) {
		const day = dateKey(transaction.date ?? todayKey);
		if (day > todayKey) continue;
		const amount =
			transaction.destinationFinancialAccountId === account.id
				? (transaction.destinationAmount ?? transaction.amount)
				: transaction.originFinancialAccountId === account.id
					? -transaction.amount
					: 0;
		events.set(day, [...(events.get(day) ?? []), amount]);
	}
	const firstDay = [
		...events.keys(),
		...yields.map(yieldEntry => yieldEntry.date.slice(0, 10)),
	].toSorted()[0];
	if (!firstDay) return [];
	const holidayKeys = new Set(
		(Array.isArray(holidays) ? holidays : holidayDatesForAccount(holidays, account)).map(date =>
			date.slice(0, 10),
		),
	);
	const entries: FinancialAccountYieldEntry[] = [];
	let balance = 0;
	const ledger = new YieldTaxLedger();
	for (
		let day = new Date(`${firstDay}T12:00:00`);
		format(day, "yyyy-MM-dd") <= todayKey;
		day = addDays(day, 1)
	) {
		const key = format(day, "yyyy-MM-dd");
		for (const movement of events.get(key) ?? []) ledger.applyCashFlow(movement, key);
		balance = ledger.balance;
		const manualYields = yields.filter(
			yieldEntry =>
				yieldEntry.kind === "MANUAL" && !yieldEntry.isExcluded && yieldEntry.date.slice(0, 10) === key,
		);
		if (isWeekend(day) || (legacyCalendarHoliday(account, key) ?? holidayKeys.has(key))) {
			const recorded = yields.find(
				entry => entry.kind === "AUTOMATIC" && entry.date.slice(0, 10) === key && !entry.isExcluded,
			);
			if (recorded?.amount != null) {
				entries.push({
					...recorded,
					amount: recorded.amount,
					currency: account.currency ?? "BRL",
					date: key,
				});
				ledger.accrueNet(recorded.amount, key);
				balance = ledger.balance;
			}

			for (const manualYield of manualYields) {
				if (!manualYield.amount) continue;
				entries.push({
					...manualYield,
					amount: manualYield.amount,
					currency: account.currency ?? "BRL",
					date: key,
				});
				ledger.accrueNet(manualYield.amount, key);
				balance = ledger.balance;
			}
			continue;
		}
		const automaticYield = yields.find(
			yieldEntry => yieldEntry.kind === "AUTOMATIC" && yieldEntry.date.slice(0, 10) === key,
		);
		if (balance > 0 && !automaticYield?.isExcluded) {
			const settings = getYieldSettings(account, key);
			const calendarCovered =
				Array.isArray(holidays) ||
				legacyCalendarHoliday(account, key) !== undefined ||
				accountCalendarCovered(holidays, account, day, day);
			const grossAmount = calendarCovered ? calculateGrossYield(balance, settings) : 0;
			const calculatedAmount = ledger.netYield(grossAmount, settings, key);
			const amount = automaticYield?.amount ?? calculatedAmount;
			if (amount > 0) {
				entries.push({
					amount,
					currency: account.currency ?? "BRL",
					date: key,
					financialAccountId: account.id,
					id: automaticYield?.id ?? `automatic-yield-${account.id}-${key}`,
					isHidden: automaticYield?.isHidden,
					kind: "AUTOMATIC",
				});
				if (automaticYield?.amount != null) {
					if (automaticYield.origin === "SYSTEM") ledger.accrueRecordedNet(amount, settings, key);
					else ledger.accrueNet(amount, key);
				} else ledger.accrueGross(grossAmount, settings, key);
				balance = ledger.balance;
			}
		}
		for (const manualYield of manualYields) {
			if (!manualYield.amount) continue;
			entries.push({
				...manualYield,
				amount: manualYield.amount,
				currency: account.currency ?? "BRL",
				date: key,
			});
			ledger.accrueNet(manualYield.amount, key);
			balance = ledger.balance;
		}
	}
	return entries;
}

function dateKey(value: Date | string) {
	if (typeof value === "string") return value.slice(0, 10);
	return format(value, "yyyy-MM-dd");
}

export function getEffectiveYieldRate(settings: {
	yieldFixedRate?: null | number;
	yieldReferencePercentage?: null | number;
	yieldReferenceRate?: null | number;
	yieldTaxRate?: null | number;
}) {
	return (
		(settings.yieldFixedRate ?? 0) +
		((settings.yieldReferenceRate ?? 0) * (settings.yieldReferencePercentage ?? 0)) / 100
	);
}

function getDailyYieldRate(
	settings: Parameters<typeof getEffectiveYieldRate>[0],
	period?: "MONTHLY" | "YEARLY" | null,
) {
	const rate = getEffectiveYieldRate(settings);
	if (!rate || !period) return 0;
	return (1 + rate / 100) ** (1 / (period === "MONTHLY" ? 21 : 252)) - 1;
}

function calculateYieldedBalance(
	account: FinancialAccount,
	events: Map<string, number[]> | undefined,
	cashbackEvents:
		| Map<
				string,
				Array<{
					amount: number;
					yieldPeriod?: "MONTHLY" | "YEARLY" | null;
					yieldReferencePercentage?: null | number;
					yieldReferenceRate?: null | number;
				}>
		  >
		| undefined,
	holidays: Set<string>,
	todayKey: string,
	yields: FinancialAccountYield[] | undefined,
	snapshots?: Map<string, YieldLot[]>,
	calendarCovered?: (day: string) => boolean,
) {
	const firstDay = [
		...(events?.keys() ?? []),
		...(cashbackEvents?.keys() ?? []),
		...(yields?.map(yieldEntry => yieldEntry.date.slice(0, 10)) ?? []),
	].toSorted()[0];
	if (!firstDay) return 0;
	let balance = 0;
	const ledger = new YieldTaxLedger();
	const cashbackBalances = new Map<number, number>();
	for (
		let day = new Date(`${firstDay}T12:00:00`);
		format(day, "yyyy-MM-dd") <= todayKey;
		day = addDays(day, 1)
	) {
		const key = format(day, "yyyy-MM-dd");
		for (const movement of events?.get(key) ?? []) ledger.applyCashFlow(movement, key);
		balance = ledger.balance;
		for (const cashback of cashbackEvents?.get(key) ?? []) {
			const dailyRate = getDailyYieldRate(
				{
					yieldReferencePercentage: cashback.yieldReferencePercentage,
					yieldReferenceRate: cashback.yieldReferenceRate,
				},
				cashback.yieldPeriod,
			);
			if (dailyRate)
				cashbackBalances.set(dailyRate, (cashbackBalances.get(dailyRate) ?? 0) + cashback.amount);
			else {
				ledger.applyCashFlow(cashback.amount, key);
				balance = ledger.balance;
			}
		}
		const manualYields = yields?.filter(
			yieldEntry =>
				yieldEntry.kind === "MANUAL" && !yieldEntry.isExcluded && yieldEntry.date.slice(0, 10) === key,
		);
		if (isWeekend(day) || (legacyCalendarHoliday(account, key) ?? holidays.has(key))) {
			for (const manualYield of manualYields ?? []) ledger.accrueNet(manualYield.amount ?? 0, key);
			const recorded = yields?.find(
				entry => entry.kind === "AUTOMATIC" && entry.date.slice(0, 10) === key && !entry.isExcluded,
			);
			if (recorded?.amount != null) ledger.accrueNet(recorded.amount, key);
			balance = ledger.balance;
			continue;
		}
		const yieldSettings = getYieldSettings(account, key);
		const automaticYield = yields?.find(
			yieldEntry => yieldEntry.kind === "AUTOMATIC" && yieldEntry.date.slice(0, 10) === key,
		);
		if (balance > 0 && !automaticYield?.isExcluded) {
			const hasReference = settingsRequireReference(yieldSettings);
			const grossAmount = hasReference ? 0 : calculateGrossYield(balance, yieldSettings);

			if (automaticYield?.amount !== null && automaticYield?.amount !== undefined) {
				if (automaticYield.origin === "SYSTEM")
					ledger.accrueRecordedNet(automaticYield.amount, yieldSettings, key);
				else ledger.accrueNet(automaticYield.amount, key);
			} else if (!hasReference && (calendarCovered?.(key) ?? true))
				ledger.accrueGross(grossAmount, yieldSettings, key);
			balance = ledger.balance;
		}
		for (const [dailyRate, cashbackBalance] of cashbackBalances) {
			if (cashbackBalance > 0) cashbackBalances.set(dailyRate, cashbackBalance * (1 + dailyRate));
		}
		for (const manualYield of manualYields ?? []) ledger.accrueNet(manualYield.amount ?? 0, key);
		balance = ledger.balance;
	}
	snapshots?.set(
		account.id,
		ledger.lots.map(lot => ({ ...lot })),
	);
	return balance + [...cashbackBalances.values()].reduce((total, value) => total + value, 0);
}

function getYieldSettings(account: FinancialAccount, day: string) {
	return resolveYieldSettings(
		{ ...account, institutionYieldPolicies: account.institution?.yieldPolicies },
		day,
	);
}

function calculateGrossYield(balance: number, settings: ReturnType<typeof getYieldSettings>) {
	if (!settings?.yieldPeriod) return 0;
	if (!("rules" in settings)) return balance * getDailyYieldRate(settings, settings.yieldPeriod);
	let previousLimit = 0;
	let grossYield = 0;
	for (const rule of settings.rules) {
		const upperLimit = rule.upToBalance ?? balance;
		const amountInBracket = Math.max(0, Math.min(balance, upperLimit) - previousLimit);
		grossYield += amountInBracket * getDailyYieldRate(rule, settings.yieldPeriod);
		previousLimit = upperLimit;
		if (previousLimit >= balance) break;
	}
	return grossYield;
}

function settingsRequireReference(settings: ReturnType<typeof getYieldSettings>) {
	if (!settings) return false;
	return "rules" in settings
		? settings.rules.some(rule => Boolean(rule.yieldReferenceType))
		: Boolean(settings.yieldReferenceType);
}

const financialAccountTypeLabels = {
	CASH: "Dinheiro",
	CASHBACK: "Cashback",
	CHECKING: "Conta corrente",
	CREDIT_CARD: "Cartão de crédito",
	INVESTMENT: "Investimentos",
	REWARDS: "Pontos / cashback",
	SAVINGS: "Poupança",
} as const;

const financialAccountOptionPrefixes = {
	CASH: "Dinheiro",
	CASHBACK: "Cashback",
	CHECKING: "Conta",
	CREDIT_CARD: "Cartão",
	INVESTMENT: "Investimentos",
	REWARDS: "Pontos/cashback",
	SAVINGS: "Poupança",
} as const;

const displayNameCollator = new Intl.Collator("pt-BR", { sensitivity: "base" });

export function getFinancialAccountDisplayName(
	account: Pick<FinancialAccount, "institution" | "name" | "type">,
) {
	return account.name?.trim() || account.institution?.name || financialAccountTypeLabels[account.type];
}

export function getFinancialAccountSummaryName(
	account: Pick<FinancialAccount, "name"> & {
		institution?: { name: string } | null;
		type: FinancialAccount["type"] | "CASHBACK";
	},
) {
	const name = account.name?.trim();
	if (name) return name;
	const institution = account.institution?.name;
	if (!institution) return financialAccountTypeLabels[account.type];
	return `${financialAccountOptionPrefixes[account.type]} ${institution}`;
}

export function getFinancialAccountTitle(account: Pick<FinancialAccount, "institution" | "name" | "type">) {
	const name = account.name?.trim();
	const repeatsInstitution =
		name &&
		account.institution &&
		normalizeInstitutionName(name) === normalizeInstitutionName(account.institution.name);
	return name && !repeatsInstitution ? name : financialAccountTypeLabels[account.type];
}

export function getFinancialAccountOptionLabel(
	account: Pick<FinancialAccount, "institution" | "name" | "type">,
) {
	const displayName = getFinancialAccountDisplayName(account);
	return displayName === financialAccountTypeLabels[account.type]
		? displayName
		: `${financialAccountOptionPrefixes[account.type]} ${displayName}`;
}

export function compareFinancialAccountsByOptionLabel(
	left: Pick<FinancialAccount, "institution" | "name" | "type">,
	right: Pick<FinancialAccount, "institution" | "name" | "type">,
) {
	return displayNameCollator.compare(
		getFinancialAccountOptionLabel(left),
		getFinancialAccountOptionLabel(right),
	);
}

export function compareFinancialAccountsByDisplayName(
	left: Pick<FinancialAccount, "institution" | "name" | "type">,
	right: Pick<FinancialAccount, "institution" | "name" | "type">,
) {
	return displayNameCollator.compare(
		getFinancialAccountDisplayName(left),
		getFinancialAccountDisplayName(right),
	);
}

export function compareFinancialAccountsByTitle(
	left: Pick<FinancialAccount, "institution" | "name" | "type">,
	right: Pick<FinancialAccount, "institution" | "name" | "type">,
) {
	return displayNameCollator.compare(getFinancialAccountTitle(left), getFinancialAccountTitle(right));
}

export function getTransactionSourceAccounts(accounts: FinancialAccount[]) {
	return accounts.filter(
		account =>
			account.type !== "CREDIT_CARD" &&
			(account.type !== "REWARDS" || account.rewardsAccount?.kind === "CASHBACK"),
	);
}

export function getFinancialAccountTypeLabel(type: FinancialAccount["type"]) {
	return financialAccountTypeLabels[type];
}

export function getTransactionAccountTypeLabel(
	type?: FinancialAccount["type"],
	rewardsKind?: "CASHBACK" | "POINTS",
) {
	if (type === "CREDIT_CARD") return "Cartão";
	if (type === "REWARDS" && rewardsKind === "CASHBACK") return "Cashback";
	const label = type ? getFinancialAccountTypeLabel(type) : "Conta";
	return label === "Conta corrente" ? "Conta" : label;
}

export function getFinancialAccountCurrencyValue(account: FinancialAccount) {
	if (account.type === "CREDIT_CARD") return 0;
	if (account.type !== "REWARDS") return account.balance ?? 0;
	if (account.rewardsAccount?.kind === "CASHBACK") return account.balance ?? 0;
	const points = account.rewardsAccount?.conversionPoints;
	const amount = account.rewardsAccount?.conversionAmount;
	return points && amount ? ((account.balance ?? 0) / points) * amount : 0;
}
