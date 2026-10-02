import { materializeBookInstallments, newBookPurchase } from "@zaimu/finance/credit-book";
import {
	getNextRecurrenceDate,
	recurrenceDates,
	recurrenceNeedsConfiguration,
	shiftRecurrenceDate,
	validateRecurrenceSchedule,
} from "@zaimu/finance/recurrence";
import type { DebtSplitInput, Transaction } from "./api";
import { getLocalDateKey } from "./date";
import { debtSplitToInput } from "./debt-split";
import { type LocalPageOptions, localCursorPage } from "./local-cursor-page";
import {
	commitLocalRecurrenceChanges,
	deleteLocalRecurrence,
	localAccounts,
	localCategories,
	localCreditBooks,
	localCreditCards,
	localMeta,
	localRecurrenceOccurrences,
	localRecurrences,
	readLocalCreditBook,
	type StorageOwner,
} from "./localStorage";
import { getCurrentCacheIdentity } from "./query-cache";
import type {
	Recurrence,
	RecurrenceHistoryItem,
	RecurrenceHistoryPage,
	RecurrenceInput,
	RecurrenceOccurrence,
} from "./recurrence";

export async function materializeLocalRecurrences(
	owner: StorageOwner,
	today = getLocalDateKey(),
	replay?: { id: string; from: string; through: string },
	advance?: { id: string; time?: string },
) {
	if (advance?.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(advance.time))
		throw new Error("Informe um horário válido.");
	if (advance && !(await localRecurrences.getById(advance.id, owner)))
		throw new Error("Recorrência não encontrada.");
	let created = 0;
	for (const record of await localRecurrences.getAll(owner)) {
		const recurrence = record.data;
		if (advance && recurrence.id !== advance.id) continue;
		if (advance && (!recurrence.isActive || recurrenceNeedsConfiguration(recurrence)))
			throw new Error("Ative e configure a recorrência antes de adiantar.");
		if (
			(replay && recurrence.id !== replay.id) ||
			(!replay && !recurrence.isActive) ||
			recurrenceNeedsConfiguration(recurrence)
		)
			continue;
		if (replay && replay.through > today) throw new Error("Ocorrências futuras são somente previsões.");
		const nextDate = advance ? getNextRecurrenceDate(recurrence, today) : null;
		if (advance && !nextDate) throw new Error("Nenhuma ocorrência futura disponível.");
		const dates = nextDate
			? [nextDate]
			: recurrenceDates(
					recurrence,
					replay?.from ?? shiftRecurrenceDate(recurrence.materializedThrough, 1),
					replay?.through ?? today,
				);
		const processed = new Set(
			(await localRecurrenceOccurrences.getAll(owner))
				.filter(row => row.data.recurrenceId === recurrence.id)
				.map(row => row.data.date),
		);
		if (advance && processed.has(nextDate!)) throw new Error("A próxima ocorrência já foi adiantada.");
		const pending = dates.filter(date => !processed.has(date));
		if (!pending.length && (replay || recurrence.materializedThrough >= today)) continue;
		const occurrences: RecurrenceOccurrence[] = [];
		const transactions: Transaction[] = [];
		const card = recurrence.creditCardId
			? (await localCreditCards.getById(recurrence.creditCardId, owner))?.data
			: undefined;
		if (recurrence.creditCardId && !card) throw new Error("Cartão da recorrência não encontrado.");
		const book =
			recurrence.movement === "CARD_PURCHASE"
				? structuredClone(await readLocalCreditBook(recurrence.creditCardId!, owner))
				: undefined;
		const expectedBook = book ? await localCreditBooks.getById(book.card.id, owner) : undefined;
		for (const date of pending) {
			const occurrence: RecurrenceOccurrence = {
				date,
				id: `${recurrence.id}:${date}`,
				recurrenceId: recurrence.id,
			};
			if (book) {
				const purchase = newBookPurchase(book, {
					cashbackAccountId: card?.cashbackAccountId ?? null,
					cashbackAmount:
						card?.cashbackAccountId && card.cashbackRate
							? Number(((recurrence.amount * card.cashbackRate) / 100).toFixed(4))
							: null,
					cashbackYieldPeriod: card?.cashbackYieldPeriod ?? null,
					cashbackYieldReferencePercentage: card?.cashbackYieldReferencePercentage ?? null,
					cashbackYieldReferenceRate: card?.cashbackYieldReferenceRate ?? null,
					debtSplitRule: recurrence.debtSplit ? debtSplitToInput(recurrence.debtSplit) : null,
					description: recurrence.name,
					installments: 1,
					purchaseDate: advance ? today : date,
					recurrenceId: recurrence.id,
					recurrenceOccurrenceDate: date,
					storeName: recurrence.storeName ?? null,
					tagIds: recurrence.tagIds ?? [],
					time: advance?.time ?? null,
					totalAmount: recurrence.amount,
				});
				occurrence.purchaseId = purchase.id;
			} else {
				const id = crypto.randomUUID();
				transactions.push({
					amount: recurrence.amount,
					createdAt: new Date().toISOString(),
					date: advance ? today : date,
					debtSplit:
						recurrence.movement === "TRANSFER" || recurrence.movement === "CARD_PAYMENT"
							? undefined
							: structuredClone(recurrence.debtSplit ?? undefined),
					description: recurrence.name,
					destinationFinancialAccountId: recurrence.destinationFinancialAccountId ?? undefined,
					id,
					originFinancialAccountId: recurrence.originFinancialAccountId ?? undefined,
					paymentCreditCardId:
						recurrence.movement === "CARD_PAYMENT" ? (recurrence.creditCardId ?? undefined) : undefined,
					recurrenceId: recurrence.id,
					recurrenceOccurrenceDate: date,
					storeName: recurrence.storeName ?? undefined,
					tagIds: recurrence.tagIds,
					time: advance?.time ?? null,
					type:
						recurrence.movement === "CARD_PAYMENT"
							? "EXPENSE"
							: (recurrence.movement as "INCOME" | "EXPENSE" | "TRANSFER"),
				});
				occurrence.transactionId = id;
			}
			occurrences.push(occurrence);
		}
		if (book) materializeBookInstallments(book, today);
		await commitLocalRecurrenceChanges(
			owner,
			record,
			replay || advance ? recurrence : { ...recurrence, materializedThrough: today },
			occurrences,
			transactions,
			book,
			expectedBook,
		);
		created += occurrences.length;
	}
	return created;
}
interface Dependencies {
	isGuestMode: () => boolean;
	getUserId: () => string;
	fetchWithAuth: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
	hydrateLocalDebtSplit: (amount: number, split: DebtSplitInput) => Promise<Recurrence["debtSplit"]>;
}
export function createRecurrenceService(deps: Dependencies) {
	const saveLocal = async (input: RecurrenceInput | Partial<RecurrenceInput>, id?: string) => {
		const owner = getCurrentCacheIdentity()!;
		const existing = id ? (await localRecurrences.getById(id, owner))?.data : undefined;
		if (id && !existing) throw new Error("Recorrência não encontrada.");
		const merged = { ...existing, ...input } as RecurrenceInput;
		validateRecurrenceSchedule(merged);
		if (
			!merged.name.trim() ||
			!Number.isFinite(merged.amount) ||
			merged.amount <= 0 ||
			Math.abs(Math.round(merged.amount * 100) / 100 - merged.amount) > 1e-8
		)
			throw new Error("Informe descrição e valor positivo em centavos.");
		if (
			recurrenceNeedsConfiguration(merged) &&
			!(existing && Object.keys(input).every(key => key === "isActive"))
		)
			throw new Error("Selecione contas ou cartão compatíveis.");
		const accounts = (await localAccounts.getAll(owner)).map(row => row.data);
		for (const accountId of [merged.originFinancialAccountId, merged.destinationFinancialAccountId])
			if (
				accountId &&
				!accounts.some(
					account => account.id === accountId && ["CHECKING", "SAVINGS", "CASH"].includes(account.type),
				)
			)
				throw new Error("Conta incompatível com recorrência.");
		if (merged.creditCardId && !(await localCreditCards.getById(merged.creditCardId, owner)))
			throw new Error("Cartão não encontrado.");
		if (
			(merged.movement === "INCOME" && (merged.originFinancialAccountId || merged.creditCardId)) ||
			(merged.movement === "EXPENSE" && (merged.destinationFinancialAccountId || merged.creditCardId)) ||
			(merged.movement === "TRANSFER" && merged.creditCardId) ||
			(merged.movement === "CARD_PURCHASE" &&
				(merged.originFinancialAccountId || merged.destinationFinancialAccountId)) ||
			(merged.movement === "CARD_PAYMENT" && merged.destinationFinancialAccountId)
		)
			throw new Error("Contas incompatíveis com movimentação.");
		const hasDebt = merged.movement !== "TRANSFER" && merged.movement !== "CARD_PAYMENT";
		if (!hasDebt && input.debtSplit) throw new Error("Esta movimentação não aceita vínculo de dívida.");
		const splitInput =
			input.debtSplit === undefined
				? existing?.debtSplit
					? debtSplitToInput(existing.debtSplit)
					: null
				: input.debtSplit;
		const tags = (await localCategories.getAll(owner))
			.map(row => row.data)
			.filter(tag => merged.tagIds?.includes(tag.id));
		if (tags.length !== new Set(merged.tagIds ?? []).size)
			throw new Error("Uma ou mais tags não estão disponíveis.");
		const now = new Date().toISOString();
		const recurrence: Recurrence = {
			...merged,
			createdAt: existing?.createdAt ?? now,
			debtSplit: hasDebt && splitInput ? await deps.hydrateLocalDebtSplit(merged.amount, splitInput) : null,
			id: id ?? crypto.randomUUID(),
			materializedThrough:
				existing && existing.materializedThrough > shiftRecurrenceDate(getLocalDateKey(), -1)
					? existing.materializedThrough
					: shiftRecurrenceDate(getLocalDateKey(), -1),
			needsConfiguration: recurrenceNeedsConfiguration(merged),
			tags,
			updatedAt: now,
			userId: deps.getUserId(),
		};
		await localRecurrences.put(recurrence, recurrence.id, owner);
		if (existing) {
			const history = (await localMeta.get(`recurrence-history:${id}`, owner)) as unknown[] | null;
			await localMeta.set(
				`recurrence-history:${id}`,
				[
					...(history ?? []),
					{
						changedAt: now,
						id: crypto.randomUUID(),
						newValue: recurrence,
						oldValue: existing,
						recurrenceId: id,
					},
				],
				owner,
			);
		}
		return recurrence;
	};
	return {
		async advance(id: string, time?: string): Promise<{ created: number }> {
			if (!deps.isGuestMode())
				return deps.fetchWithAuth(`/recurring/${id}/advance`, {
					body: JSON.stringify({ time }),
					method: "POST",
				});
			const owner = getCurrentCacheIdentity()!;
			return {
				created: await materializeLocalRecurrences(owner, getLocalDateKey(), undefined, { id, time }),
			};
		},
		async create(input: RecurrenceInput): Promise<Recurrence> {
			if (deps.isGuestMode()) return saveLocal(input);
			const record = await deps.fetchWithAuth<Recurrence>("/recurring", {
				body: JSON.stringify(input),
				method: "POST",
			});
			await localRecurrences.put(record, record.id);
			return record;
		},
		async delete(id: string, deleteTransactions = false) {
			if (!deps.isGuestMode())
				await deps.fetchWithAuth(`/recurring/${id}?deleteTransactions=${deleteTransactions}`, {
					method: "DELETE",
				});
			await deleteLocalRecurrence(getCurrentCacheIdentity()!, id, deleteTransactions);
		},
		async get(id: string): Promise<Recurrence> {
			const owner = getCurrentCacheIdentity()!;
			if (deps.isGuestMode()) {
				const record = await localRecurrences.getById(id, owner);
				if (!record) throw new Error("Recorrência não encontrada.");
				return record.data;
			}
			const record = await deps.fetchWithAuth<Recurrence>(`/recurring/${id}`);
			await localRecurrences.put(record, id, owner);
			return record;
		},
		async getAll(): Promise<Recurrence[]> {
			if (deps.isGuestMode())
				return (await localRecurrences.getAll()).map(({ data: { debtSplit: _, ...summary } }) => summary);
			const records = await deps.fetchWithAuth<Recurrence[]>("/recurring");
			const existing = new Map((await localRecurrences.getAll()).map(row => [row.data.id, row.data]));
			await localRecurrences.replaceSnapshot(
				records.map(data => ({
					data: { ...existing.get(data.id), ...data },
					localId: data.id,
					syncedAt: Date.now(),
				})),
			);
			return records;
		},
		async getHistory(id: string, options: LocalPageOptions = {}): Promise<RecurrenceHistoryPage> {
			if (!deps.isGuestMode()) {
				const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
				if (options.cursor) params.set("cursor", options.cursor);
				return deps.fetchWithAuth(`/recurring/${id}/history?${params}`);
			}
			const owner = getCurrentCacheIdentity()!;
			if (!(await localRecurrences.getById(id, owner))) throw new Error("Recorrência não encontrada.");
			const stored =
				((await localMeta.get(`recurrence-history:${id}`, owner)) as Record<string, unknown>[]) ?? [];
			const rows: RecurrenceHistoryItem[] = stored.map(row => ({
				changedAt: String(row.changedAt),
				field: typeof row.field === "string" ? row.field : "record",
				id: String(row.id),
				newValue:
					row.newValue == null
						? null
						: typeof row.newValue === "string"
							? row.newValue
							: JSON.stringify(row.newValue),
				oldValue:
					row.oldValue == null
						? null
						: typeof row.oldValue === "string"
							? row.oldValue
							: JSON.stringify(row.oldValue),
				recurrenceId: id,
			}));
			return localCursorPage(
				rows,
				deps.getUserId(),
				{ domain: "recurrence-history", id },
				row => [row.changedAt, row.id],
				options,
			);
		},
		async replay(id: string, from: string, through: string): Promise<{ created: number }> {
			if (!deps.isGuestMode())
				return deps.fetchWithAuth(`/recurring/${id}/replay`, {
					body: JSON.stringify({ from, through }),
					method: "POST",
				});
			return {
				created: await materializeLocalRecurrences(getCurrentCacheIdentity()!, getLocalDateKey(), {
					from,
					id,
					through,
				}),
			};
		},
		async update(id: string, input: Partial<RecurrenceInput>): Promise<Recurrence> {
			if (deps.isGuestMode()) return saveLocal(input, id);
			const record = await deps.fetchWithAuth<Recurrence>(`/recurring/${id}`, {
				body: JSON.stringify(input),
				method: "PATCH",
			});
			await localRecurrences.put(record, id);
			return record;
		},
	};
}
