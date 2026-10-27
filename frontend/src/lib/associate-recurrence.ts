import { resolveBookInstallment } from "@zaimu/finance/credit-book";
import { recurrencePeriodStart, validateRecurrenceAssociation } from "@zaimu/finance/recurrence";
import type { PostRecurringByIdAssociateMutationRequest } from "./api";
import {
	commitLocalRecurrenceChanges,
	localCreditBooks,
	localRecurrenceOccurrences,
	localRecurrences,
	localTransactions,
	readLocalCreditBook,
	type StorageOwner,
} from "./localStorage";

export async function associateLocalRecurrence(
	owner: StorageOwner,
	id: string,
	input: PostRecurringByIdAssociateMutationRequest,
) {
	const record = await localRecurrences.getById(id, owner);
	if (!record) throw new Error("Recorrência não encontrada.");
	const purchase = input.kind === "PURCHASE";
	const cardId = record.data.creditCardId;
	const expectedBook = purchase && cardId ? await localCreditBooks.getById(cardId, owner) : undefined;
	const book = purchase && cardId ? structuredClone(await readLocalCreditBook(cardId, owner)) : undefined;
	const transaction = purchase ? undefined : await localTransactions.getById(input.recordId, owner);
	const target = purchase
		? book?.purchases.find(
				item =>
					item.id === input.recordId ||
					item.id === resolveBookInstallment(book, input.recordId)?.purchaseId,
			)
		: transaction?.data;
	if (!target) throw new Error("Lançamento não encontrado.");
	validateRecurrenceAssociation(
		record.data,
		{ ...target, creditCardId: purchase ? cardId : undefined, kind: input.kind },
		input.date,
	);
	const occurrenceId = `${id}:${input.date}`;
	const existing = (await localRecurrenceOccurrences.getAll(owner)).find(
		row =>
			row.data.recurrenceId === id &&
			recurrencePeriodStart(record.data.unit, row.data.date) ===
				recurrencePeriodStart(record.data.unit, input.date),
	);
	if (existing) {
		if (
			!existing.data.deletedAt &&
			(purchase ? existing.data.purchaseId : existing.data.transactionId) === target.id
		)
			return;
		throw new Error("Este período já foi processado. Escolha outro período.");
	}
	const linked = { ...target, recurrenceId: id, recurrenceOccurrenceDate: input.date };
	if (book) Object.assign(target, linked);
	await commitLocalRecurrenceChanges(
		owner,
		record,
		record.data,
		[
			{
				date: input.date,
				id: occurrenceId,
				recurrenceId: id,
				...(purchase ? { purchaseId: target.id } : { transactionId: target.id }),
			},
		],
		transaction ? [{ ...transaction.data, recurrenceId: id, recurrenceOccurrenceDate: input.date }] : [],
		book,
		expectedBook,
		transaction ? [transaction] : [],
	);
}
