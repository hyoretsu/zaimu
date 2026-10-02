import { recurrenceDates } from "@zaimu/finance/recurrence";
import type { FinancialAccount } from "@/lib/api";
import { getFinancialAccountDisplayName } from "@/lib/financial-account";
import type { Recurrence } from "@/lib/recurrence";
import type { RecurringListItemData } from "./types";

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
	const destination = accounts.find(account => account.id === recurrence.destinationFinancialAccountId);
	return {
		accountName: account ? getFinancialAccountDisplayName(account) : undefined,
		accountType: account?.type,
		active: recurrence.isActive,
		amount: recurrence.amount,
		dayOfMonth: recurrence.dayOfMonth ?? null,
		dayOfWeek: recurrence.dayOfWeek,
		debtSplit: recurrence.debtSplit,
		destinationAccountType: destination?.type,
		destinationName: destination ? getFinancialAccountDisplayName(destination) : undefined,
		direction,
		endDate: recurrence.endDate,
		financialAccountId: account?.id,
		id: recurrence.id,
		interval: recurrence.interval,
		monthlyAmount: recurrenceDates(recurrence, monthStart, monthEnd).length * recurrence.amount,
		movement: recurrence.movement,
		recurrence,
		startDate: recurrence.startDate,
		storeName: recurrence.storeName,
		tags: recurrence.tags,
		title: recurrence.name,
		unit: recurrence.unit,
	};
}
