import { legacyRecurrenceSchedule } from "@zaimu/finance/recurrence";
import type { DebtSplitInput, RecurringPayment, Salary, Subscription } from "./api";
import { debtSplitToInput } from "./debt-split";
import { localAccounts } from "./localStorage";
import type { Recurrence, RecurrenceInput } from "./recurrence";
import type { createRecurrenceService } from "./recurrence-service";

interface LegacyModels {
	salary: Salary;
	subscription: Subscription;
	recurring: RecurringPayment;
}
export function createLegacyRecurrenceService<S extends keyof LegacyModels>(
	source: S,
	core: () => ReturnType<typeof createRecurrenceService>,
) {
	const present = async (record: Recurrence): Promise<LegacyModels[S]> => {
		const account = record.creditCardId
			? (await localAccounts.getAll()).find(row => row.data.creditCard?.id === record.creditCardId)?.data
			: undefined;
		return {
			...record,
			autoGenerateFrom: record.startDate,
			billingDay: record.dayOfMonth ?? Number(record.startDate.slice(8, 10)),
			financialAccountId:
				account?.id ?? record.originFinancialAccountId ?? record.destinationFinancialAccountId,
			frequency:
				record.unit === "DAY"
					? "DAILY"
					: record.unit === "WEEK"
						? record.interval === 2
							? "BIWEEKLY"
							: "WEEKLY"
						: record.unit === "YEAR"
							? "YEARLY"
							: "MONTHLY",
			payDay: record.dayOfMonth ?? Number(record.startDate.slice(8, 10)),
			paymentMethod: record.movement === "CARD_PURCHASE" ? "CREDIT" : "TRANSFER",
			source: record.name,
		} as unknown as LegacyModels[S];
	};
	const save = async (
		data: Omit<Partial<LegacyModels[S]>, "debtSplit"> & { debtSplit?: DebtSplitInput | null },
		id?: string,
	) => {
		const previous = id
			? (await core().getAll()).find(
					record => record.id === id || (record.legacySource === source && record.legacyId === id),
				)
			: undefined;
		if (id && !previous) throw new Error("Recorrência não encontrada.");
		const old = previous ? await present(previous) : {};
		const merged = { ...old, ...data } as Record<string, unknown>;
		const accountId = merged.financialAccountId as string | undefined;
		const account = accountId ? (await localAccounts.getById(accountId))?.data : undefined;
		const isCard = source !== "salary" && merged.paymentMethod === "CREDIT";
		const input: RecurrenceInput = {
			...legacyRecurrenceSchedule(
				String(merged.frequency ?? "MONTHLY"),
				String(merged.startDate),
				(merged.dayOfMonth ?? merged.billingDay ?? merged.payDay) as number,
				merged.dayOfWeek as number,
			),
			amount: Number(merged.amount),
			creditCardId: isCard ? account?.creditCard?.id : null,
			debtSplit:
				data.debtSplit === undefined
					? previous?.debtSplit
						? debtSplitToInput(previous.debtSplit)
						: null
					: data.debtSplit,
			destinationFinancialAccountId: source === "salary" ? accountId : null,
			endDate: merged.endDate as string | null,
			isActive: (merged.isActive as boolean) ?? true,
			movement: source === "salary" ? "INCOME" : isCard ? "CARD_PURCHASE" : "EXPENSE",
			name: String(source === "salary" ? merged.source : merged.name),
			originFinancialAccountId: source === "salary" || isCard ? null : accountId,
			storeName: merged.storeName as string | null,
			tagIds: merged.tagIds as string[],
		};
		const saved = previous ? await core().update(previous.id, input) : await core().create(input);
		return present(saved);
	};
	return {
		create: (data: Omit<Partial<LegacyModels[S]>, "debtSplit"> & { debtSplit?: DebtSplitInput | null }) =>
			save(data),
		delete: (id: string, deleteTransactions = false) => core().delete(id, deleteTransactions),
		getAll: async (): Promise<LegacyModels[S][]> =>
			Promise.all(
				(await core().getAll())
					.filter(
						record =>
							record.legacySource === source ||
							(!record.legacySource &&
								(source === "salary"
									? record.movement === "INCOME"
									: source === "subscription"
										? record.movement === "CARD_PURCHASE"
										: record.movement === "EXPENSE")),
					)
					.map(present),
			),
		update: (
			id: string,
			data: Omit<Partial<LegacyModels[S]>, "debtSplit"> & { debtSplit?: DebtSplitInput | null },
		) => save(data, id),
	};
}
