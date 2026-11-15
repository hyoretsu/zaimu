import { isCryptoAsset } from "@zaimu/finance/money";
import {
	getYieldSettings as resolveYieldSettings,
	legacyCalendarHoliday,
} from "@zaimu/finance/projected-yield";
import { creditDailyYield, hasRedemptionTax, type YieldLot, YieldTaxLedger } from "@zaimu/finance/yield-tax";
import { addDays, differenceInMonths, differenceInYears, format, isWeekend, startOfDay } from "date-fns";
import { assetBalance, fiatAssets, normalizeAccountAssets, replayAccountAssets } from "./account-assets";
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
	| "amount"
	| "destinationAmount"
	| "destinationFinancialAccountId"
	| "originFinancialAccountId"
	| "bookingCurrency"
	| "currency"
	| "destinationCurrency"
	| "fees"
> & { date?: Date | string; id?: string };
type CashbackPurchase = Omit<
	Pick<
		import("./api").CreditPurchase,
		| "cashbackAccountId"
		| "cashbackAmount"
		| "cashbackYieldPeriod"
		| "cashbackYieldReferencePercentage"
		| "cashbackYieldReferenceRate"
		| "purchaseDate"
	>,
	"cashbackAmount"
> & { cashbackAmount?: number | string | null; currency?: string };

export interface FinancialAccountYieldEntry {
	endingBalance?: number;
	currency?: string;
	amount: number;
	date: string;
	financialAccountId: string;
	id: string;
	kind: "AUTOMATIC" | "MANUAL";
	isHidden?: boolean;
	isSynced?: boolean;
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
		yieldPeriod === "MONTHLY"
			? differenceInMonths(today, awardedAt)
			: differenceInYears(today, awardedAt),
	);
	const rate = (yieldReferenceRate * yieldReferencePercentage) / 100;
	return amount * (1 + rate / 100) ** periods;
}

/** Every fiat code that earns yield on the account: all fiat holdings plus the derived primary currency. */
function accountFiatCodes(account: Pick<FinancialAccount, "assets" | "yieldCurrency" | "type">) {
	if (account.type === "CREDIT_CARD") return [];
	const codes = fiatAssets(account.assets).map(asset => asset.assetCode);
	if (
		account.yieldCurrency &&
		!isCryptoAsset(account.yieldCurrency) &&
		!codes.includes(account.yieldCurrency)
	)
		codes.unshift(account.yieldCurrency);
	return codes;
}

const positionKey = (accountId: string, code: string) => `${accountId}|${code}`;

