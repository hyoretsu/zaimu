import { fromMinorUnits, toMinorUnits } from "@zaimu/finance/money";
import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { assertSupportedCurrency, defaultCurrency } from "~/modules/currencies/application/currency-defaults";
import {
	createDebtEvent,
	getAccessibleDebtEvent,
	getOwnedDebtPerson,
	normalizeDebtPersonName,
	resolveDebtPersonConnection,
} from "~/modules/debts/application";
import { calculateDebtSplitOrThrow } from "~/modules/debts/application/debt-splits";
import { sendDebtInvitationEmail } from "~/modules/debts/application/email";
import {
	decodePaginationCursor,
	encodePaginationCursor,
	paginationFilterHash,
} from "~/shared/application/pagination-cursor";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { db, executeStatement, queryFirst, queryRows } from "~/shared/infra/sql";
import { requirePendingInvitationRecipient } from "./debt-invitation";
import { normalizeDebtLedgerPerson } from "./debt-ledger-person";
import {
	DebtConnectionReturn,
	DebtEventPageReturn,
	DebtInvitationPreviewReturn,
	DebtInvitationReturn,
	DebtLedgerReturn,
	DebtMutationEventReturn,
	DebtMutationEventsReturn,
	DebtPersonReturn,
	DebtSuccessReturn,
	DebtSummaryReturn,
} from "./DebtsDTO";
import { DebtSplitInputDTO } from "./DebtSplitsDTO";

const PersonIdParams = t.Object({ id: t.String({ maxLength: 36, minLength: 1 }) });
const EventIdParams = t.Object({ eventId: t.String({ maxLength: 36, minLength: 1 }) });
type DebtConnectionState = "PENDING" | "ACCEPTED" | "DECLINED";
type DebtEventType = "ORIGIN" | "TRANSACTION" | "PURCHASE" | "MIGRATED_SETTLEMENT";
interface DebtEventCursor {
	date: null | string;
	id: string;
}

const isDebtEventCursor = (value: unknown): value is DebtEventCursor => {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return (
		(candidate.date === null || typeof candidate.date === "string") && typeof candidate.id === "string"
	);
};

async function findOrCreatePerson(userId: string, name: string) {
	const displayName = name.trim().replace(/\s+/g, " ");
	if (!displayName) throw new HttpException("Informe o nome da pessoa", 400);
	const normalizedName = normalizeDebtPersonName(displayName);
	const existing = await queryFirst(
		db.sql.public.DebtPerson.select("id", "name", "normalizedName", "connectionId", "hiddenAt")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.userId, userId),
					functions.eq(fields.normalizedName, normalizedName),
				),
			)
			.limit(1)
			.build(),
	);
	if (existing) {
		if (existing.hiddenAt) {
			await executeStatement(
				db.sql.public.DebtPerson.update({ hiddenAt: null, updatedAt: new Date() })
					.where((fields, functions) => functions.eq(fields.id, existing.id))
					.build(),
			);
		}
		return { ...existing, hiddenAt: null };
	}
	const person = await queryFirst(
		db.sql.public.DebtPerson.insert([{ name: displayName, normalizedName, userId }])
			.returning("id", "name", "normalizedName", "connectionId", "hiddenAt")
			.build(),
	);
	if (!person) throw new HttpException("Pessoa não criada", 500);
	return person;
}

async function getConnection(connectionId: string | null | undefined) {
	if (!connectionId) return undefined;
	const connection = await queryFirst(
		db.sql.public.DebtConnection.select("id", "requesterId", "recipientId", "status")
			.where((fields, functions) => functions.eq(fields.id, connectionId))
			.limit(1)
			.build(),
	);
	return connection ? { ...connection, status: connection.status as DebtConnectionState } : undefined;
}

