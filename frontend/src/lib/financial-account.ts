import { addDays, differenceInMonths, differenceInYears, format, isWeekend, startOfDay } from "date-fns";
import type { FinancialAccount, FinancialAccountYield } from "./api";
import { normalizeInstitutionName } from "./financial-institution";

type AccountTransaction = Pick<
	import("./api").Transaction,
	"amount" | "destinationAmount" | "destinationFinancialAccountId" | "originFinancialAccountId"
> & { date?: Date | string };
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
	holidays: string[] = [],
	today = new Date(),
	yields: FinancialAccountYield[] = [],
): FinancialAccount[] {
	const todayKey = format(startOfDay(today), "yyyy-MM-dd");
	const holidayKeys = new Set(holidays.map(date => date.slice(0, 10)));
	const accountById = new Map(
		accounts.filter(account => account.type !== "CREDIT_CARD").map(account => [account.id, account]),
	);
	const events = new Map<string, Map<string, number>>();
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
		const accountEvents = events.get(accountId) ?? new Map<string, number>();
		accountEvents.set(day, (accountEvents.get(day) ?? 0) + amount);
		events.set(accountId, accountEvents);
	};
	for (const account of accounts.filter(account => account.type === "REWARDS"))
		addEvent(account.id, account.createdAt, account.rewardsAccount?.initialBalance ?? 0);
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
	return accounts.map(account => ({
		...account,
		balance:
			account.type === "CREDIT_CARD"
				? null
				: Number(
						calculateYieldedBalance(
							account,
							events.get(account.id),
							cashbackEvents.get(account.id),
							holidayKeys,
							todayKey,
							yieldsByAccountId.get(account.id),
						).toFixed(4),
					),
	}));
}

