import { comparisonDuration, comparisonIntervals } from "@zaimu/finance/comparison-periods";
import { creditBookRewards, replayCreditBook } from "@zaimu/finance/credit-book";
import {
	recurrenceAccountEffects,
	recurrenceDates,
	recurrenceNeedsConfiguration,
} from "@zaimu/finance/recurrence";
import { projectRecurrenceCreditBook } from "@zaimu/finance/recurrence-projection";
import { addDays, format, startOfDay } from "date-fns";
import type { DashboardPeriod, FinancialAccountYield, FinancialAccountYieldHoliday } from "./api";
import { dataService } from "./dataService";
import { calculateFinancialAccountBalances } from "./financial-account";
import {
	localAccounts,
	localCreditBooks,
	localLoanPayments,
	localMeta,
	localRecurrenceOccurrences,
	readLocalCreditBook,
} from "./localStorage";

export interface DashboardComparisonParameters {
	endDate: string;
	periodsAfter: number;
	periodsBefore: number;
	startDate: string;
}

export async function getGuestDashboardComparison(
	parameters: DashboardComparisonParameters,
): Promise<DashboardPeriod[]> {
	const [
		accountRows,
		transactions,
		recurrences,
		cards,
		bookRows,
		paymentRows,
		occurrenceRows,
		holidays,
		yields,
	] = await Promise.all([
		localAccounts.getAll(),
		dataService.transactions.getAll(),
		dataService.recurrences.getAll(),
		dataService.creditCards.getAll(),
		localCreditBooks.getAll(),
		localLoanPayments.getAll(),
		localRecurrenceOccurrences.getAll(),
		localMeta.get("financial-account-yield-holidays"),
		localMeta.get("financial-account-yields"),
	]);
	const key = (date: Date) => format(date, "yyyy-MM-dd");
	const start = new Date(`${parameters.startDate}T00:00:00`);
	const end = new Date(`${parameters.endDate}T00:00:00`);
	const periods = comparisonIntervals(start, { ...comparisonDuration(start, end), ...parameters });
	const through = periods.at(-1)!.end;
	const today = startOfDay(new Date());
	const projectionStart = addDays(today, 1);
	const occurrences = occurrenceRows.map(row => row.data);
	const linked = new Set([
		...occurrences.map(row => `${row.recurrenceId}:${row.date}`),
		...transactions
			.filter(row => row.recurrenceId)
			.map(row => `${row.recurrenceId}:${row.recurrenceOccurrenceDate ?? row.date.slice(0, 10)}`),
	]);
	const projected: Array<{ amount: number; date: Date; type: "INCOME" | "EXPENSE" }> = [];
	for (const recurrence of recurrences) {
		if (
			!recurrence.isActive ||
			recurrenceNeedsConfiguration(recurrence) ||
			recurrence.movement === "TRANSFER" ||
			recurrence.movement === "CARD_PURCHASE"
		)
			continue;
		for (const date of recurrenceDates(recurrence, key(projectionStart), key(through))) {
			if (!linked.has(`${recurrence.id}:${date}`))
				projected.push({
					amount: recurrence.amount,
					date: new Date(`${date}T12:00:00`),
					type: recurrence.movement === "INCOME" ? "INCOME" : "EXPENSE",
				});
		}
	}
	const statements = (
		await Promise.all(
			cards.map(
				async card =>
					replayCreditBook(
						projectRecurrenceCreditBook(
							await readLocalCreditBook(card.id),
							recurrences,
							key(projectionStart),
							key(through),
							occurrences,
						),
					).statements,
			),
		)
	).flat();
	for (const statement of statements) {
		const date = new Date(`${statement.dueDate.slice(0, 10)}T12:00:00`);
		if (date >= projectionStart && date <= through && statement.balanceAmount > 0)
			projected.push({ amount: statement.balanceAmount, date, type: "EXPENSE" });
	}
	for (const { data: payment } of paymentRows) {
		const date = new Date(`${payment.dueDate.slice(0, 10)}T12:00:00`);
		if (!payment.paidDate && date >= projectionStart && date <= through)
			projected.push({ amount: payment.totalPaid, date, type: "EXPENSE" });
	}
	const accounts = accountRows.filter(row => !row.data.isHidden).map(row => row.data);
	const balanceAt = (date: Date) => {
		const balances = calculateFinancialAccountBalances(
			accounts,
			transactions,
			bookRows.flatMap(row => creditBookRewards(row.data)),
			(holidays as FinancialAccountYieldHoliday[] | null)?.map(row => row.date) ?? [],
			date,
			(yields as FinancialAccountYield[] | null) ?? [],
		);
		const effects = recurrenceAccountEffects(recurrences, key(projectionStart), key(date), linked);
		const savingsBalance = balances
			.filter(account => account.type === "SAVINGS")
			.reduce((sum, account) => sum + (account.balance ?? 0) + (effects.get(account.id) ?? 0), 0);
		const concrete = balances
			.filter(account => !["CREDIT_CARD", "INVESTMENT", "REWARDS"].includes(account.type))
			.reduce((sum, account) => sum + (account.balance ?? 0), 0);
		const total =
			concrete +
			projected
				.filter(item => item.date <= date)
				.reduce((sum, item) => sum + (item.type === "INCOME" ? item.amount : -item.amount), 0);
		return { accountBalance: total - savingsBalance, endingBalance: total, savingsBalance };
	};
	const movements = [
		...transactions.map(item => ({ ...item, date: new Date(`${item.date.slice(0, 10)}T12:00:00`) })),
		...projected,
	];
	return periods.map(({ start, end }) => {
		const rows = movements.filter(item => item.date >= start && item.date <= end);
		const income = rows.filter(item => item.type === "INCOME").reduce((sum, item) => sum + item.amount, 0);
		const expenses = rows.filter(item => item.type === "EXPENSE").reduce((sum, item) => sum + item.amount, 0);
		return {
			...balanceAt(end),
			endDate: key(end),
			expenses,
			income,
			initialBalance: balanceAt(addDays(start, -1)).endingBalance,
			net: income - expenses,
			startDate: key(start),
		};
	});
}