async function getPeopleLedger(userId: string) {
	const ownedPeople = await queryRows(
		db.sql.public.DebtPerson.select("id", "name", "connectionId")
			.where((fields, functions) =>
				functions.and(functions.eq(fields.userId, userId), functions.eq(fields.hiddenAt, null)),
			)
			.orderBy("name", { direction: "asc" })
			.orderBy("id", { direction: "asc" })
			.build(),
	);
	if (!ownedPeople.length) return [];
	const connectionIds = ownedPeople.flatMap(person => (person.connectionId ? [person.connectionId] : []));
	const connections = connectionIds.length
		? await queryRows(
				db.sql.public.DebtConnection.select("id", "status", "requesterId", "recipientId")
					.where((fields, functions) => functions.in(fields.id, connectionIds))
					.build(),
			)
		: [];
	const linkedIds = [
		...new Set(
			connections.map(connection =>
				connection.requesterId === userId ? connection.recipientId : connection.requesterId,
			),
		),
	];
	const users = linkedIds.length
		? await queryRows(
				db.sql.public.user
					.select("id", "email")
					.where((fields, functions) => functions.in(fields.id, linkedIds))
					.build(),
			)
		: [];
	const acceptedIds = connections
		.filter(connection => connection.status === "ACCEPTED")
		.map(connection => connection.id);
	// Aggregate in PostgreSQL before combining viewer-relative signs in integer minor units.
	const totals = await queryRows(
		db.sql.public.DebtEvent.select("debtPersonId", "connectionId", "currency", "createdByUserId")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.deletedAt, null),
					functions.or(
						functions.in(
							fields.debtPersonId,
							ownedPeople.map(person => person.id),
						),
						...(acceptedIds.length ? [functions.in(fields.connectionId, acceptedIds)] : []),
					),
				),
			)
			.select((fields, functions) => ({ balance: functions.sum(fields.effect) }))
			.groupBy("debtPersonId", "connectionId", "currency", "createdByUserId")
			.build(),
	);
	const people = ownedPeople.flatMap(person => {
		const connection = connections.find(candidate => candidate.id === person.connectionId);
		const accountId =
			connection &&
			(connection.requesterId === userId ? connection.recipientId : connection.requesterId);
		const balances = new Map<string, number>();
		for (const total of totals) {
			if (
				connection?.status === "ACCEPTED"
					? total.connectionId !== connection.id
					: total.debtPersonId !== person.id
			)
				continue;
			const units = toMinorUnits(Number(total.balance ?? 0), total.currency, -Number.MAX_SAFE_INTEGER);
			balances.set(
				total.currency,
				(balances.get(total.currency) ?? 0) + (total.createdByUserId === userId ? units : -units),
			);
		}
		if (!balances.size) balances.set("BRL", 0);
		return [...balances].map(([currency, balance]) => ({
			accountEmail: users.find(user => user.id === accountId)?.email ?? null,
			balance: fromMinorUnits(balance, currency),
			connectionStatus: (connection?.status ?? null) as DebtConnectionState | null,
			currency,
			id: person.id,
			name: person.name,
		}));
	});
	const grouped = new Map<
		string,
		ReturnType<typeof normalizeDebtLedgerPerson<(typeof people)[number]>> & {
			balances: { currency: string; amount: number }[];
		}
	>();
	for (const row of people) {
		const person = grouped.get(row.id) ?? { ...normalizeDebtLedgerPerson(row), balance: 0, balances: [] };
		person.balances.push({ amount: Number(row.balance), currency: row.currency });
		if (row.currency === "BRL") person.balance = Number(row.balance);
		grouped.set(row.id, person);
	}
	return [...grouped.values()];
}