export function calculateFinancialAccountBalances(
	accounts: FinancialAccount[],
	transactions: AccountTransaction[],
	cashbackPurchases: CashbackPurchase[] = [],
	holidays: string[] | YieldCalendar = cachedYieldCalendar(),
	today = new Date(),
	yields: FinancialAccountYield[] = [],
	onAdjustment?: (id: string, calculated: number, complete: boolean) => void,
): FinancialAccount[] {
	const todayKey = format(startOfDay(today), "yyyy-MM-dd");
	const holidayKeys = Array.isArray(holidays) ? new Set(holidays.map(date => date.slice(0, 10))) : null;
	accounts = accounts.map(account => normalizeAccountAssets(account));
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
		const owner = accountById.get(yieldEntry.financialAccountId);
		const code = (yieldEntry as { assetCode?: string | null }).assetCode ?? owner?.yieldCurrency;
		if (!code) continue;
		const key = positionKey(yieldEntry.financialAccountId, code);
		const accountYields = yieldsByAccountId.get(key) ?? [];
		accountYields.push(yieldEntry);
		yieldsByAccountId.set(key, accountYields);
	}
	const addEvent = (accountId: string, code: string, date: string | Date | undefined, amount: number) => {
		const day = dateKey(date ?? todayKey);
		const account = accountById.get(accountId);
		if (day > todayKey || !account || isCryptoAsset(code) || !accountFiatCodes(account).includes(code))
			return;
		const key = positionKey(accountId, code);
		const accountEvents = events.get(key) ?? new Map<string, number[]>();
		accountEvents.set(day, [...(accountEvents.get(day) ?? []), amount]);
		events.set(key, accountEvents);
	};
	for (const account of accounts.filter(account => account.type === "REWARDS")) {
		const code = account.rewardsAccount?.assetCode ?? account.yieldCurrency;
		if (
			isPointsAccount(account) ||
			(code != null && !isCryptoAsset(code) && accountFiatCodes(account).includes(code))
		)
			addEvent(
				account.id,
				isPointsAccount(account) ? (account.yieldCurrency ?? code!) : code!,
				account.createdAt,
				Number(account.rewardsAccount?.initialBalance ?? 0),
			);
	}
	for (const transaction of transactions.toSorted(
		(a, b) =>
			dateKey(a.date ?? todayKey).localeCompare(dateKey(b.date ?? todayKey)) ||
			(a.id ?? "").localeCompare(b.id ?? ""),
	)) {
		if (transaction.originFinancialAccountId) {
			const account = accountById.get(transaction.originFinancialAccountId);
			const code = transaction.bookingCurrency ?? transaction.currency ?? account?.yieldCurrency;
			if (account && code) addEvent(account.id, code, transaction.date, -Number(transaction.amount));
		}
		if (transaction.destinationFinancialAccountId) {
			const account = accountById.get(transaction.destinationFinancialAccountId);
			const code =
				transaction.destinationCurrency ??
				transaction.bookingCurrency ??
				transaction.currency ??
				account?.yieldCurrency;
			if (account && code)
				addEvent(
					account.id,
					code,
					transaction.date,
					Number(transaction.destinationAmount ?? transaction.amount),
				);
		}
	}
	for (const purchase of cashbackPurchases) {
		if (
			!purchase.cashbackAccountId ||
			!purchase.cashbackAmount ||
			!accountById.has(purchase.cashbackAccountId)
		)
			continue;
		const cashbackAccount = accountById.get(purchase.cashbackAccountId)!;
		const cashbackCode = purchase.currency ?? cashbackAccount.yieldCurrency;
		if (
			purchase.currency &&
			(isCryptoAsset(purchase.currency) ||
				!accountFiatCodes(cashbackAccount).includes(purchase.currency))
		)
			continue;
		if (!cashbackCode) continue;
		const day = purchase.purchaseDate.slice(0, 10);
		if (day > todayKey) continue;
		const cashbackKey = positionKey(purchase.cashbackAccountId, cashbackCode);
		const accountEvents = cashbackEvents.get(cashbackKey) ?? new Map();
		const entries = accountEvents.get(day) ?? [];
		entries.push({
			amount: Number(purchase.cashbackAmount),
			yieldPeriod: purchase.cashbackYieldPeriod,
			yieldReferencePercentage: purchase.cashbackYieldReferencePercentage,
			yieldReferenceRate: purchase.cashbackYieldReferenceRate,
		});
		accountEvents.set(day, entries);
		cashbackEvents.set(cashbackKey, accountEvents);
	}
	const yieldedBalances = (account: (typeof accounts)[number]) => {
		const codes = new Set(accountFiatCodes(account));
		const prefix = `${account.id}|`;
		for (const key of events.keys()) if (key.startsWith(prefix)) codes.add(key.slice(prefix.length));
		const primary = account.yieldCurrency;
		if (primary && codes.has(primary)) codes.delete(primary);
		return new Map(
			[...(primary ? [primary] : []), ...codes].map(code => [
				code,
				Number(
					calculateYieldedBalance(
						account,
						code,
						events.get(positionKey(account.id, code)),
						cashbackEvents.get(positionKey(account.id, code)),
						holidayKeys ?? new Set(holidayDatesForAccount(holidays as YieldCalendar, account)),
						todayKey,
						yieldsByAccountId.get(positionKey(account.id, code)),
						code === primary ? snapshots : undefined,
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
						onAdjustment,
					).toFixed(4),
				),
			]),
		);
	};
	return accounts
		.map(account => {
			const positions =
				account.type === "CREDIT_CARD" ? new Map<string, number>() : yieldedBalances(account);
			return {
				...account,
				balance:
					account.type === "CREDIT_CARD" || !account.yieldCurrency
						? null
						: (positions.get(account.yieldCurrency) ?? 0),
				positions,
			};
		})
		.map(({ positions, ...account }) => {
			const yieldLots = snapshots.get(account.id) ?? [];
			const settings = getYieldSettings(account, todayKey);
			const deferredTax =
				account.balance === null || !hasRedemptionTax(settings)
					? 0
					: new YieldTaxLedger(yieldLots).deferredTax(settings, todayKey);
			return {
				...normalizeAccountAssets(account),
				assets:
					account.type === "CREDIT_CARD"
						? []
						: isPointsAccount(account)
							? []
							: (() => {
									const rewardMovements = cashbackPurchases
										.filter(
											purchase =>
												purchase.cashbackAccountId === account.id &&
												purchase.cashbackAmount != null &&
												purchase.currency &&
												!positions.has(purchase.currency),
										)
										.map(purchase => ({
											amount: purchase.cashbackAmount!,
											bookingCurrency: purchase.currency,
											currency: purchase.currency,
											date: purchase.purchaseDate,
											destinationCurrency: purchase.currency,
											destinationFinancialAccountId: account.id,
										}));
									const rewardCode =
										account.rewardsAccount?.assetCode ?? account.yieldCurrency;
									const initialReward =
										account.type === "REWARDS" &&
										rewardCode != null &&
										isCryptoAsset(rewardCode) &&
										account.rewardsAccount?.initialBalance != null
											? [
													{
														amount: account.rewardsAccount.initialBalance,
														bookingCurrency: rewardCode,
														currency: rewardCode,
														date: account.createdAt,
														destinationCurrency: rewardCode,
														destinationFinancialAccountId: account.id,
													},
												]
											: [];
									const assets = replayAccountAssets(
										account.id,
										[...initialReward, ...transactions, ...rewardMovements],
										account.balanceAdjustments ?? [],
										account.yieldCurrency,
										todayKey,
									);
									return [
										...assets.filter(asset => !positions.has(asset.assetCode)),
										...[...positions].map(([assetCode, balance]) => ({
											assetCode,
											balance: String(balance),
										})),
									];
								})(),
				netBalance: deferredTax > 0 ? Number((account.balance! - deferredTax).toFixed(4)) : null,
				pointsBalance: isPointsAccount(account) ? (account.balance ?? 0) : undefined,
				yieldLots,
			};
		});
}

