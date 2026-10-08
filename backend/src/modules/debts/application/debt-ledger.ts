import { toMinorUnits } from "@zaimu/finance/money";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryFirst, queryRows } from "~/shared/infra/sql";
import type { DebtSplitInput } from "../domain";
import { calculateDebtSplit } from "../domain";
import { debtEffectForTransaction, isCompatibleDebtPair } from "./debt-balance";
import { getDuplicateCreatorDebtEventIds } from "./debt-event-deduplication";
import { getDebtSplitInput, replaceDebtSplit } from "./debt-splits";

export type DebtEventKind = "ORIGIN" | "TRANSACTION" | "PURCHASE" | "MIGRATED_SETTLEMENT";

const participantDescription = (participant: { description?: string }, fallback?: string) =>
	participant.description?.trim() || fallback;

const transactionDebtDescription = (
	participant: { description?: string },
	type: "EXPENSE" | "INCOME" | "TRANSFER",
	fallback?: string,
) => (type === "EXPENSE" ? participantDescription(participant, fallback) : fallback);

export const normalizeDebtPersonName = (name: string) =>
	name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export async function getOwnedDebtPerson(personId: string, userId: string) {
	const person = await queryFirst(
		db.sql.public.DebtPerson.select("id", "userId", "name", "normalizedName", "connectionId", "hiddenAt")
			.where((fields, functions) =>
				functions.and(functions.eq(fields.id, personId), functions.eq(fields.userId, userId)),
			)
			.limit(1)
			.build(),
	);
	if (!person || person.hiddenAt) throw new HttpException("Pessoa da dívida não encontrada", 404);
	return person;
}

export async function resolveDebtPersonConnection(personId: string, userId: string) {
	const person = await getOwnedDebtPerson(personId, userId);
	if (!person.connectionId) return { connectionId: undefined, person };
	const connection = await queryFirst(
		db.sql.public.DebtConnection.select("id", "status")
			.where((fields, functions) => functions.eq(fields.id, person.connectionId!))
			.limit(1)
			.build(),
	);
	return {
		connectionId: connection?.status === "ACCEPTED" ? connection.id : undefined,
		person,
	};
}

export async function createDebtEvent(input: {
	amount: number;
	currency?: string;
	createdByUserId: string;
	date?: null | string;
	debtPersonId: string;
	description?: string;
	dueDate?: string;
	effect: number;
	kind: DebtEventKind;
}) {
	if (!Number.isFinite(input.amount) || input.amount <= 0)
		throw new HttpException("Informe um valor válido", 400);
	const currency = input.currency ?? "BRL";
	try {
		toMinorUnits(input.amount, currency, 1);
		toMinorUnits(input.effect, currency, -Number.MAX_SAFE_INTEGER);
	} catch {
		throw new HttpException("Valor incompatível com a moeda da dívida", 400);
	}
	const { connectionId } = await resolveDebtPersonConnection(input.debtPersonId, input.createdByUserId);
	const event = await queryFirst(
		db.sql.public.DebtEvent.insert([
			{
				amount: String(input.amount),
				connectionId,
				createdByUserId: input.createdByUserId,
				currency,
				date: input.date ? new Date(input.date) : null,
				debtPersonId: input.debtPersonId,
				description: input.description,
				dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
				effect: String(input.effect),
				kind: input.kind,
			},
		])
			.returning(
				"id",
				"amount",
				"currency",
				"effect",
				"date",
				"description",
				"kind",
				"debtPersonId",
				"connectionId",
			)
			.build(),
	);
	if (!event) throw new HttpException("Lançamento da dívida não criado", 500);
	return { ...event, kind: input.kind };
}