export async function getPersonEventPage(
	userId: string,
	personId: string,
	cursorValue?: string,
	pageLimit = 50,
	previewPerson?: { id: string; connectionId: null; invitationId: string },
) {
	const person = previewPerson ?? (await getOwnedDebtPerson(personId, userId));
	const connection = await getConnection(person.connectionId);
	const connectionId = connection?.status === "ACCEPTED" ? connection.id : null;
	const filterHash = paginationFilterHash(userId, {
		connectionId,
		invitationId: previewPerson?.invitationId,
		personId,
	});
	const cursor = decodePaginationCursor(cursorValue, filterHash, isDebtEventCursor);
	// Only the raw columns are selected here; the viewer-relative effect and the per-event description/time
	// CASE/COALESCE logic are applied below because the builder has no CASE/COALESCE/NULLIF.
	const creator = db.sql.public.user.select("id", "name").as("creator");
	const transactionLink = db.sql.public.DebtTransactionLink.select(
		"eventId",
		"isCreator",
		"transactionId",
	).as("transactionLink");
	const sourceTransaction = db.sql.public.Transaction.select("id", "description", "time", "type").as(
		"sourceTransaction",
	);
	const purchaseLink = db.sql.public.DebtPurchaseLink.select("creditPurchaseId", "eventId", "isCreator").as(
		"purchaseLink",
	);
	const purchaseReference = db.sql.public.CreditEntryReference.select("id", "purchaseId", "refundId").as(
		"purchaseReference",
	);
	const purchase = db.sql.public.CreditPurchaseRecord.select("id", "description", "storeName", "time").as(
		"purchase",
	);
	const refund = db.sql.public.CreditRefundRecord.select("id", "time").as("refund");
	const purchaseSplit = db.sql.public.DebtSplit.select("creditPurchaseId", "id", "userId").as(
		"purchaseSplit",
	);
	const purchaseParticipant = db.sql.public.DebtSplitParticipant.select(
		"debtPersonId",
		"debtSplitId",
		"description",
	).as("purchaseParticipant");
	const cursorDate = cursor?.date ? cursor.date.slice(0, 10) : null;
	const cursorId = cursor?.id ?? "";
	const rows = await queryRows(
		db.sql.public.DebtEvent.innerJoin(creator, (fields, functions) =>
			functions.eq(fields.creator.id, fields.DebtEvent.createdByUserId),
		)
			.outerLeftJoin(transactionLink, (fields, functions) =>
				functions.and(
					functions.eq(fields.transactionLink.eventId, fields.DebtEvent.id),
					functions.eq(fields.transactionLink.isCreator, true),
				),
			)
			.outerLeftJoin(sourceTransaction, (fields, functions) =>
				functions.eq(fields.sourceTransaction.id, fields.transactionLink.transactionId),
			)
			.outerLeftJoin(purchaseLink, (fields, functions) =>
				functions.and(
					functions.eq(fields.purchaseLink.eventId, fields.DebtEvent.id),
					functions.eq(fields.purchaseLink.isCreator, true),
				),
			)
			.outerLeftJoin(purchaseReference, (fields, functions) =>
				functions.eq(fields.purchaseReference.id, fields.purchaseLink.creditPurchaseId),
			)
			.outerLeftJoin(purchase, (fields, functions) =>
				functions.eq(fields.purchase.id, fields.purchaseReference.purchaseId),
			)
			.outerLeftJoin(refund, (fields, functions) =>
				functions.eq(fields.refund.id, fields.purchaseReference.refundId),
			)
			.outerLeftJoin(purchaseSplit, (fields, functions) =>
				functions.and(
					functions.eq(fields.purchaseSplit.creditPurchaseId, fields.purchase.id),
					functions.eq(fields.purchaseSplit.userId, fields.DebtEvent.createdByUserId),
				),
			)
			.outerLeftJoin(purchaseParticipant, (fields, functions) =>
				functions.and(
					functions.eq(fields.purchaseParticipant.debtSplitId, fields.purchaseSplit.id),
					functions.eq(fields.purchaseParticipant.debtPersonId, fields.DebtEvent.debtPersonId),
				),
			)
			.select(fields => ({
				amount: fields.DebtEvent.amount,
				createdByName: fields.creator.name,
				createdByUserId: fields.DebtEvent.createdByUserId,
				currency: fields.DebtEvent.currency,
				date: fields.DebtEvent.date,
				description: fields.DebtEvent.description,
				dueDate: fields.DebtEvent.dueDate,
				effect: fields.DebtEvent.effect,
				id: fields.DebtEvent.id,
				kind: fields.DebtEvent.kind,
				participantDescription: fields.purchaseParticipant.description,
				purchaseDescription: fields.purchase.description,
				purchaseId: fields.purchase.id,
				purchaseStoreName: fields.purchase.storeName,
				purchaseTime: fields.purchase.time,
				refundTime: fields.refund.time,
				sourceDescription: fields.sourceTransaction.description,
				sourceTime: fields.sourceTransaction.time,
				sourceType: fields.sourceTransaction.type,
			}))
			.where((fields, functions) =>
				functions.and(
					connectionId
						? functions.eq(fields.DebtEvent.connectionId, connectionId)
						: functions.eq(fields.DebtEvent.debtPersonId, personId),
					functions.eq(fields.DebtEvent.deletedAt, null),
					...(cursorId
						? [
								cursorDate === null
									? functions.and(
											functions.eq(fields.DebtEvent.date, null),
											functions.lt(fields.DebtEvent.id, cursorId),
										)
									: functions.or(
											functions.eq(fields.DebtEvent.date, null),
											functions.lt(fields.DebtEvent.date, cursorDate),
											functions.and(
												functions.eq(fields.DebtEvent.date, cursorDate),
												functions.lt(fields.DebtEvent.id, cursorId),
											),
										),
							]
						: []),
				),
			)
			.orderBy(fields => fields.DebtEvent.date, { direction: "desc", nulls: "last" })
			.orderBy(fields => fields.DebtEvent.id, { direction: "desc" })
			.limit(pageLimit + 1)
			.build(),
	);
	const hasMore = rows.length > pageLimit;
	const dateOnly = (value: null | string) => (value ? new Date(`${value}T00:00:00.000Z`) : null);
	const items = rows.slice(0, pageLimit).map(row => {
		const createdByMe = row.createdByUserId === userId;
		const isIncome = row.sourceType === "INCOME";
		const description = isIncome
			? row.sourceDescription
			: row.purchaseId
				? row.participantDescription || row.purchaseDescription || row.purchaseStoreName || "Compra"
				: row.description || row.sourceDescription || null;
		return {
			amount: Number(row.amount),
			createdByMe,
			createdByName: row.createdByName,
			createdByUserId: row.createdByUserId,
			currency: row.currency,
			date: dateOnly(row.date),
			description: description ?? null,
			dueDate: dateOnly(row.dueDate),
			effect: createdByMe ? Number(row.effect) : 0 - Number(row.effect),
			id: row.id,
			kind: row.kind as DebtEventType,
			time: row.sourceTime ?? row.refundTime ?? row.purchaseTime ?? null,
		};
	});
	const last = items.at(-1);
	return {
		hasMore,
		items,
		nextCursor:
			hasMore && last
				? encodePaginationCursor({
						filterHash,
						value: { date: last.date?.toISOString() ?? null, id: last.id },
					})
				: null,
	};
}

