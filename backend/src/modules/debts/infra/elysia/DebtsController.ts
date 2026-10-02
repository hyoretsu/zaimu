import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
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
import { db, executeStatement, queryFirst, queryRaw, queryRows } from "~/shared/infra/sql";
import { DebtSplitInputDTO } from "./DebtSplitsDTO";
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
import { requirePendingInvitationRecipient } from "./debt-invitation";
import { normalizeDebtLedgerPerson } from "./debt-ledger-person";

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
	return (candidate.date === null || typeof candidate.date === "string") && typeof candidate.id === "string";
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
	const people = await queryRaw<{
		accountEmail: null | string;
		balance: string;
		connectionStatus: DebtConnectionState | null;
		id: string;
		name: string;
	}>(
		`SELECT person."id", person."name", connection."status" AS "connectionStatus",
		        linked_user."email" AS "accountEmail",
		        COALESCE(SUM(CASE WHEN event."createdByUserId" = $1 THEN event."effect" ELSE -event."effect" END), 0) AS "balance"
		 FROM "public"."DebtPerson" person
		 LEFT JOIN "public"."DebtConnection" connection ON connection."id" = person."connectionId"
		 LEFT JOIN "public"."user" linked_user ON linked_user."id" = CASE
		   WHEN connection."requesterId" = $1 THEN connection."recipientId" ELSE connection."requesterId" END
		 LEFT JOIN "public"."DebtEvent" event ON
		   (connection."status" = 'ACCEPTED' AND event."connectionId" = connection."id") OR
		   (connection."status" IS DISTINCT FROM 'ACCEPTED' AND event."debtPersonId" = person."id")
		 WHERE person."userId" = $1 AND person."hiddenAt" IS NULL
		 GROUP BY person."id", person."name", connection."status", linked_user."email"
		 ORDER BY person."name" ASC, person."id" ASC`,
		[userId],
	);
	return people.map(normalizeDebtLedgerPerson);
}

