import { t } from "elysia";

const Id = t.String({ maxLength: 36, minLength: 1 });
const NullableId = t.Union([Id, t.Null()]);
const NullableString = t.Union([t.String(), t.Null()]);
const ConnectionStatus = t.Union([t.Literal("PENDING"), t.Literal("ACCEPTED"), t.Literal("DECLINED")]);
const EventKind = t.Union([
	t.Literal("ORIGIN"),
	t.Literal("TRANSACTION"),
	t.Literal("PURCHASE"),
	t.Literal("MIGRATED_SETTLEMENT"),
]);

export const DebtEventReturn = t.Object({
	amount: t.Number(),
	createdByMe: t.Boolean(),
	createdByName: t.String(),
	createdByUserId: Id,
	currency: t.String(),
	date: t.Union([t.Date(), t.Null()]),
	description: NullableString,
	dueDate: t.Union([t.Date(), t.Null()]),
	effect: t.Number(),
	id: Id,
	kind: EventKind,
	time: NullableString,
});

export const DebtLedgerReturn = t.Object({
	people: t.Array(
		t.Object({
			accountEmail: t.Union([t.String({ format: "email" }), t.Null()]),
			balance: t.Number(),
			balances: t.Array(t.Object({ amount: t.Number(), currency: t.String() })),
			connectionStatus: t.Union([ConnectionStatus, t.Null()]),
			id: Id,
			isZaimuUser: t.Boolean(),
			name: t.String(),
		}),
	),
	totals: t.Object({ iOwe: t.Number(), net: t.Number(), owedToMe: t.Number() }),
	totalsByCurrency: t.Array(
		t.Object({ currency: t.String(), iOwe: t.Number(), net: t.Number(), owedToMe: t.Number() }),
	),
});

export const DebtSummaryReturn = DebtLedgerReturn.properties.people;

export const DebtEventPageReturn = t.Object({
	hasMore: t.Boolean(),
	items: t.Array(DebtEventReturn),
	nextCursor: t.Union([t.String(), t.Null()]),
});

export const DebtInvitationPreviewReturn = t.Object({
	balance: t.Number(),
	eventCount: t.Integer({ minimum: 0 }),
	...DebtEventPageReturn.properties,
});

export const DebtInvitationReturn = t.Object({
	counterpartyName: t.String(),
	createdAt: t.Date(),
	direction: t.Union([t.Literal("RECEIVED"), t.Literal("SENT")]),
	id: Id,
	status: ConnectionStatus,
});

export const DebtPersonReturn = t.Object({
	connectionId: NullableId,
	hiddenAt: t.Union([t.Date(), t.Null()]),
	id: Id,
	name: t.String(),
	normalizedName: t.String(),
});

export const DebtConnectionReturn = t.Object({
	id: Id,
	recipientId: Id,
	recipientName: t.Optional(t.String()),
	requesterId: Id,
	status: ConnectionStatus,
});

export const DebtMutationEventReturn = t.Object({
	amount: t.Number(),
	connectionId: t.Optional(NullableId),
	currency: t.String(),
	date: t.Union([t.Date(), t.Null()]),
	debtPersonId: NullableId,
	description: NullableString,
	effect: t.Number(),
	id: Id,
	kind: EventKind,
});

export const DebtMutationEventsReturn = t.Array(DebtMutationEventReturn);

export const DebtSuccessReturn = t.Object({ success: t.Literal(true) });