export async function getInvitationPreview(
	connectionId: string,
	requesterId: string,
	viewerId: string,
	cursor?: string,
	limit = 50,
) {
	const people = await queryRows(
		db.sql.public.DebtPerson.select("id")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.connectionId, connectionId),
					functions.eq(fields.userId, requesterId),
					functions.eq(fields.hiddenAt, null),
				),
			)
			.orderBy("id", { direction: "asc" })
			.build(),
	);
	// Aggregate per creator in PostgreSQL, then apply the viewer-relative sign per event creator in integer
	// minor units (equivalent to SUM(CASE WHEN createdByUserId = viewer THEN effect ELSE -effect END)).
	const totals = people.length
		? await queryRows(
				db.sql.public.DebtEvent.select("debtPersonId", "currency", "createdByUserId")
					.where((fields, functions) =>
						functions.and(
							functions.in(
								fields.debtPersonId,
								people.map(candidate => candidate.id),
							),
							functions.eq(fields.deletedAt, null),
						),
					)
					.select((fields, functions) => ({
						balance: functions.sum(fields.effect),
						eventCount: functions.count(fields.id),
					}))
					.groupBy("debtPersonId", "currency", "createdByUserId")
					.build(),
			)
		: [];
	const rows = people.flatMap(candidate => {
		const byCurrency = new Map<string, { balance: number; eventCount: number }>();
		for (const total of totals.filter(entry => entry.debtPersonId === candidate.id)) {
			const entry = byCurrency.get(total.currency) ?? { balance: 0, eventCount: 0 };
			const units = toMinorUnits(Number(total.balance), total.currency, -Number.MAX_SAFE_INTEGER);
			entry.balance += total.createdByUserId === viewerId ? units : -units;
			entry.eventCount += Number(total.eventCount);
			byCurrency.set(total.currency, entry);
		}
		if (!byCurrency.size) byCurrency.set("BRL", { balance: 0, eventCount: 0 });
		return [...byCurrency].map(([currency, entry]) => ({
			balance: fromMinorUnits(entry.balance, currency),
			currency,
			eventCount: entry.eventCount,
			id: candidate.id,
		}));
	});
	const person = rows[0];
	if (!person)
		return { balance: 0, balances: [], eventCount: 0, hasMore: false, items: [], nextCursor: null };
	const page = await getPersonEventPage(viewerId, person.id, cursor, limit, {
		connectionId: null,
		id: person.id,
		invitationId: connectionId,
	});
	return {
		balance: Number(rows.find(row => row.currency === "BRL")?.balance ?? 0),
		balances: rows
			.filter(row => Number(row.eventCount) > 0)
			.map(row => ({ amount: Number(row.balance), currency: row.currency })),
		eventCount: rows.reduce((sum, row) => sum + Number(row.eventCount), 0),
		...page,
	};
}