export function calculateFinancialAccountYieldEntries(
	account: FinancialAccount,
	transactions: AccountTransaction[],
	holidays: string[] = [],
	today = new Date(),
	yields: FinancialAccountYield[] = [],
): FinancialAccountYieldEntry[] {
	if (account.type === "CREDIT_CARD") return [];
	const todayKey = format(startOfDay(today), "yyyy-MM-dd");
	const events = new Map<string, number>();
	for (const transaction of transactions) {
		const day = dateKey(transaction.date ?? todayKey);
		if (day > todayKey) continue;
		const amount =
			transaction.destinationFinancialAccountId === account.id
				? (transaction.destinationAmount ?? transaction.amount)
				: transaction.originFinancialAccountId === account.id
					? -transaction.amount
					: 0;
		events.set(day, (events.get(day) ?? 0) + amount);
	}
	const firstDay = [
		...events.keys(),
		...yields.map(yieldEntry => yieldEntry.date.slice(0, 10)),
	].toSorted()[0];
	if (!firstDay) return [];
	const holidayKeys = new Set(holidays.map(date => date.slice(0, 10)));
	const entries: FinancialAccountYieldEntry[] = [];
	let balance = 0;
	for (
		let day = new Date(`${firstDay}T12:00:00`);
		format(day, "yyyy-MM-dd") <= todayKey;
		day = addDays(day, 1)
	) {
		const key = format(day, "yyyy-MM-dd");
		balance += events.get(key) ?? 0;
		const manualYields = yields.filter(
			yieldEntry =>
				yieldEntry.kind === "MANUAL" && !yieldEntry.isExcluded && yieldEntry.date.slice(0, 10) === key,
		);
		if (isWeekend(day) || holidayKeys.has(key)) {
			for (const manualYield of manualYields) {
				if (!manualYield.amount) continue;
				entries.push({ ...manualYield, amount: manualYield.amount, date: key });
				balance += manualYield.amount;
			}
			continue;
		}
		const automaticYield = yields.find(
			yieldEntry => yieldEntry.kind === "AUTOMATIC" && yieldEntry.date.slice(0, 10) === key,
		);
		if (balance > 0 && !automaticYield?.isExcluded) {
			const settings = getYieldSettings(account, key);
			const grossAmount = calculateGrossYield(balance, settings);
			const calculatedAmount = grossAmount * (1 - (settings?.yieldTaxRate ?? 0) / 100);
			const amount = automaticYield?.amount ?? calculatedAmount;
			if (amount > 0) {
				entries.push({
					amount,
					date: key,
					financialAccountId: account.id,
					id: automaticYield?.id ?? `automatic-yield-${account.id}-${key}`,
					isHidden: automaticYield?.isHidden,
					kind: "AUTOMATIC",
				});
				balance += amount;
			}
		}
		for (const manualYield of manualYields) {
			if (!manualYield.amount) continue;
			entries.push({ ...manualYield, amount: manualYield.amount, date: key });
			balance += manualYield.amount;
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
	events: Map<string, number> | undefined,
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
) {
	const firstDay = [
		...(events?.keys() ?? []),
		...(cashbackEvents?.keys() ?? []),
		...(yields?.map(yieldEntry => yieldEntry.date.slice(0, 10)) ?? []),
	].toSorted()[0];
	if (!firstDay) return 0;
	let balance = 0;
	const cashbackBalances = new Map<number, number>();
	for (
		let day = new Date(`${firstDay}T12:00:00`);
		format(day, "yyyy-MM-dd") <= todayKey;
		day = addDays(day, 1)
	) {
		const key = format(day, "yyyy-MM-dd");
		balance += events?.get(key) ?? 0;
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
			else balance += cashback.amount;
		}
		const manualYields = yields?.filter(
			yieldEntry =>
				yieldEntry.kind === "MANUAL" && !yieldEntry.isExcluded && yieldEntry.date.slice(0, 10) === key,
		);
		if (isWeekend(day) || holidays.has(key)) {
			for (const manualYield of manualYields ?? []) balance += manualYield.amount ?? 0;
			continue;
		}
		const yieldSettings = getYieldSettings(account, key);
		const automaticYield = yields?.find(
			yieldEntry => yieldEntry.kind === "AUTOMATIC" && yieldEntry.date.slice(0, 10) === key,
		);
		if (balance > 0 && !automaticYield?.isExcluded) {
			const hasReference = settingsRequireReference(yieldSettings);
			const grossAmount = hasReference ? 0 : calculateGrossYield(balance, yieldSettings);
			const calculatedAmount = grossAmount * (1 - (yieldSettings?.yieldTaxRate ?? 0) / 100);
			if (automaticYield?.amount !== null && automaticYield?.amount !== undefined)
				balance += automaticYield.amount;
			else if (!hasReference) balance += calculatedAmount;
		}
		for (const [dailyRate, cashbackBalance] of cashbackBalances) {
			if (cashbackBalance > 0) cashbackBalances.set(dailyRate, cashbackBalance * (1 + dailyRate));
		}
		for (const manualYield of manualYields ?? []) balance += manualYield.amount ?? 0;
	}
	return balance + [...cashbackBalances.values()].reduce((total, value) => total + value, 0);
}

function getYieldSettings(account: FinancialAccount, day: string) {
	const history = account.yieldRateHistories
		?.filter(item => item.effectiveDate.slice(0, 10) <= day)
		.toSorted((left, right) => left.effectiveDate.localeCompare(right.effectiveDate))
		.at(-1);
	const accountSettings = history ?? {
		yieldFixedRate: account.yieldFixedRate,
		yieldPeriod: account.yieldPeriod,
		yieldReferencePercentage: account.yieldReferencePercentage,
		yieldReferenceType: account.yieldReferenceType,
		yieldTaxRate: account.yieldTaxRate,
	};
	if (accountSettings.yieldFixedRate || accountSettings.yieldReferenceType) return accountSettings;
	if (account.type !== "CHECKING" && account.type !== "SAVINGS") return accountSettings;
	return account.institution?.yieldPolicies
		?.filter(
			policy =>
				policy.effectiveDate.slice(0, 10) <= day &&
				(policy.currency ?? "BRL") === (account.currency ?? "BRL"),
		)
		.toSorted((left, right) => left.effectiveDate.localeCompare(right.effectiveDate))
		.at(-1);
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