export function calculateFinancialAccountYieldEntries(
	account: FinancialAccount,
	transactions: AccountTransaction[],
	holidays: string[] | YieldCalendar = cachedYieldCalendar(),
	today = new Date(),
	allYields: FinancialAccountYield[] = [],
	assetCode: string | null = account.yieldCurrency,
): FinancialAccountYieldEntry[] {
	if (account.type === "CREDIT_CARD") return [];
	const yields = allYields.filter(
		entry =>
			!assetCode ||
			((entry as { assetCode?: string | null }).assetCode ?? account.yieldCurrency) === assetCode,
	);
	const todayKey = format(startOfDay(today), "yyyy-MM-dd");
	const events = new Map<string, number[]>();
	for (const transaction of transactions.toSorted(
		(a, b) =>
			dateKey(a.date ?? todayKey).localeCompare(dateKey(b.date ?? todayKey)) ||
			(a.id ?? "").localeCompare(b.id ?? ""),
	)) {
		const day = dateKey(transaction.date ?? todayKey);
		const code =
			transaction.destinationFinancialAccountId === account.id
				? (transaction.destinationCurrency ?? transaction.bookingCurrency ?? transaction.currency)
				: (transaction.bookingCurrency ?? transaction.currency);
		if (day > todayKey || (code && (isCryptoAsset(code) || (assetCode != null && code !== assetCode))))
			continue;
		const amount =
			transaction.destinationFinancialAccountId === account.id
				? Number(transaction.destinationAmount ?? transaction.amount)
				: transaction.originFinancialAccountId === account.id
					? -Number(transaction.amount)
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
	let carry = 0;
	for (
		let day = new Date(`${firstDay}T12:00:00`);
		format(day, "yyyy-MM-dd") <= todayKey;
		day = addDays(day, 1)
	) {
		const key = format(day, "yyyy-MM-dd");
		for (const movement of events.get(key) ?? []) ledger.applyCashFlow(movement, key);
		balance = ledger.balance;
		const hasManualYield = yields?.some(
			entry => entry.kind === "MANUAL" && entry.date.slice(0, 10) === key,
		);
		const manualYields = yields.filter(
			yieldEntry =>
				yieldEntry.kind === "MANUAL" &&
				!yieldEntry.isExcluded &&
				yieldEntry.date.slice(0, 10) === key,
		);
		if (isWeekend(day) || (legacyCalendarHoliday(account, key) ?? holidayKeys.has(key))) {
			const recorded = yields.find(
				entry => entry.kind === "AUTOMATIC" && entry.date.slice(0, 10) === key && !entry.isExcluded,
			);
			if (!hasManualYield && recorded?.amount != null) {
				entries.push({
					...recorded,
					amount: recorded.amount,
					currency: assetCode ?? "BRL",
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
					currency: assetCode ?? "BRL",
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
		if (balance > 0 && !hasManualYield && !automaticYield?.isExcluded) {
			const settings = getYieldSettings(account, key, assetCode);
			const calendarCovered =
				Array.isArray(holidays) ||
				legacyCalendarHoliday(account, key) !== undefined ||
				accountCalendarCovered(holidays, account, day, day);
			const grossAmount = calendarCovered
				? calculateGrossYield(ledger.eligibleBalance(key), settings)
				: 0;
			const net = ledger.netYield(grossAmount, settings, key);
			const credit = creditDailyYield(account.type, net, carry);
			const calculatedAmount = credit.credited;
			carry =
				automaticYield?.amount != null
					? automaticYield.origin === "SYSTEM"
						? Math.max(0, carry + net - automaticYield.amount)
						: carry
					: credit.carry;
			const amount = automaticYield?.amount ?? calculatedAmount;
			if (amount > 0) {
				entries.push({
					amount,
					currency: assetCode ?? "BRL",
					date: key,
					financialAccountId: account.id,
					id: automaticYield?.id ?? `automatic-yield-${account.id}-${key}`,
					isHidden: automaticYield?.isHidden,
					kind: "AUTOMATIC",
				});
				if (automaticYield?.amount != null) {
					if (automaticYield.origin === "SYSTEM") ledger.accrueRecordedNet(amount, settings, key);
					else ledger.accrueNet(amount, key);
				} else ledger.accrueRecordedNet(calculatedAmount, settings, key);
				balance = ledger.balance;
			}
		}
		for (const manualYield of manualYields) {
			if (!manualYield.amount) continue;
			entries.push({
				...manualYield,
				amount: manualYield.amount,
				currency: assetCode ?? "BRL",
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
	code: string,
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
	onAdjustment?: (id: string, calculated: number, complete: boolean) => void,
) {
	const checkpoints = new Map(
		(account.balanceAdjustments ?? [])
			.filter(item => (item.assetCode ?? account.yieldCurrency) === code)
			.map(item => [item.date.slice(0, 10), item]),
	);
	const yieldsByDay = Map.groupBy(yields ?? [], entry => entry.date.slice(0, 10));
	let complete = true;
	const firstDay = [
		...checkpoints.keys(),
		...(events?.keys() ?? []),
		...(cashbackEvents?.keys() ?? []),
		...yieldsByDay.keys(),
	].toSorted()[0];
	if (!firstDay) return 0;
	let balance = 0;
	const ledger = new YieldTaxLedger();
	let carry = 0;
	const cashbackBalances = new Map<number, number>();
	const applyAdjustment = (key: string) => {
		const checkpoint = checkpoints.get(key);
		if (!checkpoint) return;
		onAdjustment?.(checkpoint.id, ledger.balance, complete);
		ledger.adjustBalance(Number(checkpoint.balance), key);
		balance = ledger.balance;
	};
	for (
		let day = new Date(`${firstDay}T12:00:00`);
		format(day, "yyyy-MM-dd") <= todayKey;
		day = addDays(day, 1)
	) {
		const key = format(day, "yyyy-MM-dd");
		const dayYields = yieldsByDay.get(key) ?? [];
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
		const hasManualYield = dayYields.some(entry => entry.kind === "MANUAL");
		const manualYields = dayYields.filter(
			yieldEntry => yieldEntry.kind === "MANUAL" && !yieldEntry.isExcluded,
		);
		if (isWeekend(day) || (legacyCalendarHoliday(account, key) ?? holidays.has(key))) {
			for (const manualYield of manualYields) ledger.accrueNet(manualYield.amount ?? 0, key);
			const recorded = dayYields.find(entry => entry.kind === "AUTOMATIC" && !entry.isExcluded);
			if (!hasManualYield && recorded?.amount != null) ledger.accrueNet(recorded.amount, key);
			balance = ledger.balance;
			applyAdjustment(key);
			continue;
		}
		const yieldSettings = getYieldSettings(account, key);
		const automaticYield = dayYields.find(yieldEntry => yieldEntry.kind === "AUTOMATIC");
		if (balance > 0 && !hasManualYield && !automaticYield?.isExcluded) {
			const hasReference = settingsRequireReference(yieldSettings);
			const grossAmount = hasReference
				? 0
				: calculateGrossYield(ledger.eligibleBalance(key), yieldSettings);
			if (
				(hasReference && automaticYield?.amount == null) ||
				(grossAmount > 0 && !(calendarCovered?.(key) ?? true))
			)
				complete = false;

			const net = hasReference ? 0 : ledger.netYield(grossAmount, yieldSettings, key);
			if (automaticYield?.amount !== null && automaticYield?.amount !== undefined) {
				if (automaticYield.origin === "SYSTEM") {
					ledger.accrueRecordedNet(automaticYield.amount, yieldSettings, key);
					carry = Math.max(0, carry + net - automaticYield.amount);
				} else ledger.accrueNet(automaticYield.amount, key);
			} else if (!hasReference && (calendarCovered?.(key) ?? true)) {
				const credit = creditDailyYield(account.type, net, carry);
				carry = credit.carry;
				ledger.accrueRecordedNet(credit.credited, yieldSettings, key);
			}
			balance = ledger.balance;
		}
		for (const [dailyRate, cashbackBalance] of cashbackBalances) {
			if (cashbackBalance > 0) cashbackBalances.set(dailyRate, cashbackBalance * (1 + dailyRate));
		}
		for (const manualYield of manualYields) ledger.accrueNet(manualYield.amount ?? 0, key);
		balance = ledger.balance;
		applyAdjustment(key);
	}
	snapshots?.set(
		account.id,
		ledger.lots.map(lot => ({ ...lot })),
	);
	return balance + [...cashbackBalances.values()].reduce((total, value) => total + value, 0);
}

function getYieldSettings(account: FinancialAccount, day: string, assetCode = account.yieldCurrency) {
	return resolveYieldSettings(
		{
			...account,
			currency: assetCode ?? "BRL",
			institutionYieldPolicies: account.institution?.yieldPolicies,
		},
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

export type FinancialAccountLabel = Pick<FinancialAccount, "name" | "type"> & {
	institution?:
		| (Pick<NonNullable<FinancialAccount["institution"]>, "name"> &
				Partial<NonNullable<FinancialAccount["institution"]>>)
		| null;
};

const displayNameCollator = new Intl.Collator("pt-BR", { sensitivity: "base" });

export function getFinancialAccountDisplayName(account: FinancialAccountLabel) {
	return account.name?.trim() || account.institution?.name || financialAccountTypeLabels[account.type];
}

export function getFinancialAccountSummaryName(
	account: Pick<FinancialAccount, "name"> & {
		institution?: { name: string } | null;
		type: FinancialAccount["type"] | "CASHBACK";
	},
) {
	const name = account.name?.trim();
	if (name) {
		return account.type === "SAVINGS" && name !== financialAccountTypeLabels.SAVINGS
			? `${financialAccountOptionPrefixes.SAVINGS} ${name}`
			: name;
	}
	const institution = account.institution?.name;
	if (!institution) return financialAccountTypeLabels[account.type];
	return `${financialAccountOptionPrefixes[account.type]} ${institution}`;
}

export function getFinancialAccountTitle(account: FinancialAccountLabel) {
	const name = account.name?.trim();
	const repeatsInstitution =
		name &&
		account.institution &&
		normalizeInstitutionName(name) === normalizeInstitutionName(account.institution.name);
	return name && !repeatsInstitution ? name : financialAccountTypeLabels[account.type];
}

export function getFinancialAccountOptionLabel(account: FinancialAccountLabel) {
	const displayName = getFinancialAccountDisplayName(account);
	return displayName === financialAccountTypeLabels[account.type]
		? displayName
		: `${financialAccountOptionPrefixes[account.type]} ${displayName}`;
}

export function compareFinancialAccountsByOptionLabel(
	left: FinancialAccountLabel,
	right: FinancialAccountLabel,
) {
	return displayNameCollator.compare(
		getFinancialAccountOptionLabel(left),
		getFinancialAccountOptionLabel(right),
	);
}

export function compareFinancialAccountsByDisplayName(
	left: FinancialAccountLabel,
	right: FinancialAccountLabel,
) {
	return displayNameCollator.compare(
		getFinancialAccountDisplayName(left),
		getFinancialAccountDisplayName(right),
	);
}

export function compareFinancialAccountsByTitle(left: FinancialAccountLabel, right: FinancialAccountLabel) {
	return displayNameCollator.compare(getFinancialAccountTitle(left), getFinancialAccountTitle(right));
}

export function getTransactionSourceAccounts(accounts: FinancialAccount[]) {
	return accounts.filter(account => account.type !== "CREDIT_CARD");
}

export function isPointsAccount(account?: Pick<FinancialAccount, "rewardsAccount" | "type"> | null) {
	return account?.type === "REWARDS" && account.rewardsAccount?.kind === "POINTS";
}

/**
 * Points have no fixed rate: the user informs both sides of every movement.
 * `amount` is always the origin side; the counterpart goes to `paymentAmount` (card) or `destinationAmount`.
 */
export function getPointsConversion(input: {
	destination?: Pick<FinancialAccount, "rewardsAccount" | "type"> | null;
	hasCard: boolean;
	origin?: Pick<FinancialAccount, "rewardsAccount" | "type"> | null;
	type: string;
}) {
	const originPoints = input.type !== "INCOME" && isPointsAccount(input.origin);
	const destinationPoints =
		input.type === "TRANSFER" && !originPoints && isPointsAccount(input.destination);
	return {
		amountIsPoints: originPoints,
		counterpart: originPoints
			? input.hasCard
				? ("payment" as const)
				: input.type === "TRANSFER"
					? ("destination" as const)
					: null
			: destinationPoints
				? ("destination" as const)
				: null,
		counterpartIsPoints: destinationPoints,
	};
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
	if (!account.yieldCurrency) return 0;
	if (account.type !== "REWARDS")
		return isCryptoAsset(account.yieldCurrency)
			? 0
			: Number(assetBalance(account.assets, account.yieldCurrency));
	if (account.rewardsAccount?.kind === "CASHBACK")
		return Number(assetBalance(account.assets, account.yieldCurrency));
	const points = account.rewardsAccount?.conversionPoints;
	const amount = account.rewardsAccount?.conversionAmount;
	return points && amount
		? (Number(account.pointsBalance ?? account.rewardsAccount?.initialBalance ?? 0) / points) * amount
		: 0;
}

/** Native positions for preferred-currency valuation; crypto quantities stay exact. */
export function getFinancialAccountMoneyPositions(
	account: FinancialAccount,
): import("./consolidated-money").MoneyPosition[] {
	if (account.type === "CREDIT_CARD") return [];
	if (isPointsAccount(account))
		return account.yieldCurrency
			? [{ amount: getFinancialAccountCurrencyValue(account), currency: account.yieldCurrency }]
			: [];
	return account.assets.map(asset => ({ amount: asset.balance, currency: asset.assetCode }));
}
