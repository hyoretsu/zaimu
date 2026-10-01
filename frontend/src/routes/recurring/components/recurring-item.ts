import { recurrenceDates } from "@zaimu/finance/recurrence";
import type { FinancialAccount, RecurringPayment, Salary, Subscription } from "@/lib/api";
import { getFinancialAccountDisplayName } from "@/lib/financial-account";
import type { Recurrence } from "@/lib/recurrence";
import type { RecurrenceFrequency, RecurringListItemData } from "./types";

export function toMonthlyAmount(amount: number, frequency: RecurrenceFrequency) {
	switch (frequency) {
		case "DAILY":
			return (amount * 365.25) / 12;
		case "WEEKLY":
			return (amount * 52) / 12;
		case "BIWEEKLY":
			return (amount * 26) / 12;
		case "YEARLY":
			return amount / 12;
		default:
			return amount;
	}
}

export function salaryToListItem(salary: Salary, accounts: FinancialAccount[] = []): RecurringListItemData {
	const account = accounts.find(item => item.id === salary.financialAccountId);
	return {
		accountName: account ? getFinancialAccountDisplayName(account) : undefined,
		accountType: account?.type,
		active: salary.isActive,
		amount: Number(salary.amount),
		day: salary.payDay,
		dayOfWeek: salary.dayOfWeek,
		direction: "INCOME",
		endDate: salary.endDate,
		financialAccountId: salary.financialAccountId ?? undefined,
		frequency: salary.frequency,
		id: salary.id,
		monthlyAmount: toMonthlyAmount(Number(salary.amount), salary.frequency),
		source: "salary",
		startDate: salary.startDate,
		tags: salary.tags,
		title: salary.source,
	};
}

export function subscriptionToListItem(
	subscription: Subscription,
	accounts: FinancialAccount[] = [],
): RecurringListItemData {
	const account = accounts.find(item => item.id === subscription.financialAccountId);
	return {
		accountName: account ? getFinancialAccountDisplayName(account) : undefined,
		accountType: account?.type,
		active: subscription.isActive,
		amount: Number(subscription.amount),
		day: subscription.billingDay,
		dayOfWeek: subscription.dayOfWeek,
		debtSplit: subscription.debtSplit,
		direction: "EXPENSE",
		endDate: subscription.endDate,
		financialAccountId: subscription.financialAccountId ?? undefined,
		frequency: subscription.frequency,
		id: subscription.id,
		monthlyAmount: toMonthlyAmount(Number(subscription.amount), subscription.frequency),
		paymentMethod: subscription.paymentMethod,
		source: "subscription",
		startDate: subscription.startDate,
		storeName: subscription.storeName,
		tags: subscription.tags,
		title: subscription.name,
	};
}

export function recurringPaymentToListItem(
	payment: RecurringPayment,
	accounts: FinancialAccount[] = [],
): RecurringListItemData {
	const account = accounts.find(item => item.id === payment.financialAccountId);
	return {
		accountName: account ? getFinancialAccountDisplayName(account) : undefined,
		accountType: account?.type,
		active: payment.isActive,
		amount: Number(payment.amount),
		day: payment.dayOfMonth ?? payment.day ?? null,
		dayOfWeek: payment.dayOfWeek,
		debtSplit: payment.debtSplit,
		direction: "EXPENSE",
		endDate: payment.endDate,
		financialAccountId: payment.financialAccountId ?? undefined,
		frequency: payment.frequency,
		id: payment.id,
		monthlyAmount: toMonthlyAmount(Number(payment.amount), payment.frequency),
		paymentMethod: payment.paymentMethod,
		source: "recurring",
		startDate: payment.startDate,
		storeName: payment.storeName,
		tags: payment.tags,
		title: payment.name,
	};
}

export function recurrenceToListItem(
	recurrence: Recurrence,
	accounts: FinancialAccount[],
	monthStart: string,
	monthEnd: string,
): RecurringListItemData {
	const account = accounts.find(
		account =>
			account.id === (recurrence.originFinancialAccountId ?? recurrence.destinationFinancialAccountId) ||
			account.creditCard?.id === recurrence.creditCardId,
	);
	const direction =
		recurrence.movement === "INCOME" ? "INCOME" : recurrence.movement === "TRANSFER" ? "TRANSFER" : "EXPENSE";
	const frequency =
		recurrence.unit === "DAY"
			? "DAILY"
			: recurrence.unit === "WEEK"
				? "WEEKLY"
				: recurrence.unit === "YEAR"
					? "YEARLY"
					: "MONTHLY";
	const destination = accounts.find(account => account.id === recurrence.destinationFinancialAccountId);
	return {
		accountName: account ? getFinancialAccountDisplayName(account) : undefined,
		accountType: account?.type,
		active: recurrence.isActive,
		amount: recurrence.amount,
		day: recurrence.dayOfMonth ?? null,
		dayOfWeek: recurrence.dayOfWeek,
		debtSplit: recurrence.debtSplit,
		destinationAccountType: destination?.type,
		destinationName: destination ? getFinancialAccountDisplayName(destination) : undefined,
		direction,
		endDate: recurrence.endDate,
		financialAccountId: account?.id,
		frequency,
		id: recurrence.id,
		monthlyAmount: recurrenceDates(recurrence, monthStart, monthEnd).length * recurrence.amount,
		recurrence,
		source: "recurring",
		startDate: recurrence.startDate,
		storeName: recurrence.storeName,
		tags: recurrence.tags,
		title: recurrence.name,
	};
}
