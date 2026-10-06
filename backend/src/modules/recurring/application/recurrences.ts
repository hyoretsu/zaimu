import {
	getNextRecurrenceDate,
	type RecurrenceDefinition,
	recurrenceDateKey,
	recurrenceDates,
	recurrenceNeedsConfiguration,
	shiftRecurrenceDate,
	validateRecurrenceSchedule,
} from "@zaimu/finance/recurrence";
import { format } from "date-fns";
import { assertBalanceAccountOwnership, assertCreditCardOwnership } from "~/modules/auth";
import {
	assertTagOwnership,
	getTagsByEntity,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import { mutateCreditBook, newBookPurchase } from "~/modules/creditCards/application/normalized-credit-book";
import { recalculateStatementPayments } from "~/modules/creditCards/application/statement-payments";
import {
	getDebtSplitInput,
	getDebtSplitReturn,
	getDebtSplitReturns,
	linkTransactionToDebt,
	replaceDebtSplit,
} from "~/modules/debts/application";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { resolveStore } from "~/modules/stores/application/resolve-store";
import { deleteLinkedTransactions } from "~/modules/transactions/application/delete-linked-transactions";
import { HttpException } from "~/shared/errors";
import { queryRaw, withRawTransaction, withTransaction } from "~/shared/infra/sql";
import type { RecurrenceBody, UpdateRecurrenceBody } from "../infra/elysia/RecurrenceDTO";
import { deleteLinkedRecurrencePurchases } from "./delete-linked-recurrence-purchases";

export type StoredRecurrence = RecurrenceDefinition;
export const recurrenceToday = () => format(new Date(), "yyyy-MM-dd");
export function normalizeRecurrence(row: Record<string, unknown>): StoredRecurrence {
	const result = { ...row };
	for (const field of ["startDate", "endDate", "materializedThrough"])
		if (result[field]) result[field] = recurrenceDateKey(result[field] as string | Date);
	for (const field of ["createdAt", "updatedAt"])
		if (result[field] instanceof Date) result[field] = (result[field] as Date).toISOString();
	result.amount = Number(result.amount);
	return result as unknown as StoredRecurrence;
}
export async function getStoredRecurrence(userId: string, id: string, lock = false) {
	const [row] = await queryRaw(
		`SELECT * FROM "Recurrence" WHERE "id"=$1 AND "userId"=$2${lock ? " FOR UPDATE" : ""}`,
		[id, userId],
	);
	if (!row) throw new HttpException("Recorrência não encontrada", 404);
	return normalizeRecurrence(row);
}
export async function presentRecurrence(recurrence: StoredRecurrence) {
	const tags = (await getTagsByEntity("RECURRENCE", [recurrence.id])).get(recurrence.id) ?? [];
	return {
		...recurrence,
		debtSplit: await getDebtSplitReturn({ recurrenceId: recurrence.id }, recurrence.amount),
		needsConfiguration: recurrenceNeedsConfiguration(recurrence),
		tagIds: tags.map(tag => tag.id),
		tags,
	};
}
export async function listRecurrenceSummaries(userId: string, isActive?: boolean) {
	const parameters: unknown[] = [userId];
	const conditions = ['"userId"=$1'];
	if (isActive !== undefined) {
		parameters.push(isActive);
		conditions.push(`"isActive"=$${parameters.length}`);
	}
	const rows = await queryRaw(
		`SELECT * FROM "Recurrence" WHERE ${conditions.join(" AND ")} ORDER BY "name","id"`,
		parameters,
	);
	const tagsById = await getTagsByEntity(
		"RECURRENCE",
		rows.map(row => String(row.id)),
	);
	return rows.map(row => {
		const recurrence = normalizeRecurrence(row),
			tags = tagsById.get(recurrence.id) ?? [];
		return {
			...recurrence,
			needsConfiguration: recurrenceNeedsConfiguration(recurrence),
			tagIds: tags.map(tag => tag.id),
			tags,
		};
	});
}
/** Full snapshots are reserved for sync; load associations once for the whole set. */
export async function listRecurrences(userId: string, isActive?: boolean) {
	const rows = await listRecurrenceSummaries(userId, isActive);
	const splits = await getDebtSplitReturns(
		"recurrenceId",
		rows.map(row => ({ amount: row.amount, id: row.id })),
	);
	return rows.map(row => ({ ...row, debtSplit: splits.get(row.id) ?? null }));
}
export async function validateRecurrence(userId: string, input: RecurrenceBody, allowMissing = false) {
	try {
		validateRecurrenceSchedule(input);
	} catch (error) {
		throw new HttpException((error as Error).message, 400);
	}
	if (!["INCOME", "EXPENSE", "TRANSFER", "CARD_PURCHASE", "CARD_PAYMENT"].includes(input.movement))
		throw new HttpException("Movimentação inválida.", 400);
	if (
		!input.name?.trim() ||
		!Number.isFinite(input.amount) ||
		input.amount <= 0 ||
		input.amount > 9999999999.99 ||
		Math.abs(Math.round(input.amount * 100) / 100 - input.amount) > 1e-8
	)
		throw new HttpException("Informe descrição e valor positivo.", 400);
	if (!allowMissing && recurrenceNeedsConfiguration(input))
		throw new HttpException("Selecione contas ou cartão compatíveis.", 400);
	const forbiddenDebt = input.movement === "TRANSFER" || input.movement === "CARD_PAYMENT";
	if (forbiddenDebt && input.debtSplit)
		throw new HttpException("Esta movimentação não aceita vínculo de dívida.", 400);
	for (const accountId of [input.originFinancialAccountId, input.destinationFinancialAccountId])
		if (accountId) {
			await assertBalanceAccountOwnership(accountId, userId);
			const [account] = await queryRaw<{ type: string }>(
				'SELECT "type" FROM "FinancialAccount" WHERE "id"=$1 AND "userId"=$2',
				[accountId, userId],
			);
			if (!account || !["CHECKING", "SAVINGS", "CASH"].includes(account.type))
				throw new HttpException("Selecione conta corrente, poupança ou dinheiro.", 400);
		}
	if (input.creditCardId) await assertCreditCardOwnership(input.creditCardId, userId);
	if (
		(input.movement === "INCOME" && (input.originFinancialAccountId || input.creditCardId)) ||
		(input.movement === "EXPENSE" && (input.destinationFinancialAccountId || input.creditCardId)) ||
		(input.movement === "TRANSFER" && input.creditCardId) ||
		(input.movement === "CARD_PURCHASE" &&
			(input.originFinancialAccountId || input.destinationFinancialAccountId)) ||
		(input.movement === "CARD_PAYMENT" && input.destinationFinancialAccountId)
	)
		throw new HttpException("Contas incompatíveis com movimentação.", 400);
	if (input.tagIds) await assertTagOwnership(input.tagIds, userId);
	if (input.storeName) await resolveStore(userId, input.storeName);
}
const writable = [
	"name",
	"amount",
	"movement",
	"unit",
	"interval",
	"startDate",
	"endDate",
	"dayOfMonth",
	"dayOfWeek",
	"originFinancialAccountId",
	"destinationFinancialAccountId",
	"creditCardId",
	"storeName",
	"isActive",
] as const;
export async function saveRecurrence(
	userId: string,
	input: RecurrenceBody | UpdateRecurrenceBody,
	id?: string,
	identity?: { id?: string },
	allowMissing = false,
	preserveEligibility = false,
) {
	return withRawTransaction(async query => {
		const existing = id ? await getStoredRecurrence(userId, id, true) : undefined;
		const existingSplit = existing ? await getDebtSplitInput({ recurrenceId: existing.id }) : undefined;
		const next = {
			...existing,
			...input,
			debtSplit: input.debtSplit === undefined ? existingSplit : input.debtSplit,
		} as RecurrenceBody;
		next.name = next.name?.trim();
		if (next.movement === "TRANSFER" || next.movement === "CARD_PAYMENT")
			next.debtSplit = input.debtSplit ?? null;
		await validateRecurrence(
			userId,
			next,
			allowMissing ||
				Boolean(
					existing &&
						recurrenceNeedsConfiguration(existing) &&
						Object.keys(input).every(key => key === "isActive"),
				),
		);
		const recurrenceId = existing?.id ?? identity?.id ?? crypto.randomUUID();
		const values = writable.map(field =>
			field === "isActive" ? (next[field] ?? true) : (next[field] ?? null),
		);
		if (existing) {
			for (const field of writable)
				if (String(existing[field] ?? "") !== String(next[field] ?? ""))
					await query(
						'INSERT INTO "RecurrenceHistory" ("recurrenceId","field","oldValue","newValue") VALUES ($1,$2,$3,$4)',
						[
							recurrenceId,
							field,
							existing[field] == null ? null : String(existing[field]),
							next[field] == null ? null : String(next[field]),
						],
					);
			await query(
				`UPDATE "Recurrence" SET ${writable.map((field, index) => `"${field}"=$${index + 1}`).join(",")},"materializedThrough"=GREATEST("materializedThrough",$${values.length + 1}::date),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$${values.length + 2} AND "userId"=$${values.length + 3}`,
				[
					...values,
					preserveEligibility ? existing.materializedThrough : shiftRecurrenceDate(recurrenceToday(), -1),
					recurrenceId,
					userId,
				],
			);
		} else
			await query(
				`INSERT INTO "Recurrence" ("id","userId",${writable.map(field => `"${field}"`).join(",")},"materializedThrough") VALUES (${Array.from({ length: values.length + 3 }, (_, index) => `$${index + 1}`).join(",")})`,
				[recurrenceId, userId, ...values, shiftRecurrenceDate(recurrenceToday(), -1)],
			);
		if (input.tagIds !== undefined)
			await replaceEntityTags({ entityIds: [recurrenceId], entityType: "RECURRENCE", tagIds: input.tagIds });
		if (
			input.debtSplit !== undefined ||
			(existingSplit &&
				(next.amount !== existing?.amount ||
					next.movement === "TRANSFER" ||
					next.movement === "CARD_PAYMENT"))
		)
			await replaceDebtSplit({
				amount: next.amount,
				split:
					next.movement === "TRANSFER" || next.movement === "CARD_PAYMENT" ? null : (next.debtSplit ?? null),
				target: { recurrenceId },
				userId,
			});
		return presentRecurrence(await getStoredRecurrence(userId, recurrenceId));
	});
}
export async function materializeRecurrence(
	userId: string,
	id: string,
	through = recurrenceToday(),
	replay?: { from: string; through: string },
	advance?: { time?: string | null },
) {
	return withRawTransaction(async query => {
		const recurrence = await getStoredRecurrence(userId, id, true);
		if (recurrenceNeedsConfiguration(recurrence) || (!replay && !recurrence.isActive)) {
			if (advance) throw new HttpException("Ative e configure a recorrência antes de adiantar.", 400);
			return 0;
		}
		const today = recurrenceToday();
		if (through > today || (replay && replay.through > today))
			throw new HttpException("Ocorrências futuras são somente previsões.", 400);
		const from = replay?.from ?? shiftRecurrenceDate(recurrence.materializedThrough, 1);
		const nextDate = advance ? getNextRecurrenceDate(recurrence, today) : undefined;
		if (advance && !nextDate) throw new HttpException("Não há ocorrência futura para adiantar.", 400);
		const dates = nextDate ? [nextDate] : recurrenceDates(recurrence, from, replay?.through ?? through);
		const tags = (await getTagsByEntity("RECURRENCE", [id])).get(id) ?? [];
		const tagIds = tags.map(tag => tag.id);
		const debtSplit = await getDebtSplitInput({ recurrenceId: id });
		let created = 0;
		for (const date of dates) {
			const [reserved] = await query(
				'INSERT INTO "RecurrenceOccurrence" ("recurrenceId","date") VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING "recurrenceId"',
				[id, date],
			);
			if (!reserved) {
				if (advance) throw new HttpException("A próxima ocorrência já foi adiantada.", 409);
				continue;
			}
			const financialDate = advance ? today : date;
			if (recurrence.movement === "CARD_PURCHASE") {
				const [settings] = await query<{
					cashbackAccountId: string | null;
					cashbackRate: number | null;
					cashbackYieldPeriod: "MONTHLY" | "YEARLY" | null;
					cashbackYieldReferencePercentage: number | null;
					cashbackYieldReferenceRate: number | null;
				}>(
					'SELECT "cashbackAccountId","cashbackRate","cashbackYieldPeriod","cashbackYieldReferencePercentage","cashbackYieldReferenceRate" FROM "CreditCard" WHERE "id"=$1',
					[recurrence.creditCardId],
				);
				await mutateCreditBook(
					userId,
					recurrence.creditCardId!,
					async book => {
						const purchase = newBookPurchase(book, {
							cashbackAccountId: settings?.cashbackAccountId ?? null,
							cashbackAmount:
								settings?.cashbackAccountId && settings?.cashbackRate
									? Number(((recurrence.amount * settings?.cashbackRate) / 100).toFixed(4))
									: null,
							cashbackYieldPeriod: settings?.cashbackYieldPeriod ?? null,
							cashbackYieldReferencePercentage: settings?.cashbackYieldReferencePercentage ?? null,
							cashbackYieldReferenceRate: settings?.cashbackYieldReferenceRate ?? null,
							debtSplitRule: debtSplit ?? null,
							description: recurrence.name,
							installments: 1,
							purchaseDate: financialDate,
							recurrenceId: id,
							recurrenceOccurrenceDate: date,
							storeName: recurrence.storeName ?? null,
							tagIds,
							time: advance?.time ?? null,
							totalAmount: recurrence.amount,
						});
						await query(
							'UPDATE "RecurrenceOccurrence" SET "purchaseId"=$1 WHERE "recurrenceId"=$2 AND "date"=$3',
							[purchase.id, id, date],
						);
					},
					through,
				);
			} else {
				const type = recurrence.movement === "CARD_PAYMENT" ? "EXPENSE" : recurrence.movement;
				const [transaction] = await query<{ id: string }>(
					'INSERT INTO "Transaction" ("userId","amount","date","description","storeName","type","originFinancialAccountId","destinationFinancialAccountId","paymentCreditCardId","recurrenceId","recurrenceOccurrenceDate","time") VALUES ($1,$2,$3,$4,$5,$6::"TransactionType",$7,$8,$9,$10,$11,$12) RETURNING "id"',
					[
						userId,
						recurrence.amount,
						financialDate,
						recurrence.name,
						recurrence.storeName ?? null,
						type,
						recurrence.originFinancialAccountId ?? null,
						recurrence.destinationFinancialAccountId ?? null,
						recurrence.movement === "CARD_PAYMENT" ? recurrence.creditCardId : null,
						id,
						date,
						advance?.time ?? null,
					],
				);
				await replaceEntityTags({
					entityIds: [transaction!.id],
					entityType: tagEntityType.transaction,
					tagIds,
				});
				if (debtSplit && type !== "TRANSFER" && recurrence.movement !== "CARD_PAYMENT")
					await linkTransactionToDebt({
						amount: recurrence.amount,
						date: financialDate,
						debtSplit,
						description: recurrence.name,
						transactionId: transaction!.id,
						type: type as "INCOME" | "EXPENSE",
						userId,
					});
				await query(
					'UPDATE "RecurrenceOccurrence" SET "transactionId"=$1 WHERE "recurrenceId"=$2 AND "date"=$3',
					[transaction!.id, id, date],
				);
				if (recurrence.movement === "CARD_PAYMENT")
					await withTransaction(executor =>
						recalculateStatementPayments(executor, [recurrence.creditCardId!]),
					);
				for (const accountId of [
					recurrence.originFinancialAccountId,
					recurrence.destinationFinancialAccountId,
				])
					if (accountId)
						await enqueueAccountYieldRecalculation(
							accountId,
							new Date(`${financialDate}T12:00:00`),
							"recurrence-materialized",
						);
			}
			created++;
		}
		if (!replay && !advance)
			await query(
				'UPDATE "Recurrence" SET "materializedThrough"=GREATEST("materializedThrough",$1::date) WHERE "id"=$2',
				[through, id],
			);
		return created;
	});
}
export async function materializeAllRecurrences(asOf = new Date(), userIds?: string[]) {
	if (userIds && !userIds.length) return { transactions: 0, userIds: [] };
	const rows = await queryRaw<{ id: string; userId: string }>(
		'SELECT "id","userId" FROM "Recurrence" WHERE "isActive"=true AND "materializedThrough"<$1::date AND ($2::varchar[] IS NULL OR "userId"=ANY($2)) ORDER BY "id"',
		[asOf.toISOString().slice(0, 10), userIds ?? null],
	);
	let transactions = 0;
	const changed = new Set<string>();
	for (const row of rows) {
		const created = await materializeRecurrence(row.userId, row.id, asOf.toISOString().slice(0, 10));
		transactions += created;
		if (created) changed.add(row.userId);
	}
	return { transactions, userIds: [...changed] };
}
export async function deleteRecurrence(userId: string, id: string, deleteTransactions = false) {
	await withRawTransaction(async query => {
		const recurrence = await getStoredRecurrence(userId, id, true);
		if (deleteTransactions) {
			await deleteLinkedTransactions("recurrenceId", id, userId);
			await deleteLinkedRecurrencePurchases(id, userId);
			if (recurrence.creditCardId)
				await withTransaction(executor => recalculateStatementPayments(executor, [recurrence.creditCardId!]));
		}
		await replaceEntityTags({ entityIds: [id], entityType: "RECURRENCE", tagIds: [] });
		await query('DELETE FROM "DebtSplit" WHERE "recurrenceId"=$1', [id]);
		await query('DELETE FROM "RecurrenceHistory" WHERE "recurrenceId"=$1', [id]);
		await query('DELETE FROM "RecurrenceOccurrence" WHERE "recurrenceId"=$1', [id]);
		await query('DELETE FROM "Recurrence" WHERE "id"=$1 AND "userId"=$2', [id, userId]);
	});
	return { success: true as const };
}
