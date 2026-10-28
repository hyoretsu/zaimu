import { roundMoney } from "./money";
import { type YieldLot, YieldTaxLedger } from "./yield-tax";
/** Forecasts are disposable copies: reserve withdrawals never create persisted transactions. */
export interface ForecastAccount {
	yieldLots?: YieldLot[];
	currency?: string;
	balance: number;
	id: string;
	type: string;
}
export interface ForecastMovement {
	currency?: string;
	destinationAmount?: number | null;
	cardPayment?: boolean;
	amount: number;
	date: string;
	destinationAccountId?: null | string;
	id?: string;
	originAccountId?: null | string;
	recurring?: boolean;
	recurringAmount?: number;
	type: "EXPENSE" | "INCOME" | "TRANSFER";
}
export interface ForecastDay {
	accountBalance: number;
	balances: Map<string, number>;
	date: string;
	expenses: number;
	fixedIncomeBalance: number;
	income: number;
	recurringExpenses: number;
	recurringIncome: number;
	savingsBalance: number;
	totalBalance: number;
	variableIncomeBalance: number;
}
export function forecastBreakdown(
	accounts: ForecastAccount[],
	balances: Map<string, number>,
	deficit = 0,
	conversion?: { currency: string; rate: (currency: string) => number | null },
) {
	const currencies = new Set(accounts.map(account => account.currency ?? "BRL"));
	if (!conversion && currencies.size > 1)
		throw new Error("Mixed forecast currencies require consolidation rates");
	const factor = (currency: string) => {
		if (!conversion || currency === conversion.currency) return 1;
		const rate = conversion.rate(currency);
		if (rate == null || !Number.isFinite(rate) || rate <= 0)
			throw new Error(`Unavailable forecast conversion: ${currency}/${conversion.currency}`);
		return rate;
	};
	const sum = (types: string[]) =>
		accounts
			.filter(account => types.includes(account.type))
			.reduce(
				(total, account) =>
					total +
					((balances.get(account.id) ?? 0) === 0
						? 0
						: (balances.get(account.id) ?? 0) * factor(account.currency ?? "BRL")),
				0,
			);
	const accountBalance = sum(["CHECKING", "CASH", "CASHBACK"]) + deficit;
	const fixedIncomeBalance = sum(["SAVINGS"]);
	const variableIncomeBalance = sum(["INVESTMENT"]);
	return {
		accountBalance,
		fixedIncomeBalance,
		savingsBalance: fixedIncomeBalance,
		totalBalance: accountBalance + fixedIncomeBalance + variableIncomeBalance,
		variableIncomeBalance,
	};
}
export function dailyForecast(input: {
	accounts: ForecastAccount[];
	currency?: string;
	rate?: (currency: string, date: string) => number | null;
	from: string;
	movements: ForecastMovement[];
	/** Net earnings for this date, including taxes, tiers, effective settings and holidays. */
	netYield?: (account: ForecastAccount, balance: number, date: string, ledger?: YieldTaxLedger) => number;
	settleYield?: (account: ForecastAccount, amount: number, date: string, ledger: YieldTaxLedger) => void;
	primaryAccountId?: null | string;
	/** Planner mode: expenses debit only their stated account; no implicit asset sales. */
	strictAccounts?: boolean;
	through: string;
}) {
	const accounts = input.accounts.filter(account =>
		["CHECKING", "CASH", "SAVINGS", "INVESTMENT", "CASHBACK"].includes(account.type),
	);
	const currency = input.currency ?? accounts[0]?.currency ?? "BRL";
	const factor = (source: string, date: string) => {
		if (source === currency) return 1;
		const rate = input.rate?.(source, date);
		if (rate == null || !Number.isFinite(rate) || rate <= 0)
			throw new Error(`Unavailable forecast conversion: ${source}/${currency}`);
		return rate;
	};
	const nativeCurrency = (account?: ForecastAccount) => (account ? (account.currency ?? "BRL") : currency);
	for (const account of accounts) if (account.balance) factor(nativeCurrency(account), input.from);
	const balances = new Map(accounts.map(account => [account.id, account.balance]));
	const ledgers = new Map(
		accounts.map(account => {
			const ledger = new YieldTaxLedger(account.yieldLots ?? []);
			const previousDay = new Date(`${input.from}T12:00:00Z`);
			previousDay.setUTCDate(previousDay.getUTCDate() - 1);
			ledger.adjustBalance(account.balance, previousDay.toISOString().slice(0, 10));
			return [account.id, ledger] as const;
		}),
	);
	const days: ForecastDay[] = [];
	let deficit = 0;
	const cash = accounts.filter(account => ["CHECKING", "CASH"].includes(account.type));
	const primary =
		cash.find(account => account.id === input.primaryAccountId) ??
		cash.toSorted((a, b) => a.id.localeCompare(b.id))[0];
	const movements = Map.groupBy(input.movements, movement => movement.date.slice(0, 10));
	for (let date = input.from; date <= input.through; date = nextDay(date)) {
		let income = 0,
			expenses = 0,
			recurringIncome = 0,
			recurringExpenses = 0;
		const ordered = (movements.get(date) ?? []).toSorted(
			(a, b) => rank(a.type) - rank(b.type) || (a.id ?? "").localeCompare(b.id ?? ""),
		);
		for (const movement of ordered) {
			if (!Number.isFinite(movement.amount) || movement.amount < 0)
				throw new Error("Invalid forecast amount");
			if (!movement.amount && !movement.recurringAmount) continue;
			const destination =
				accounts.find(account => account.id === movement.destinationAccountId) ?? primary;
			const origin = accounts.find(account => account.id === movement.originAccountId) ?? primary;
			const sourceCurrency =
				movement.currency ?? nativeCurrency(movement.type === "INCOME" ? destination : origin);
			const sourceFactor = factor(sourceCurrency, date);
			const consolidatedAmount = movement.amount * sourceFactor;
			const consolidatedRecurring =
				(movement.recurringAmount ?? (movement.recurring ? movement.amount : 0)) * sourceFactor;
			if (movement.type === "TRANSFER") {
				const origin = accounts.find(account => account.id === movement.originAccountId);
				if (origin && destination && origin.id !== destination.id) {
					const requestedDebit = consolidatedAmount / factor(nativeCurrency(origin), date);
					const amount = input.strictAccounts
						? requestedDebit
						: Math.min(requestedDebit, Math.max(0, balances.get(origin.id) ?? 0));
					const requestedCredit =
						movement.destinationAmount ??
						consolidatedAmount / factor(nativeCurrency(destination), date);
					if (!Number.isFinite(requestedCredit) || requestedCredit < 0)
						throw new Error("Invalid forecast destination amount");
					const credit = requestedDebit > 0 ? (requestedCredit * amount) / requestedDebit : 0;
					balances.set(origin.id, (balances.get(origin.id) ?? 0) - amount);
					ledgers.get(origin.id)?.applyCashFlow(-amount, date);
					ledgers
						.get(destination.id)
						?.applyCashFlow(roundMoney(credit, nativeCurrency(destination)), date);
					balances.set(
						destination.id,
						(balances.get(destination.id) ?? 0) + roundMoney(credit, nativeCurrency(destination)),
					);
				}
				continue;
			}
			if (movement.type === "INCOME") {
				income += consolidatedAmount;
				recurringIncome += consolidatedRecurring;
				if (destination) {
					ledgers
						.get(destination.id)
						?.applyCashFlow(consolidatedAmount / factor(nativeCurrency(destination), date), date);
					balances.set(
						destination.id,
						(balances.get(destination.id) ?? 0) +
							consolidatedAmount / factor(nativeCurrency(destination), date),
					);
				} else deficit += consolidatedAmount;
				continue;
			}
			expenses += consolidatedAmount;
			recurringExpenses += consolidatedRecurring;
			const order = (input.strictAccounts ? (origin ? [origin] : []) : accounts).toSorted((a, b) => {
				if (a.id === origin?.id) return -1;
				if (b.id === origin?.id) return 1;
				const group = (account: ForecastAccount) =>
					account.type === "SAVINGS" ? 1 : account.type === "INVESTMENT" ? 2 : 0;
				return (
					group(a) - group(b) || yieldRate(a, date) - yieldRate(b, date) || a.id.localeCompare(b.id)
				);
			});
			let remaining = consolidatedAmount;
			for (const account of order) {
				if ((balances.get(account.id) ?? 0) <= 0) continue;
				const accountFactor = factor(nativeCurrency(account), date);
				const used = Math.min(remaining / accountFactor, Math.max(0, balances.get(account.id) ?? 0));
				balances.set(account.id, (balances.get(account.id) ?? 0) - used);
				ledgers.get(account.id)?.applyCashFlow(-used, date);
				remaining = Math.max(0, remaining - used * accountFactor);
				if (!remaining) break;
			}
			if (remaining) {
				const deficitAccount =
					origin && (input.strictAccounts || cash.some(account => account.id === origin.id))
						? origin
						: primary;
				if (deficitAccount) {
					ledgers
						.get(deficitAccount.id)
						?.applyCashFlow(-remaining / factor(nativeCurrency(deficitAccount), date), date);
					balances.set(
						deficitAccount.id,
						(balances.get(deficitAccount.id) ?? 0) -
							remaining / factor(nativeCurrency(deficitAccount), date),
					);
				} else deficit -= remaining;
			}
		}
		for (const account of accounts) {
			const balance = balances.get(account.id) ?? 0;
			if (balance <= 0) continue;
			const ledger = ledgers.get(account.id)!;
			const earnings = input.netYield?.(account, balance, date, ledger) ?? 0;
			if (input.settleYield) input.settleYield(account, earnings, date, ledger);
			else ledger.accrueRecordedNet(earnings, undefined, date);
			balances.set(account.id, balance + earnings);
			income += earnings * factor(nativeCurrency(account), date);
		}
		days.push({
			...forecastBreakdown(accounts, balances, deficit, {
				currency,
				rate: source => factor(source, date),
			}),
			balances: new Map(balances),
			date,
			expenses,
			income,
			recurringExpenses,
			recurringIncome,
		});
	}
	return days;
	function yieldRate(account: ForecastAccount, date: string) {
		const balance = Math.max(0, balances.get(account.id) ?? 0);
		return balance > 0
			? (input.netYield?.(account, balance, date, ledgers.get(account.id)) ?? 0) / balance
			: 0;
	}
}
function rank(type: ForecastMovement["type"]) {
	return type === "INCOME" ? 0 : type === "TRANSFER" ? 1 : 2;
}
function nextDay(date: string) {
	const next = new Date(`${date}T12:00:00Z`);
	next.setUTCDate(next.getUTCDate() + 1);
	return next.toISOString().slice(0, 10);
}
