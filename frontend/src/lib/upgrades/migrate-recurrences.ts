import type { CreditBook } from "@zaimu/finance/credit-book";
import {
	legacyRecurrenceSchedule,
	recurrenceDateKey,
	recurrenceNeedsConfiguration,
	shiftRecurrenceDate,
} from "@zaimu/finance/recurrence";
import type { CreditCard, Transaction as CurrentTransaction } from "../api";
import type { RecurringPayment, Salary, Subscription } from "./legacy-contracts";

type Transaction = CurrentTransaction & {
	salaryId?: string;
	salaryOccurrenceDate?: string;
	subscriptionId?: string;
	subscriptionOccurrenceDate?: string;
};

import { getLocalDateKey } from "../date";
import type { LocalData } from "../localStorage";
import type { Recurrence, RecurrenceOccurrence } from "../recurrence";

type Snapshot = Record<string, LocalData<unknown>[]>;
const key = (owner: string, source: string, id: string) => `${owner}\u0000${source}\u0000${id}`;
export function migrateLocalRecurrenceRows(snapshot: Snapshot, today = getLocalDateKey()): Snapshot {
	const changes: Snapshot = { creditBooks: [], recurrenceOccurrences: [], recurrences: [], transactions: [] };
	const current = snapshot.recurrences as LocalData<
		Recurrence & { legacySource?: string; legacyId?: string }
	>[];
	const mapped = new Map(
		current
			.filter(row => row.data.legacySource && row.data.legacyId)
			.map(row => [key(row.ownerKey, row.data.legacySource!, row.data.legacyId!), row.data.id]),
	);
	const occupied = new Set(current.map(row => `${row.ownerKey}\u0000${row.data.id}`));
	for (const [domain, source] of [
		["recurringPayments", "recurring"],
		["subscriptions", "subscription"],
		["salaries", "salary"],
	] as const) {
		for (const row of snapshot[domain] ?? []) {
			const old = row.data as (Salary | Subscription | RecurringPayment) & {
				materializedThrough?: string;
				netAmount?: number;
				createdAt?: string;
				updatedAt?: string;
			};
			if (mapped.has(key(row.ownerKey, source, old.id))) continue;
			const id = occupied.has(`${row.ownerKey}\u0000${old.id}`) ? crypto.randomUUID() : old.id;
			occupied.add(`${row.ownerKey}\u0000${id}`);
			mapped.set(key(row.ownerKey, source, old.id), id);
			const paymentMethod = "paymentMethod" in old ? old.paymentMethod : null;
			const accountId = old.financialAccountId;
			const card =
				paymentMethod === "CREDIT"
					? (snapshot.creditCards as LocalData<CreditCard>[]).find(
							card => card.ownerKey === row.ownerKey && card.data.financialAccountId === accountId,
						)?.data
					: undefined;
			const movement =
				source === "salary" ? "INCOME" : paymentMethod === "CREDIT" ? "CARD_PURCHASE" : "EXPENSE";
			const schedule = legacyRecurrenceSchedule(
				old.frequency,
				old.startDate,
				"payDay" in old ? old.payDay : "billingDay" in old ? old.billingDay : (old.dayOfMonth ?? old.day),
				old.dayOfWeek,
			);
			const data: Recurrence & { legacyId?: string; legacySource?: string } = {
				...schedule,
				amount: Number(old.amount ?? old.netAmount ?? 0),
				createdAt: old.createdAt ?? new Date(row.modifiedAt).toISOString(),
				creditCardId: card?.id ?? null,
				debtSplit: "debtSplit" in old ? old.debtSplit : null,
				destinationFinancialAccountId: movement === "INCOME" ? (accountId ?? null) : null,
				endDate: old.endDate,
				id,
				isActive: old.isActive,
				legacyId: old.id,
				legacySource: source,
				materializedThrough:
					source === "recurring"
						? shiftRecurrenceDate(today, -1)
						: old.materializedThrough
							? recurrenceDateKey(old.materializedThrough)
							: shiftRecurrenceDate(today, -1),
				movement,
				name: "source" in old ? old.source : old.name,
				originFinancialAccountId: movement === "EXPENSE" ? (accountId ?? null) : null,
				storeName: "storeName" in old ? old.storeName : null,
				tagIds: old.tagIds,
				tags: old.tags,
				updatedAt: old.updatedAt ?? new Date(row.modifiedAt).toISOString(),
				userId: old.userId,
			};
			data.needsConfiguration = recurrenceNeedsConfiguration(data);
			changes.recurrences.push({ ...row, data, localId: id, scopedId: `${row.ownerKey}\u0000${id}` });
		}
	}
	const occurrenceKeys = new Set((snapshot.recurrenceOccurrences ?? []).map(row => row.scopedId));
	const addOccurrence = (owner: string, occurrence: RecurrenceOccurrence, meta: LocalData<unknown>) => {
		const scopedId = `${owner}\u0000${occurrence.id}`;
		if (occurrenceKeys.has(scopedId)) return;
		occurrenceKeys.add(scopedId);
		changes.recurrenceOccurrences.push({
			...meta,
			data: occurrence,
			deleted: false,
			localId: occurrence.id,
			scopedId,
		});
	};
	for (const row of snapshot.transactions as LocalData<Transaction>[]) {
		const old = row.data;
		const source = old.salaryId ? "salary" : old.subscriptionId ? "subscription" : "recurring";
		const oldId = old.salaryId ?? old.subscriptionId ?? old.recurrenceId;
		if (!oldId) continue;
		const id =
			mapped.get(key(row.ownerKey, source, oldId)) ??
			(current.some(item => item.ownerKey === row.ownerKey && item.data.id === oldId) ? oldId : undefined);
		if (!id) continue; // Retain unresolved reference; sync validation blocks loss.
		const date =
			old.salaryOccurrenceDate ?? old.subscriptionOccurrenceDate ?? old.recurrenceOccurrenceDate ?? old.date;
		const data = {
			...old,
			recurrenceId: id,
			recurrenceOccurrenceDate: date,
			salaryId: undefined,
			salaryOccurrenceDate: undefined,
			subscriptionId: undefined,
			subscriptionOccurrenceDate: undefined,
		};
		if (JSON.stringify(data) !== JSON.stringify(old)) changes.transactions.push({ ...row, data });
		addOccurrence(
			row.ownerKey,
			{
				date,
				id: `${id}:${date}`,
				recurrenceId: id,
				transactionId: old.id,
				...(row.deleted && { deletedAt: today }),
			},
			row,
		);
	}
	for (const row of snapshot.creditBooks as LocalData<CreditBook>[]) {
		const book = structuredClone(row.data);
		let changed = false;
		for (const purchase of book.purchases) {
			const oldPurchase = purchase as typeof purchase & {
				subscriptionId?: string;
				subscriptionOccurrenceDate?: string;
			};
			const sourceId = oldPurchase.subscriptionId ?? purchase.recurrenceId;
			if (!sourceId) continue;
			const id =
				mapped.get(key(row.ownerKey, "subscription", sourceId)) ??
				(current.some(item => item.ownerKey === row.ownerKey && item.data.id === sourceId)
					? sourceId
					: undefined);
			if (!id) continue;
			if (purchase.recurrenceId !== id || oldPurchase.subscriptionId) {
				purchase.recurrenceId = id;
				purchase.recurrenceOccurrenceDate =
					oldPurchase.subscriptionOccurrenceDate ??
					purchase.recurrenceOccurrenceDate ??
					purchase.purchaseDate;
				delete oldPurchase.subscriptionId;
				delete oldPurchase.subscriptionOccurrenceDate;
				changed = true;
			}
			const date = purchase.recurrenceOccurrenceDate ?? purchase.purchaseDate;
			addOccurrence(
				row.ownerKey,
				{ date, id: `${id}:${date}`, purchaseId: purchase.id, recurrenceId: id },
				row,
			);
		}
		if (changed) changes.creditBooks.push({ ...row, data: book });
	}
	return changes;
}