export async function getAccessibleDebtEvent(eventId: string, userId: string) {
	const event = await queryFirst(
		db.sql.public.DebtEvent.outerLeftJoin(db.sql.public.DebtPerson, (fields, functions) =>
			functions.eq(fields.DebtEvent.debtPersonId, fields.DebtPerson.id),
		)
			.outerLeftJoin(db.sql.public.DebtConnection, (fields, functions) =>
				functions.eq(fields.DebtEvent.connectionId, fields.DebtConnection.id),
			)
			.select(fields => ({
				amount: fields.DebtEvent.amount,
				connectionId: fields.DebtEvent.connectionId,
				createdByUserId: fields.DebtEvent.createdByUserId,
				currency: fields.DebtEvent.currency,
				date: fields.DebtEvent.date,
				debtPersonId: fields.DebtEvent.debtPersonId,
				effect: fields.DebtEvent.effect,
				id: fields.DebtEvent.id,
				kind: fields.DebtEvent.kind,
				personUserId: fields.DebtPerson.userId,
				recipientId: fields.DebtConnection.recipientId,
				requesterId: fields.DebtConnection.requesterId,
				status: fields.DebtConnection.status,
			}))
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.DebtEvent.id, eventId),
					functions.eq(fields.DebtEvent.deletedAt, null),
					functions.or(
						functions.eq(fields.DebtPerson.userId, userId),
						functions.and(
							functions.eq(fields.DebtConnection.status, "ACCEPTED"),
							functions.or(
								functions.eq(fields.DebtConnection.requesterId, userId),
								functions.eq(fields.DebtConnection.recipientId, userId),
							),
						),
					),
				),
			)
			.limit(1)
			.build(),
	);
	if (!event) throw new HttpException("Lançamento da dívida não encontrado", 404);
	return event;
}

export async function linkTransactionToDebt(input: {
	amount: number;
	date: string;
	debtSplit?: DebtSplitInput;
	debtPersonId?: string;
	description?: string;
	matchEventId?: string;
	transactionId: string;
	type: "EXPENSE" | "INCOME" | "TRANSFER";
	userId: string;
}) {
	const requestedSplit =
		input.debtSplit ??
		(input.debtPersonId
			? ({
					mode: "SHARES",
					ownerShares: null,
					participants: [{ debtPersonId: input.debtPersonId, shares: 1 }],
				} satisfies DebtSplitInput)
			: undefined);
	if (requestedSplit && input.matchEventId)
		throw new HttpException("Rateio e conciliação não podem ser usados juntos", 400);
	if (input.type === "TRANSFER" && (requestedSplit || input.matchEventId))
		throw new HttpException("Transferências entre contas próprias não podem ser vinculadas a dívidas", 400);
	if (!requestedSplit && !input.matchEventId) return;
	if (requestedSplit)
		return syncTransactionDebtEvent({
			...input,
			debtSplit: requestedSplit,
		});
	if (input.matchEventId) {
		const event = await getAccessibleDebtEvent(input.matchEventId, input.userId);
		const source = await queryFirst(
			db.sql.public.Transaction.select("bookingCurrency")
				.where((fields, functions) =>
					functions.and(
						functions.eq(fields.id, input.transactionId),
						functions.eq(fields.userId, input.userId),
					),
				)
				.limit(1)
				.build(),
		);
		if (event.currency !== (source?.bookingCurrency ?? "BRL"))
			throw new HttpException("Conciliação exige lançamentos na mesma moeda", 409);
		if (!event.date) throw new HttpException("Lançamentos sem data não podem ser conciliados", 409);
		const expectedEffect = debtEffectForTransaction(input.amount, input.type);
		const perspectiveEffect =
			event.createdByUserId === input.userId ? Number(event.effect) : -Number(event.effect);
		if (
			!isCompatibleDebtPair({
				amount: input.amount,
				date: input.date,
				effect: expectedEffect,
				eventAmount: Number(event.amount),
				eventDate: event.date.toISOString(),
				eventPerspectiveEffect: perspectiveEffect,
			})
		)
			throw new HttpException("A movimentação não corresponde ao lançamento compartilhado", 409);
		await executeStatement(
			db.sql.public.DebtTransactionLink.insert([
				{ eventId: event.id, isCreator: false, transactionId: input.transactionId, userId: input.userId },
			]).build(),
		);
		return;
	}
}

