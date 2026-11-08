import { getTagsByEntity, replaceEntityTags } from "~/modules/categories/application/tag-assignments";
import { getDebtSplitInput, replaceDebtSplit } from "~/modules/debts/application/debt-splits";
import { queryRaw } from "~/shared/infra/sql";
import { getStoredRecurrence } from "./recurrences";

const sources = {
	PURCHASE: { amount: "totalAmount", entityType: "CREDIT_CARD_IMPORT_ITEM", table: "CreditCardImportItem" },
	TRANSACTION: { amount: "amount", entityType: "TRANSACTION_IMPORT_ITEM", table: "TransactionImportItem" },
} as const;

/** Gives a pending import item the data a generated occurrence would carry: name, store, tags and debt split. */
export async function applyRecurrenceToImportItem(
	userId: string,
	recurrenceId: string,
	kind: keyof typeof sources,
	itemId: string,
) {
	const recurrence = await getStoredRecurrence(userId, recurrenceId);
	const source = sources[kind];
	const [item] = await queryRaw<{ amount: number | string }>(
		`SELECT "${source.amount}" AS "amount" FROM "${source.table}" WHERE "id"=$1`,
		[itemId],
	);
	const applied = { description: recurrence.name, storeName: recurrence.storeName ?? null };
	if (!item) return applied;
	await queryRaw(`UPDATE "${source.table}" SET "description"=$1,"storeName"=$2 WHERE "id"=$3`, [
		applied.description,
		applied.storeName,
		itemId,
	]);
	const tags = (await getTagsByEntity("RECURRENCE", [recurrenceId])).get(recurrenceId) ?? [];
	await replaceEntityTags({
		entityIds: [itemId],
		entityType: source.entityType,
		tagIds: tags.map(tag => tag.id),
	});
	if (recurrence.movement === "TRANSFER" || recurrence.movement === "CARD_PAYMENT") return applied;
	await replaceDebtSplit({
		amount: Number(item.amount),
		split: (await getDebtSplitInput({ recurrenceId })) ?? null,
		target:
			kind === "PURCHASE" ? { creditCardImportItemId: itemId } : { transactionImportItemId: itemId },
		userId,
	});
	return applied;
}
