/** Forecasts are disposable copies: reserve withdrawals never create persisted transactions. */
export interface ForecastAccount {
	balance: number;
	id: string;
	type: string;
}
export interface ForecastMovement {
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
export function forecastBreakdown(accounts: ForecastAccount[], balances: Map<string, number>, deficit = 0) {
	const sum = (types: string[]) =>
		accounts
			.filter(account => types.includes(account.type))
			.reduce((total, account) => total + (balances.get(account.id) ?? 0), 0);
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
	from: string;
	movements: ForecastMovement[];
	/** Net earnings for this date, including taxes, tiers, effective settings and holidays. */
	netYield?: (account: ForecastAccount, balance: number, date: string) => number;
	primaryAccountId?: null | string;
	through: string;
}) {
	const accounts = input.accounts.filter(account =>
		["CHECKING", "CASH", "SAVINGS", "INVESTMENT", "CASHBACK"].includes(account.type),
	);
	const balances = new Map(accounts.map(account => [account.id, account.balance]));
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
			const destination =
				accounts.find(account => account.id === movement.destinationAccountId) ?? primary;
			if (movement.type === "TRANSFER") {
				const origin = accounts.find(account => account.id === movement.originAccountId);
				if (origin && destination && origin.id !== destination.id) {
					const amount = Math.min(movement.amount, Math.max(0, balances.get(origin.id) ?? 0));
					balances.set(origin.id, (balances.get(origin.id) ?? 0) - amount);
					balances.set(destination.id, (balances.get(destination.id) ?? 0) + amount);
				}
				continue;
			}
			if (movement.type === "INCOME") {
				income += movement.amount;
				recurringIncome += movement.recurringAmount ?? (movement.recurring ? movement.amount : 0);
				if (destination)
					balances.set(destination.id, (balances.get(destination.id) ?? 0) + movement.amount);
				else deficit += movement.amount;
				continue;
			}
			expenses += movement.amount;
			recurringExpenses += movement.recurringAmount ?? (movement.recurring ? movement.amount : 0);
			const origin = accounts.find(account => account.id === movement.originAccountId) ?? primary;
			const order = accounts.toSorted((a, b) => {
				if (a.id === origin?.id) return -1;
				if (b.id === origin?.id) return 1;
				const group = (account: ForecastAccount) =>
					account.type === "SAVINGS" ? 1 : account.type === "INVESTMENT" ? 2 : 0;
				return (
					group(a) - group(b) || yieldRate(a, date) - yieldRate(b, date) || a.id.localeCompare(b.id)
				);
			});
			let remaining = movement.amount;
			for (const account of order) {
				const used = Math.min(remaining, Math.max(0, balances.get(account.id) ?? 0));
				balances.set(account.id, (balances.get(account.id) ?? 0) - used);
				remaining -= used;
				if (!remaining) break;
			}
			if (remaining) {
				const deficitAccount =
					origin && cash.some(account => account.id === origin.id) ? origin : primary;
				if (deficitAccount)
					balances.set(deficitAccount.id, (balances.get(deficitAccount.id) ?? 0) - remaining);
				else deficit -= remaining;
			}
		}
		for (const account of accounts) {
			const balance = balances.get(account.id) ?? 0;
			if (balance <= 0) continue;
			const earnings = input.netYield?.(account, balance, date) ?? 0;
			balances.set(account.id, balance + earnings);
			income += earnings;
		}
		days.push({
			...forecastBreakdown(accounts, balances, deficit),
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
		return balance > 0 ? (input.netYield?.(account, balance, date) ?? 0) / balance : 0;
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