export async function syncTransactionDebtEvent(input: {
	amount: number;
	date: string;
	debtSplit?: DebtSplitInput | null;
	debtPersonId?: null | string;
	description?: string;
	matchEventId?: string;
	transactionId: string;
	type: "EXPENSE" | "INCOME" | "TRANSFER";
	userId: string;
}) {
	const source = await queryFirst(
		db.sql.public.Transaction.select("bookingCurrency", "amount")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.id, input.transactionId),
					functions.eq(fields.userId, input.userId),
				),
			)
			.limit(1)
			.build(),
	);
	const currency = source?.bookingCurrency ?? "BRL";
	if (source) input = { ...input, amount: Number(source.amount) };
	const requestedSplit =
		input.debtSplit !== undefined
			? input.debtSplit
			: input.debtPersonId === undefined
				? undefined
				: input.debtPersonId === null
					? null
					: ({
							mode: "SHARES",
							ownerShares: null,
							participants: [{ debtPersonId: input.debtPersonId, shares: 1 }],
						} satisfies DebtSplitInput);
	const links = await queryRows(
		db.sql.public.DebtTransactionLink.innerJoin(db.sql.public.DebtEvent, (fields, functions) =>
			functions.eq(fields.DebtTransactionLink.eventId, fields.DebtEvent.id),
		)
			.select(fields => ({
				amount: fields.DebtEvent.amount,
				createdByUserId: fields.DebtEvent.createdByUserId,
				currency: fields.DebtEvent.currency,
				date: fields.DebtEvent.date,
				debtPersonId: fields.DebtEvent.debtPersonId,
				effect: fields.DebtEvent.effect,
				eventId: fields.DebtEvent.id,
				isCreator: fields.DebtTransactionLink.isCreator,
				linkId: fields.DebtTransactionLink.id,
				userId: fields.DebtTransactionLink.userId,
			}))
			.where((fields, functions) => functions.eq(fields.transactionId, input.transactionId))
			.build(),
	);
	const duplicateCreatorEventIds = getDuplicateCreatorDebtEventIds(links);
	if (duplicateCreatorEventIds.size) {
		await executeStatement(
			db.sql.public.DebtEvent.delete()
				.where((fields, functions) => functions.in(fields.id, [...duplicateCreatorEventIds]))
				.build(),
		);
		links.splice(0, links.length, ...links.filter(link => !duplicateCreatorEventIds.has(link.eventId)));
	}
	if (requestedSplit === null) {
		await replaceDebtSplit({
			amount: input.amount,
			split: null,
			target: { transactionId: input.transactionId },
			userId: input.userId,
		});
		const creatorEventIds = links.filter(link => link.isCreator).map(link => link.eventId);
		if (creatorEventIds.length)
			await executeStatement(
				db.sql.public.DebtEvent.delete()
					.where((fields, functions) => functions.in(fields.id, creatorEventIds))
					.build(),
			);
		const matchedLinkIds = links.filter(link => !link.isCreator).map(link => link.linkId);
		if (matchedLinkIds.length)
			await executeStatement(
				db.sql.public.DebtTransactionLink.delete()
					.where((fields, functions) => functions.in(fields.id, matchedLinkIds))
					.build(),
			);
		return;
	}
	const nextSplit = requestedSplit ?? (await getDebtSplitInput({ transactionId: input.transactionId }));
	if (!nextSplit) {
		if (input.matchEventId && links.length === 0)
			await linkTransactionToDebt({
				amount: input.amount,
				date: input.date,
				description: input.description,
				matchEventId: input.matchEventId,
				transactionId: input.transactionId,
				type: input.type,
				userId: input.userId,
			});
		for (const link of links.filter(link => !link.isCreator)) {
			const perspectiveEffect =
				link.createdByUserId === input.userId ? Number(link.effect) : -Number(link.effect);
			if (
				link.currency !== currency ||
				!link.date ||
				!isCompatibleDebtPair({
					amount: input.amount,
					date: input.date,
					effect: debtEffectForTransaction(input.amount, input.type),
					eventAmount: Number(link.amount),
					eventDate: link.date.toISOString(),
					eventPerspectiveEffect: perspectiveEffect,
				})
			)
				await executeStatement(
					db.sql.public.DebtTransactionLink.delete()
						.where((fields, functions) => functions.eq(fields.id, link.linkId))
						.build(),
				);
		}
		return;
	}
	if (input.type === "TRANSFER")
		throw new HttpException("Transferências não podem permanecer vinculadas a dívidas", 400);
	const calculated = requestedSplit
		? await replaceDebtSplit({
				amount: input.amount,
				currency,
				split: nextSplit,
				target: { transactionId: input.transactionId },
				userId: input.userId,
			})
		: calculateDebtSplit(input.amount, nextSplit, currency);
	const matchedLinkIds = links.filter(link => !link.isCreator).map(link => link.linkId);
	if (matchedLinkIds.length)
		await executeStatement(
			db.sql.public.DebtTransactionLink.delete()
				.where((fields, functions) => functions.in(fields.id, matchedLinkIds))
				.build(),
		);
	const creatorLinks = links.filter(link => link.isCreator && link.debtPersonId);
	const linksByPerson = new Map(creatorLinks.map(link => [link.debtPersonId!, link]));
	const nextPeople = new Set(calculated!.participants.map(participant => participant.debtPersonId));
	for (const link of creatorLinks) {
		if (!nextPeople.has(link.debtPersonId!))
			await executeStatement(
				db.sql.public.DebtEvent.delete()
					.where((fields, functions) => functions.eq(fields.id, link.eventId))
					.build(),
			);
	}
	for (const participant of calculated!.participants) {
		const link = linksByPerson.get(participant.debtPersonId);
		if (!link) {
			const event = await createDebtEvent({
				amount: participant.amount,
				createdByUserId: input.userId,
				currency,
				date: input.date,
				debtPersonId: participant.debtPersonId,
				description: transactionDebtDescription(participant, input.type, input.description),
				effect: debtEffectForTransaction(participant.amount, input.type),
				kind: "TRANSACTION",
			});
			await executeStatement(
				db.sql.public.DebtTransactionLink.insert([
					{ eventId: event.id, isCreator: true, transactionId: input.transactionId, userId: input.userId },
				]).build(),
			);
			continue;
		}
		const { connectionId } = await resolveDebtPersonConnection(participant.debtPersonId, input.userId);
		await executeStatement(
			db.sql.public.DebtEvent.update({
				amount: String(participant.amount),
				connectionId: connectionId ?? null,
				currency,
				date: new Date(input.date),
				description: transactionDebtDescription(participant, input.type, input.description) ?? null,
				effect: String(debtEffectForTransaction(participant.amount, input.type)),
				updatedAt: new Date(),
			} as never)
				.where((fields, functions) => functions.eq(fields.id, link.eventId))
				.build(),
		);
		await executeStatement(
			db.sql.public.DebtTransactionLink.delete()
				.where((fields, functions) =>
					functions.and(functions.eq(fields.eventId, link.eventId), functions.eq(fields.isCreator, false)),
				)
				.build(),
		);
	}
}

