import { legacyRecurrenceSchedule } from "@zaimu/finance/recurrence";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
import type { RecurrenceBody } from "../infra/elysia/RecurrenceDTO";
import {
	getStoredRecurrence,
	listRecurrenceSummaries,
	listRecurrences,
	type StoredRecurrence,
	saveRecurrence,
} from "./recurrences";
export type LegacyRecurrenceSource = "salary" | "subscription" | "recurring";
export async function legacyRecurrenceInput(
	source: LegacyRecurrenceSource,
	input: Record<string, unknown>,
): Promise<RecurrenceBody> {
	const accountId = input.financialAccountId as string | undefined;
	const card =
		input.paymentMethod === "CREDIT" && accountId
			? (
					await queryRaw<{ id: string }>('SELECT "id" FROM "CreditCard" WHERE "financialAccountId"=$1', [
						accountId,
					])
				)[0]
			: undefined;
	return {
		...legacyRecurrenceSchedule(
			String(input.frequency ?? "MONTHLY"),
			String(input.startDate),
			(input.dayOfMonth ?? input.day ?? input.billingDay ?? input.payDay) as number | null,
			input.dayOfWeek as number | null,
		),
		amount: Number(input.amount ?? input.netAmount),
		creditCardId: card?.id ?? null,
		debtSplit: input.debtSplit as RecurrenceBody["debtSplit"],
		destinationFinancialAccountId: source === "salary" ? (accountId ?? null) : null,
		endDate: input.endDate as string | null,
		isActive: input.isActive as boolean | undefined,
		movement: source === "salary" ? "INCOME" : input.paymentMethod === "CREDIT" ? "CARD_PURCHASE" : "EXPENSE",
		name: String(source === "salary" ? input.source : input.name),
		originFinancialAccountId:
			source === "salary" || input.paymentMethod === "CREDIT" ? null : (accountId ?? null),
		storeName: input.storeName as string | null,
		tagIds: input.tagIds as string[] | undefined,
	};
}
export async function presentLegacyRecurrence(
	recurrence: StoredRecurrence & Record<string, unknown>,
	source: LegacyRecurrenceSource,
	cardAccountId?: string | null,
) {
	const accountId =
		cardAccountId !== undefined
			? cardAccountId
			: recurrence.creditCardId
				? (
						await queryRaw<{ financialAccountId: string }>(
							'SELECT "financialAccountId" FROM "CreditCard" WHERE "id"=$1',
							[recurrence.creditCardId],
						)
					)[0]?.financialAccountId
				: (recurrence.originFinancialAccountId ?? recurrence.destinationFinancialAccountId);
	const frequency =
		recurrence.unit === "DAY"
			? "DAILY"
			: recurrence.unit === "WEEK"
				? recurrence.interval === 2
					? "BIWEEKLY"
					: "WEEKLY"
				: recurrence.unit === "YEAR"
					? "YEARLY"
					: "MONTHLY";
	return {
		...recurrence,
		autoGenerateFrom: recurrence.startDate,
		billingDay: recurrence.dayOfMonth ?? Number(recurrence.startDate.slice(8, 10)),
		dayOfMonth: recurrence.dayOfMonth,
		financialAccountId: accountId,
		frequency,
		legacySource: source,
		payDay: recurrence.dayOfMonth ?? Number(recurrence.startDate.slice(8, 10)),
		paymentMethod: recurrence.movement === "CARD_PURCHASE" ? "CREDIT" : "TRANSFER",
		source: recurrence.name,
	};
}
export async function resolveLegacyRecurrenceId(
	userId: string,
	source: LegacyRecurrenceSource,
	legacyId: string,
) {
	const [mapped] = await queryRaw<{ id: string }>(
		'SELECT "id" FROM "Recurrence" WHERE "userId"=$1 AND "legacySource"=$2 AND "legacyId"=$3',
		[userId, source, legacyId],
	);
	if (mapped) return mapped.id;
	const existing = await getStoredRecurrence(userId, legacyId);
	if (existing.legacySource && existing.legacySource !== source)
		throw new HttpException("Recorrência não encontrada", 404);
	return existing.id;
}
export async function listLegacyRecurrences(
	userId: string,
	source: LegacyRecurrenceSource,
	isActive?: boolean,
	summary = false,
) {
	const recurrences = (
		await (summary
			? listRecurrenceSummaries(userId, isActive, source)
			: listRecurrences(userId, isActive, source))
	).filter(item => item.legacySource === source);
	const cardIds = [...new Set(recurrences.flatMap(item => (item.creditCardId ? [item.creditCardId] : [])))];
	const cards = cardIds.length
		? await queryRaw<{ id: string; financialAccountId: string }>(
				'SELECT "id","financialAccountId" FROM "CreditCard" WHERE "id"=ANY($1)',
				[cardIds],
			)
		: [];
	const accounts = new Map(cards.map(card => [card.id, card.financialAccountId]));
	return Promise.all(
		recurrences.map(item =>
			presentLegacyRecurrence(
				item,
				source,
				item.creditCardId ? (accounts.get(item.creditCardId) ?? null) : undefined,
			),
		),
	);
}
export async function saveLegacyRecurrence(
	userId: string,
	source: LegacyRecurrenceSource,
	input: Record<string, unknown>,
	id?: string,
) {
	const existing = id
		? await getStoredRecurrence(userId, await resolveLegacyRecurrenceId(userId, source, id))
		: undefined;
	const previous = existing
		? await presentLegacyRecurrence(existing as StoredRecurrence & Record<string, unknown>, source)
		: {};
	const body = await legacyRecurrenceInput(source, { ...previous, ...input });
	return presentLegacyRecurrence(
		await saveRecurrence(userId, body, existing?.id, existing ? undefined : { source }, true),
		source,
	);
}