export const DebtsController = new Elysia({ prefix: "/debts" })
	.get(
		"/",
		async ({ request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				"debts:overview",
				{ version: 3 },
				async () => {
					const people = await getPeopleLedger(userId);
					const totals = people.reduce(
						(result, person) => {
							if (person.balance > 0) result.owedToMe += person.balance;
							if (person.balance < 0) result.iOwe += Math.abs(person.balance);
							result.net += person.balance;
							return result;
						},
						{ iOwe: 0, net: 0, owedToMe: 0 },
					);
					const native = new Map<
						string,
						{ currency: string; iOwe: number; net: number; owedToMe: number }
					>();
					for (const person of people)
						for (const balance of person.balances) {
							const total = native.get(balance.currency) ?? {
								currency: balance.currency,
								iOwe: 0,
								net: 0,
								owedToMe: 0,
							};
							total.net += balance.amount;
							if (balance.amount > 0) total.owedToMe += balance.amount;
							if (balance.amount < 0) total.iOwe -= balance.amount;
							native.set(balance.currency, total);
						}
					return {
						people,
						totals,
						totalsByCurrency: [...native.values()].sort((a, b) =>
							a.currency.localeCompare(b.currency),
						),
					};
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			return cached.value;
		},
		{ detail: { operationId: "getDebts", tags: ["Debts"] }, response: DebtLedgerReturn },
	)
	.get(
		"/people/:id/events",
		async ({ params, query, request, set }) => {
			const userId = await requireUserId(request);
			const limit = Math.min(query.limit ?? 50, 100);
			const cached = await distributedCache.remember(
				userId,
				"debts:events",
				{ cursor: query.cursor, limit, personId: params.id },
				() => getPersonEventPage(userId, params.id, query.cursor, limit),
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			return cached.value;
		},
		{
			detail: { operationId: "getDebtsPeopleByIdEvents", tags: ["Debts"] },
			params: PersonIdParams,
			query: t.Object({
				cursor: t.Optional(t.String()),
				limit: t.Optional(t.Integer({ maximum: 100, minimum: 1 })),
			}),
			response: DebtEventPageReturn,
		},
	)
	.get(
		"/summary",
		async ({ request }) => {
			const userId = await requireUserId(request);
			return getPeopleLedger(userId);
		},
		{ detail: { operationId: "getDebtsSummary", tags: ["Debts"] }, response: DebtSummaryReturn },
	)
	.get(
		"/invitations",
		async ({ request }) => {
			const userId = await requireUserId(request);
			const requester = db.sql.public.user.select("id", "name", "email").as("requester");
			const recipient = db.sql.public.user.select("id", "name", "email").as("recipient");
			const invitations = await queryRows(
				db.sql.public.DebtConnection.innerJoin(requester, (fields, functions) =>
					functions.eq(fields.DebtConnection.requesterId, fields.requester.id),
				)
					.innerJoin(recipient, (fields, functions) =>
						functions.eq(fields.DebtConnection.recipientId, fields.recipient.id),
					)
					.select(fields => ({
						createdAt: fields.DebtConnection.createdAt,
						id: fields.DebtConnection.id,
						recipientId: fields.DebtConnection.recipientId,
						recipientName: fields.recipient.name,
						requesterId: fields.DebtConnection.requesterId,
						requesterName: fields.requester.name,
						status: fields.DebtConnection.status,
					}))
					.where((fields, functions) =>
						functions.or(
							functions.eq(fields.DebtConnection.requesterId, userId),
							functions.eq(fields.DebtConnection.recipientId, userId),
						),
					)
					.orderBy(fields => fields.DebtConnection.createdAt, { direction: "desc" })
					.build(),
			);
			return invitations.map(invitation => ({
				counterpartyName:
					invitation.requesterId === userId ? invitation.recipientName : invitation.requesterName,
				createdAt: invitation.createdAt,
				direction: invitation.requesterId === userId ? ("SENT" as const) : ("RECEIVED" as const),
				id: invitation.id,
				status: invitation.status as DebtConnectionState,
			}));
		},
		{
			detail: { operationId: "getDebtsInvitations", tags: ["Debts"] },
			response: t.Array(DebtInvitationReturn),
		},
	)
	.get(
		"/invitations/:id/preview",
		async ({ params, query, request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				"debts:events",
				{ cursor: query.cursor, invitationId: params.id, limit: query.limit ?? 50, version: 2 },
				async () => {
					const connection = await queryFirst(
						db.sql.public.DebtConnection.select("id", "requesterId", "recipientId", "status")
							.where((fields, functions) =>
								functions.and(
									functions.eq(fields.id, params.id),
									functions.eq(fields.recipientId, userId),
								),
							)
							.limit(1)
							.build(),
					);
					requirePendingInvitationRecipient(connection, userId);
					return getInvitationPreview(
						connection.id,
						connection.requesterId,
						userId,
						query.cursor,
						query.limit ?? 50,
					);
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return undefined as never;
			}
			return cached.value;
		},
		{
			detail: { operationId: "getDebtsInvitationsByIdPreview", tags: ["Debts"] },
			params: PersonIdParams,
			query: t.Object({
				cursor: t.Optional(t.String()),
				limit: t.Optional(t.Integer({ maximum: 100, minimum: 1 })),
			}),
			response: DebtInvitationPreviewReturn,
		},
	)

	.post(
		"/people",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			return findOrCreatePerson(userId, body.name);
		},
		{
			body: t.Object({ name: t.String({ maxLength: 100, minLength: 1 }) }),
			detail: { operationId: "postDebtsPeople", tags: ["Debts"] },
			response: DebtPersonReturn,
		},
	)
	.patch(
		"/people/:id",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			const person = await getOwnedDebtPerson(params.id, userId);
			const name = body.name.trim().replace(/\s+/g, " ");
			if (!name) throw new HttpException("Nome obrigatório", 400);
			await executeStatement(
				db.sql.public.DebtPerson.update({
					connectionId: body.accountEmail === null ? null : person.connectionId,
					name,
					normalizedName: normalizeDebtPersonName(name),
					updatedAt: new Date(),
				})
					.where((fields, functions) => functions.eq(fields.id, person.id))
					.build(),
			);
			return { success: true };
		},
		{
			body: t.Object({
				accountEmail: t.Optional(t.Union([t.String({ format: "email", maxLength: 320 }), t.Null()])),
				name: t.String({ maxLength: 100, minLength: 1 }),
			}),
			detail: { operationId: "patchDebtsPeopleById", tags: ["Debts"] },
			params: PersonIdParams,
			response: DebtSuccessReturn,
		},
	)
	.post(
		"/people/:id/invite",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			const person = await getOwnedDebtPerson(params.id, userId);
			const recipient = await queryFirst(
				db.sql.public.user
					.select("id", "name", "email", "emailVerified")
					.where((fields, functions) => functions.eq(fields.email, body.email.trim().toLowerCase()))
					.limit(1)
					.build(),
			);
			if (!recipient?.emailVerified) throw new HttpException("Conta Zaimu não encontrada", 404);
			if (recipient.id === userId)
				throw new HttpException("Você não pode associar sua própria conta", 400);
			const existing = await queryFirst(
				db.sql.public.DebtConnection.select("id", "requesterId", "recipientId", "status")
					.where((fields, functions) =>
						functions.or(
							functions.and(
								functions.eq(fields.requesterId, userId),
								functions.eq(fields.recipientId, recipient.id),
							),
							functions.and(
								functions.eq(fields.requesterId, recipient.id),
								functions.eq(fields.recipientId, userId),
							),
						),
					)
					.limit(1)
					.build(),
			);
			if (existing?.status === "ACCEPTED") throw new HttpException("Contas já associadas", 409);
			if (existing?.status === "PENDING")
				return { ...existing, status: existing.status as DebtConnectionState };
			const connection = existing
				? await queryFirst(
						db.sql.public.DebtConnection.update({
							recipientId: recipient.id,
							requesterId: userId,
							respondedAt: null,
							status: "PENDING",
							updatedAt: new Date(),
						})
							.where((fields, functions) => functions.eq(fields.id, existing.id))
							.returning("id", "requesterId", "recipientId", "status")
							.build(),
					)
				: await queryFirst(
						db.sql.public.DebtConnection.insert([
							{ recipientId: recipient.id, requesterId: userId },
						])
							.returning("id", "requesterId", "recipientId", "status")
							.build(),
					);
			if (!connection) throw new HttpException("Convite não criado", 500);
			await executeStatement(
				db.sql.public.DebtPerson.update({ connectionId: connection.id, updatedAt: new Date() })
					.where((fields, functions) => functions.eq(fields.id, person.id))
					.build(),
			);
			const requester = await queryFirst(
				db.sql.public.user
					.select("name")
					.where((fields, functions) => functions.eq(fields.id, userId))
					.limit(1)
					.build(),
			);
			await sendDebtInvitationEmail({
				recipientEmail: recipient.email,
				requesterName: requester?.name ?? "Uma pessoa no Zaimu",
			});
			return {
				...connection,
				recipientName: recipient.name,
				status: connection.status as DebtConnectionState,
			};
		},
		{
			body: t.Object({ email: t.String({ format: "email", maxLength: 320 }) }),
			detail: { operationId: "postDebtsPeopleByIdInvite", tags: ["Debts"] },
			params: PersonIdParams,
			response: DebtConnectionReturn,
		},
	)
	.post(
		"/invitations/:id/accept",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			const connection = await queryFirst(
				db.sql.public.DebtConnection.select("id", "requesterId", "recipientId", "status")
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.id, params.id),
							functions.eq(fields.recipientId, userId),
						),
					)
					.limit(1)
					.build(),
			);
			if (connection?.status !== "PENDING") throw new HttpException("Convite não encontrado", 404);
			const requester = await queryFirst(
				db.sql.public.user
					.select("name")
					.where((fields, functions) => functions.eq(fields.id, connection.requesterId))
					.limit(1)
					.build(),
			);
			const recipientPerson = body.personId
				? await getOwnedDebtPerson(body.personId, userId)
				: await findOrCreatePerson(userId, requester?.name ?? "Usuário Zaimu");
			await executeStatement(
				db.sql.public.DebtPerson.update({ connectionId: connection.id, updatedAt: new Date() })
					.where((fields, functions) => functions.eq(fields.id, recipientPerson.id))
					.build(),
			);
			const connectedPeople = await queryRows(
				db.sql.public.DebtPerson.select("id")
					.where((fields, functions) => functions.eq(fields.connectionId, connection.id))
					.build(),
			);
			if (connectedPeople.length) {
				await executeStatement(
					db.sql.public.DebtEvent.update({ connectionId: connection.id, updatedAt: new Date() })
						.where((fields, functions) =>
							functions.in(
								fields.debtPersonId,
								connectedPeople.map(person => person.id),
							),
						)
						.build(),
				);
			}
			await executeStatement(
				db.sql.public.DebtConnection.update({
					respondedAt: new Date(),
					status: "ACCEPTED",
					updatedAt: new Date(),
				})
					.where((fields, functions) => functions.eq(fields.id, connection.id))
					.build(),
			);
			return { success: true };
		},
		{
			body: t.Object({ personId: t.Optional(t.String({ maxLength: 36, minLength: 1 })) }),
			detail: { operationId: "postDebtsInvitationsByIdAccept", tags: ["Debts"] },
			params: PersonIdParams,
			response: DebtSuccessReturn,
		},
	)
	.post(
		"/invitations/:id/decline",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const updated = await queryFirst(
				db.sql.public.DebtConnection.update({
					respondedAt: new Date(),
					status: "DECLINED",
					updatedAt: new Date(),
				})
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.id, params.id),
							functions.eq(fields.recipientId, userId),
						),
					)
					.returning("id")
					.build(),
			);
			if (!updated) throw new HttpException("Convite não encontrado", 404);
			return { success: true };
		},
		{
			detail: { operationId: "postDebtsInvitationsByIdDecline", tags: ["Debts"] },
			params: PersonIdParams,
			response: DebtSuccessReturn,
		},
	)
	.post(
		"/events",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			const split =
				body.debtSplit ??
				(body.personId
					? {
							mode: "SHARES" as const,
							ownerShares: null,
							participants: [{ debtPersonId: body.personId, shares: 1 }],
						}
					: undefined);
			if (!split) throw new HttpException("Informe ao menos uma pessoa", 400);
			const currency = await assertSupportedCurrency(
				body.currency ?? (await defaultCurrency(userId, request.headers.get("X-Currency"))),
			);
			const calculated = calculateDebtSplitOrThrow(body.amount, split, currency);
			await Promise.all(
				calculated.participants.map(participant =>
					getOwnedDebtPerson(participant.debtPersonId, userId),
				),
			);
			return Promise.all(
				calculated.participants.map(participant =>
					createDebtEvent({
						amount: participant.amount,
						createdByUserId: userId,
						currency,
						date: body.date,
						debtPersonId: participant.debtPersonId,
						description: body.description,
						dueDate: body.dueDate,
						effect: body.isOwedToMe ? participant.amount : -participant.amount,
						kind: "ORIGIN",
					}),
				),
			);
		},
		{
			body: t.Object({
				amount: t.Number({ exclusiveMinimum: 0 }),
				currency: t.Optional(t.String({ pattern: "^[A-Z]{3}$" })),
				date: t.Optional(t.Nullable(t.String())),
				debtSplit: t.Optional(DebtSplitInputDTO),
				description: t.Optional(t.String({ maxLength: 1000 })),
				dueDate: t.Optional(t.String()),
				isOwedToMe: t.Boolean(),
				personId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
			}),
			detail: { operationId: "postDebtsEvents", tags: ["Debts"] },
			response: DebtMutationEventsReturn,
		},
	)
	.post(
		"/",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			const person = await findOrCreatePerson(userId, body.personName);
			return createDebtEvent({
				amount: body.amount,
				createdByUserId: userId,
				currency: await assertSupportedCurrency(
					body.currency ?? (await defaultCurrency(userId, request.headers.get("X-Currency"))),
				),
				date: body.date,
				debtPersonId: person.id,
				description: body.description,
				dueDate: body.dueDate,
				effect: (body.isOwedToMe ?? true) ? body.amount : -body.amount,
				kind: "ORIGIN",
			});
		},
		{
			body: t.Object({
				amount: t.Number({ exclusiveMinimum: 0 }),
				currency: t.Optional(t.String({ pattern: "^[A-Z]{3}$" })),
				date: t.Optional(t.Nullable(t.String())),
				description: t.Optional(t.String({ maxLength: 1000 })),
				dueDate: t.Optional(t.String()),
				isOwedToMe: t.Optional(t.Boolean()),
				personName: t.String({ maxLength: 100, minLength: 1 }),
			}),
			detail: { operationId: "postDebts", tags: ["Debts"] },
			response: DebtMutationEventReturn,
		},
	)
	.patch(
		"/events/:eventId",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			const event = await getAccessibleDebtEvent(params.eventId, userId);
			if (event.createdByUserId !== userId || event.kind !== "ORIGIN")
				throw new HttpException("Somente a origem manual pode ser editada pelo autor", 403);
			const personId = body.personId ?? event.debtPersonId;
			if (!personId) throw new HttpException("Pessoa da dívida não encontrada", 404);
			const { connectionId } = await resolveDebtPersonConnection(personId, userId);
			const amount = body.amount ?? Number(event.amount);
			if (body.currency && body.currency !== event.currency)
				throw new HttpException("Moeda do lançamento existente não pode ser alterada", 409);
			try {
				toMinorUnits(amount, event.currency, 1);
			} catch {
				throw new HttpException("Valor incompatível com a moeda", 400);
			}
			const direction = Number(event.effect) >= 0 ? 1 : -1;
			const updated = await queryFirst(
				db.sql.public.DebtEvent.update({
					amount: String(amount),
					connectionId: connectionId ?? null,
					date: body.date === undefined ? event.date : (body.date ?? null),
					debtPersonId: personId,
					description: body.description,
					dueDate: body.dueDate ?? null,
					effect: String(
						(body.isOwedToMe === undefined ? direction : body.isOwedToMe ? 1 : -1) * amount,
					),
					updatedAt: new Date(),
				})
					.where((fields, functions) => functions.eq(fields.id, event.id))
					.returning(
						"id",
						"amount",
						"currency",
						"effect",
						"date",
						"description",
						"kind",
						"debtPersonId",
					)
					.build(),
			);
			return updated
				? {
						...updated,
						date: updated.date ? new Date(updated.date) : null,
						kind: updated.kind as DebtEventType,
					}
				: updated;
		},
		{
			body: t.Object({
				amount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
				currency: t.Optional(t.String({ pattern: "^[A-Z]{3}$" })),
				date: t.Optional(t.Nullable(t.String())),
				description: t.Optional(t.String({ maxLength: 1000 })),
				dueDate: t.Optional(t.String()),
				isOwedToMe: t.Optional(t.Boolean()),
				personId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
			}),
			detail: { operationId: "patchDebtsEventsByEventId", tags: ["Debts"] },
			params: EventIdParams,
			response: DebtMutationEventReturn,
		},
	)
	.delete(
		"/people/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const person = await getOwnedDebtPerson(params.id, userId);
			await executeStatement(
				db.sql.public.DebtPerson.update({ hiddenAt: new Date(), updatedAt: new Date() })
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.build(),
			);
			return { success: true };
		},
		{
			detail: { operationId: "deleteDebtsPeopleById", tags: ["Debts"] },
			params: PersonIdParams,
			response: DebtSuccessReturn,
		},
	)
	.delete(
		"/events/:eventId",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const event = await getAccessibleDebtEvent(params.eventId, userId);
			if (event.createdByUserId !== userId || event.kind !== "ORIGIN")
				throw new HttpException("Somente o criador pode excluir um lançamento manual", 403);
			await executeStatement(
				db.sql.public.DebtEvent.update({ deletedAt: new Date(), updatedAt: new Date() })
					.where((fields, functions) => functions.eq(fields.id, event.id))
					.build(),
			);
			return { success: true };
		},
		{
			detail: { operationId: "deleteDebtsEventsByEventId", tags: ["Debts"] },
			params: EventIdParams,
			response: DebtSuccessReturn,
		},
	);