export async function linkPurchaseToDebt(input: {
	creditPurchaseId: string;
	date: string;
	debtSplit?: DebtSplitInput;
	debtEffectMultiplier?: -1 | 1;
	debtPersonId?: string;
	description?: string;
	matchEventId?: string;
	totalAmount: number;
	userId: string;
}) {
	const requestedSplit =
		input.debtSplit ??
		(input.debtPersonId
			? ({
					mode: "SHARES",
					ownerShares: null,
					participants: [{ debtPersonId: input.debtPersonId, shares: 1 }],
				} satisfies DebtSplitInput)
			: undefined);
	if (requestedSplit && input.matchEventId)
		throw new HttpException("Rateio e conciliação não podem ser usados juntos", 400);
	if (!requestedSplit && !input.matchEventId) return;
	if (requestedSplit)
		return syncPurchaseDebtEvent({
			...input,
			debtSplit: requestedSplit,
		});
	const debtEffectMultiplier = input.debtEffectMultiplier ?? 1;
	if (input.matchEventId) {
		const event = await getAccessibleDebtEvent(input.matchEventId, input.userId);
		const source = await queryFirst(
			db.sql.public.CreditPurchaseRecord.select("bookingCurrency")
				.where((fields, functions) =>
					functions.and(
						functions.eq(fields.id, input.creditPurchaseId),
						functions.eq(fields.userId, input.userId),
					),
				)
				.limit(1)
				.build(),
		);
		if (event.currency !== (source?.bookingCurrency ?? "BRL"))
			throw new HttpException("Conciliação exige lançamentos na mesma moeda", 409);
		if (!event.date) throw new HttpException("Lançamentos sem data não podem ser conciliados", 409);
		const perspectiveEffect =
			event.createdByUserId === input.userId ? Number(event.effect) : -Number(event.effect);
		if (
			Number(event.amount) !== input.totalAmount ||
			perspectiveEffect !== input.totalAmount ||
			event.date.toISOString().slice(0, 10) !== input.date.slice(0, 10)
		)
			throw new HttpException("A compra não corresponde ao lançamento compartilhado", 409);
		await executeStatement(
			db.sql.public.DebtPurchaseLink.insert([
				{ creditPurchaseId: input.creditPurchaseId, eventId: event.id, userId: input.userId },
			]).build(),
		);
		return;
	}
}