async function getPersonEventPage(
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
	const rows = await queryRaw<{
		amount: string;
		createdByName: string;
		createdByUserId: string;
		date: Date | null;
		description: null | string;
		dueDate: Date | null;
		effect: string;
		id: string;
		kind: DebtEventType;
		time: null | string;
	}>(
		`SELECT event."id", event."amount", event."createdByUserId", creator."name" AS "createdByName",
		        event."date", event."dueDate", event."kind",
		        CASE WHEN event."createdByUserId" = $1 THEN event."effect" ELSE -event."effect" END AS "effect",
		        CASE WHEN income_transaction."id" IS NOT NULL THEN income_transaction."description"
		        WHEN purchase."id" IS NOT NULL THEN COALESCE(NULLIF(purchase_participant."description", ''), NULLIF(purchase."description", ''), NULLIF(purchase."storeName", ''), 'Compra')
		        ELSE COALESCE(NULLIF(event."description", ''), NULLIF(source_transaction."description", '')) END AS "description",
		        COALESCE(source_transaction."time", refund."time", purchase."time") AS "time"
		 FROM "public"."DebtEvent" event
		 JOIN "public"."user" creator ON creator."id" = event."createdByUserId"
		 LEFT JOIN "public"."DebtTransactionLink" transaction_link ON transaction_link."eventId" = event."id" AND transaction_link."isCreator" = true
		 LEFT JOIN "public"."Transaction" source_transaction ON source_transaction."id" = transaction_link."transactionId"
		 LEFT JOIN "public"."Transaction" income_transaction ON income_transaction."id" = transaction_link."transactionId" AND income_transaction."type" = 'INCOME'
		 LEFT JOIN "public"."DebtPurchaseLink" purchase_link ON purchase_link."eventId" = event."id" AND purchase_link."isCreator" = true
		 LEFT JOIN "public"."CreditEntryReference" purchase_reference ON purchase_reference."id" = purchase_link."creditPurchaseId"
		 LEFT JOIN "public"."CreditPurchaseRecord" purchase ON purchase."id" = purchase_reference."purchaseId"
		 LEFT JOIN "public"."CreditRefundRecord" refund ON refund."id" = purchase_reference."refundId"
		 LEFT JOIN "public"."DebtSplit" purchase_split ON purchase_split."creditPurchaseId"=purchase."id" AND purchase_split."userId"=event."createdByUserId"
		 LEFT JOIN "public"."DebtSplitParticipant" purchase_participant ON purchase_participant."debtSplitId"=purchase_split."id" AND purchase_participant."debtPersonId"=event."debtPersonId"
		 WHERE ${connectionId ? 'event."connectionId" = $2' : 'event."debtPersonId" = $2'}
		   AND ($4 = '' OR
		        ($3::date IS NULL AND event."date" IS NULL AND event."id" < $4) OR
		        ($3::date IS NOT NULL AND (event."date" IS NULL OR (event."date", event."id") < ($3::date, $4))))
		 ORDER BY event."date" DESC NULLS LAST, event."id" DESC
		 LIMIT $5`,
		[userId, connectionId ?? personId, cursor?.date ?? null, cursor?.id ?? "", pageLimit + 1],
	);
	const hasMore = rows.length > pageLimit;
	const items = rows.slice(0, pageLimit).map(row => ({
		...row,
		amount: Number(row.amount),
		createdByMe: row.createdByUserId === userId,
		effect: Number(row.effect),
	}));
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

async function getInvitationPreview(
	connectionId: string,
	requesterId: string,
	viewerId: string,
	cursor?: string,
	limit = 50,
) {
	const [person] = await queryRaw<{ id: string; balance: string; eventCount: string }>(
		`SELECT person."id", COALESCE(SUM(CASE WHEN event."createdByUserId"=$3 THEN event."effect" ELSE -event."effect" END),0) AS "balance", COUNT(event."id") AS "eventCount"
 FROM "DebtPerson" person LEFT JOIN "DebtEvent" event ON event."debtPersonId"=person."id"
 WHERE person."connectionId"=$1 AND person."userId"=$2 AND person."hiddenAt" IS NULL GROUP BY person."id"`,
		[connectionId, requesterId, viewerId],
	);
	if (!person) return { balance: 0, eventCount: 0, hasMore: false, items: [], nextCursor: null };
	const page = await getPersonEventPage(viewerId, person.id, cursor, limit, {
		connectionId: null,
		id: person.id,
		invitationId: connectionId,
	});
	return { balance: Number(person.balance), eventCount: Number(person.eventCount), ...page };
}

export const DebtsController = new Elysia({ prefix: "/debts" })
	.get(
		"/",
		async ({ request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(userId, "debts:overview", { version: 2 }, async () => {
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
				return { people, totals };
			});
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			return cached.value;
		},
		{ detail: { tags: ["Debts"] }, response: DebtLedgerReturn },
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
			detail: { tags: ["Debts"] },
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
		{ detail: { tags: ["Debts"] }, response: DebtSummaryReturn },
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
		{ detail: { tags: ["Debts"] }, response: t.Array(DebtInvitationReturn) },
	)
	.get(
		"/invitations/:id/preview",
		async ({ params, query, request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				"debts:events",
				{ cursor: query.cursor, invitationId: params.id, limit: query.limit ?? 50 },
				async () => {
					const connection = await queryFirst(
						db.sql.public.DebtConnection.select("id", "requesterId", "recipientId", "status")
							.where((fields, functions) =>
								functions.and(functions.eq(fields.id, params.id), functions.eq(fields.recipientId, userId)),
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
			detail: { tags: ["Debts"] },
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
			detail: { tags: ["Debts"] },
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
			detail: { tags: ["Debts"] },
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
			if (recipient.id === userId) throw new HttpException("Você não pode associar sua própria conta", 400);
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
						db.sql.public.DebtConnection.insert([{ recipientId: recipient.id, requesterId: userId }])
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
			detail: { tags: ["Debts"] },
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
						functions.and(functions.eq(fields.id, params.id), functions.eq(fields.recipientId, userId)),
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
			detail: { tags: ["Debts"] },
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
						functions.and(functions.eq(fields.id, params.id), functions.eq(fields.recipientId, userId)),
					)
					.returning("id")
					.build(),
			);
			if (!updated) throw new HttpException("Convite não encontrado", 404);
			return { success: true };
		},
		{ detail: { tags: ["Debts"] }, params: PersonIdParams, response: DebtSuccessReturn },
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
			const calculated = calculateDebtSplitOrThrow(body.amount, split);
			await Promise.all(
				calculated.participants.map(participant => getOwnedDebtPerson(participant.debtPersonId, userId)),
			);
			return Promise.all(
				calculated.participants.map(participant =>
					createDebtEvent({
						amount: participant.amount,
						createdByUserId: userId,
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
				date: t.Optional(t.Nullable(t.String())),
				debtSplit: t.Optional(DebtSplitInputDTO),
				description: t.Optional(t.String({ maxLength: 1000 })),
				dueDate: t.Optional(t.String()),
				isOwedToMe: t.Boolean(),
				personId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
			}),
			detail: { tags: ["Debts"] },
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
				date: t.Optional(t.Nullable(t.String())),
				description: t.Optional(t.String({ maxLength: 1000 })),
				dueDate: t.Optional(t.String()),
				isOwedToMe: t.Optional(t.Boolean()),
				personName: t.String({ maxLength: 100, minLength: 1 }),
			}),
			detail: { tags: ["Debts"] },
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
			const direction = Number(event.effect) >= 0 ? 1 : -1;
			const updated = await queryFirst(
				db.sql.public.DebtEvent.update({
					amount: String(amount),
					connectionId: connectionId ?? null,
					date: body.date === undefined ? event.date : body.date ? new Date(body.date) : null,
					debtPersonId: personId,
					description: body.description,
					dueDate: body.dueDate ? new Date(body.dueDate) : null,
					effect: String((body.isOwedToMe === undefined ? direction : body.isOwedToMe ? 1 : -1) * amount),
					updatedAt: new Date(),
				})
					.where((fields, functions) => functions.eq(fields.id, event.id))
					.returning("id", "amount", "effect", "date", "description", "kind", "debtPersonId")
					.build(),
			);
			return updated ? { ...updated, kind: updated.kind as DebtEventType } : updated;
		},
		{
			body: t.Object({
				amount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
				date: t.Optional(t.Nullable(t.String())),
				description: t.Optional(t.String({ maxLength: 1000 })),
				dueDate: t.Optional(t.String()),
				isOwedToMe: t.Optional(t.Boolean()),
				personId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
			}),
			detail: { tags: ["Debts"] },
			params: EventIdParams,
			response: DebtMutationEventReturn,
		},
	)
	.delete(
		"/people/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const person = await getOwnedDebtPerson(params.id, userId);
			if (person.connectionId) {
				await executeStatement(
					db.sql.public.DebtPerson.update({ hiddenAt: new Date(), updatedAt: new Date() })
						.where((fields, functions) => functions.eq(fields.id, params.id))
						.build(),
				);
				return { success: true };
			}
			await executeStatement(
				db.sql.public.DebtEvent.delete()
					.where((fields, functions) => functions.eq(fields.debtPersonId, params.id))
					.build(),
			);
			await executeStatement(
				db.sql.public.DebtPerson.delete()
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.build(),
			);
			return { success: true };
		},
		{ detail: { tags: ["Debts"] }, params: PersonIdParams, response: DebtSuccessReturn },
	)
	.delete(
		"/events/:eventId",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const event = await getAccessibleDebtEvent(params.eventId, userId);
			if (event.createdByUserId !== userId || event.kind !== "ORIGIN")
				throw new HttpException("Somente o criador pode excluir um lançamento manual", 403);
			await executeStatement(
				db.sql.public.DebtEvent.delete()
					.where((fields, functions) => functions.eq(fields.id, event.id))
					.build(),
			);
			return { success: true };
		},
		{ detail: { tags: ["Debts"] }, params: EventIdParams, response: DebtSuccessReturn },
	);