export async function syncPurchaseDebtEvent(input: {
	creditPurchaseId: string;
	date: string;
	debtSplit?: DebtSplitInput | null;
	debtEffectMultiplier?: -1 | 1;
	debtPersonId?: null | string;
	description?: string;
	matchEventId?: string;
	totalAmount: number;
	userId: string;
}) {
	const source = await queryFirst(
		db.sql.public.CreditPurchaseRecord.select("bookingCurrency", "totalAmount")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.id, input.creditPurchaseId),
					functions.eq(fields.userId, input.userId),
				),
			)
			.limit(1)
			.build(),
	);
	const currency = source?.bookingCurrency ?? "BRL";
	if (source) input = { ...input, totalAmount: Number(source.totalAmount) };
	const requestedSplit =
		input.debtSplit !== undefined
			? input.debtSplit
			: input.debtPersonId === undefined
				? undefined
				: input.debtPersonId === null
					? null
					: ({
							mode: "SHARES",
							ownerShares: null,
							participants: [{ debtPersonId: input.debtPersonId, shares: 1 }],
						} satisfies DebtSplitInput);
	const debtEffectMultiplier = input.debtEffectMultiplier ?? 1;
	const links = await queryRows(
		db.sql.public.DebtPurchaseLink.innerJoin(db.sql.public.DebtEvent, (fields, functions) =>
			functions.eq(fields.DebtPurchaseLink.eventId, fields.DebtEvent.id),
		)
			.select(fields => ({
				amount: fields.DebtEvent.amount,
				createdByUserId: fields.DebtEvent.createdByUserId,
				currency: fields.DebtEvent.currency,
				date: fields.DebtEvent.date,
				debtPersonId: fields.DebtEvent.debtPersonId,
				effect: fields.DebtEvent.effect,
				eventId: fields.DebtEvent.id,
				isCreator: fields.DebtPurchaseLink.isCreator,
				linkId: fields.DebtPurchaseLink.id,
			}))
			.where((fields, functions) => functions.eq(fields.creditPurchaseId, input.creditPurchaseId))
			.build(),
	);
	const duplicateCreatorEventIds = getDuplicateCreatorDebtEventIds(links);
	if (duplicateCreatorEventIds.size) {
		await executeStatement(
			db.sql.public.DebtEvent.delete()
				.where((fields, functions) => functions.in(fields.id, [...duplicateCreatorEventIds]))
				.build(),
		);
		links.splice(0, links.length, ...links.filter(link => !duplicateCreatorEventIds.has(link.eventId)));
	}
	if (requestedSplit === null) {
		await replaceDebtSplit({
			amount: input.totalAmount,
			split: null,
			target: { creditPurchaseId: input.creditPurchaseId },
			userId: input.userId,
		});
		const eventIds = links.filter(link => link.isCreator).map(link => link.eventId);
		if (eventIds.length)
			await executeStatement(
				db.sql.public.DebtEvent.delete()
					.where((fields, functions) => functions.in(fields.id, eventIds))
					.build(),
			);
		const linkIds = links.filter(link => !link.isCreator).map(link => link.linkId);
		if (linkIds.length)
			await executeStatement(
				db.sql.public.DebtPurchaseLink.delete()
					.where((fields, functions) => functions.in(fields.id, linkIds))
					.build(),
			);
		return;
	}
	const nextSplit = requestedSplit ?? (await getDebtSplitInput({ creditPurchaseId: input.creditPurchaseId }));
	if (!nextSplit) {
		if (input.matchEventId && links.length === 0)
			await linkPurchaseToDebt({
				creditPurchaseId: input.creditPurchaseId,
				date: input.date,
				description: input.description,
				matchEventId: input.matchEventId,
				totalAmount: input.totalAmount,
				userId: input.userId,
			});
		for (const link of links.filter(link => !link.isCreator)) {
			const perspectiveEffect =
				link.createdByUserId === input.userId ? Number(link.effect) : -Number(link.effect);
			if (
				link.currency !== currency ||
				!link.date ||
				Number(link.amount) !== input.totalAmount ||
				perspectiveEffect !== input.totalAmount ||
				link.date.toISOString().slice(0, 10) !== input.date.slice(0, 10)
			)
				await executeStatement(
					db.sql.public.DebtPurchaseLink.delete()
						.where((fields, functions) => functions.eq(fields.id, link.linkId))
						.build(),
				);
		}
		return;
	}
	const calculated = requestedSplit
		? await replaceDebtSplit({
				amount: input.totalAmount,
				currency,
				split: nextSplit,
				target: { creditPurchaseId: input.creditPurchaseId },
				userId: input.userId,
			})
		: calculateDebtSplit(input.totalAmount, nextSplit, currency);
	const matchedLinkIds = links.filter(link => !link.isCreator).map(link => link.linkId);
	if (matchedLinkIds.length)
		await executeStatement(
			db.sql.public.DebtPurchaseLink.delete()
				.where((fields, functions) => functions.in(fields.id, matchedLinkIds))
				.build(),
		);
	const creatorLinks = links.filter(link => link.isCreator && link.debtPersonId);
	const linksByPerson = new Map(creatorLinks.map(link => [link.debtPersonId!, link]));
	const nextPeople = new Set(calculated!.participants.map(participant => participant.debtPersonId));
	for (const link of creatorLinks) {
		if (!nextPeople.has(link.debtPersonId!))
			await executeStatement(
				db.sql.public.DebtEvent.delete()
					.where((fields, functions) => functions.eq(fields.id, link.eventId))
					.build(),
			);
	}
	for (const participant of calculated!.participants) {
		const link = linksByPerson.get(participant.debtPersonId);
		if (!link) {
			const event = await createDebtEvent({
				amount: participant.amount,
				createdByUserId: input.userId,
				currency,
				date: input.date,
				debtPersonId: participant.debtPersonId,
				description: participantDescription(participant, input.description),
				effect: participant.amount * debtEffectMultiplier,
				kind: "PURCHASE",
			});
			await executeStatement(
				db.sql.public.DebtPurchaseLink.insert([
					{
						creditPurchaseId: input.creditPurchaseId,
						eventId: event.id,
						isCreator: true,
						userId: input.userId,
					},
				]).build(),
			);
			continue;
		}
		const { connectionId } = await resolveDebtPersonConnection(participant.debtPersonId, input.userId);
		await executeStatement(
			db.sql.public.DebtEvent.update({
				amount: String(participant.amount),
				connectionId: connectionId ?? null,
				currency,
				date: new Date(input.date),
				description: participantDescription(participant, input.description) ?? null,
				effect: String(participant.amount * debtEffectMultiplier),
				updatedAt: new Date(),
			} as never)
				.where((fields, functions) => functions.eq(fields.id, link.eventId))
				.build(),
		);
		await executeStatement(
			db.sql.public.DebtPurchaseLink.delete()
				.where((fields, functions) =>
					functions.and(functions.eq(fields.eventId, link.eventId), functions.eq(fields.isCreator, false)),
				)
				.build(),
		);
	}
}

export async function deleteCreatorDebtEventForTransaction(transactionId: string, userId: string) {
	const links = await queryRows(
		db.sql.public.DebtTransactionLink.select("id", "eventId", "isCreator", "userId")
			.where((fields, functions) => functions.eq(fields.transactionId, transactionId))
			.build(),
	);
	const ownedLinks = links.filter(link => link.userId === userId);
	const creatorEventIds = ownedLinks.filter(link => link.isCreator).map(link => link.eventId);
	if (creatorEventIds.length) {
		await executeStatement(
			db.sql.public.DebtEvent.delete()
				.where((fields, functions) => functions.in(fields.id, creatorEventIds))
				.build(),
		);
	}
	const matchedLinkIds = ownedLinks.filter(link => !link.isCreator).map(link => link.id);
	if (matchedLinkIds.length) {
		await executeStatement(
			db.sql.public.DebtTransactionLink.delete()
				.where((fields, functions) => functions.in(fields.id, matchedLinkIds))
				.build(),
		);
	}
}

export async function deleteCreatorDebtEventForPurchase(purchaseId: string, userId: string) {
	const links = await queryRows(
		db.sql.public.DebtPurchaseLink.select("id", "eventId", "isCreator", "userId")
			.where((fields, functions) => functions.eq(fields.creditPurchaseId, purchaseId))
			.build(),
	);
	const ownedLinks = links.filter(link => link.userId === userId);
	const creatorEventIds = ownedLinks.filter(link => link.isCreator).map(link => link.eventId);
	if (creatorEventIds.length) {
		await executeStatement(
			db.sql.public.DebtEvent.delete()
				.where((fields, functions) => functions.in(fields.id, creatorEventIds))
				.build(),
		);
	}
	const matchedLinkIds = ownedLinks.filter(link => !link.isCreator).map(link => link.id);
	if (matchedLinkIds.length) {
		await executeStatement(
			db.sql.public.DebtPurchaseLink.delete()
				.where((fields, functions) => functions.in(fields.id, matchedLinkIds))
				.build(),
		);
	}
}

export async function getDebtBalanceTotals(userId: string) {
	const people = (
		await queryRows(
			db.sql.public.DebtPerson.select("id", "connectionId", "hiddenAt")
				.where((fields, functions) => functions.eq(fields.userId, userId))
				.build(),
		)
	).filter(person => !person.hiddenAt);
	const balances = await Promise.all(
		people.map(async person => {
			const connection = person.connectionId
				? await queryFirst(
						db.sql.public.DebtConnection.select("id", "status")
							.where((fields, functions) => functions.eq(fields.id, person.connectionId!))
							.limit(1)
							.build(),
					)
				: undefined;
			const events =
				connection?.status === "ACCEPTED"
					? await queryRows(
							db.sql.public.DebtEvent.select("id", "createdByUserId", "effect")
								.where((fields, functions) =>
									functions.and(
										functions.eq(fields.connectionId, connection.id as never),
										functions.eq(fields.deletedAt, null),
									),
								)
								.build(),
						)
					: await queryRows(
							db.sql.public.DebtEvent.select("id", "createdByUserId", "effect")
								.where((fields, functions) =>
									functions.and(
										functions.eq(fields.debtPersonId, person.id as never),
										functions.eq(fields.deletedAt, null),
									),
								)
								.build(),
						);
			return events.reduce(
				(sum, event) =>
					sum + (event.createdByUserId === userId ? Number(event.effect) : -Number(event.effect)),
				0,
			);
		}),
	);
	return balances.reduce(
		(result, balance) => {
			if (balance > 0) result.owedToMe += balance;
			if (balance < 0) result.iOwe += Math.abs(balance);
			return result;
		},
		{ iOwe: 0, owedToMe: 0 },
	);
}
