import { t } from "elysia";

export const TransferStatus = t.Union([
	t.Literal("PENDING"),
	t.Literal("ACCEPTED"),
	t.Literal("DECLINED"),
	t.Literal("CANCELLED"),
]);
export const TransferAccountReturn = t.Object({
	balance: t.Number(),
	currency: t.String(),
	destinationName: t.String(),
	id: t.String(),
	institutionName: t.Nullable(t.String()),
	isHidden: t.Boolean(),
	name: t.Nullable(t.String()),
	rewardsKind: t.Nullable(t.Union([t.Literal("POINTS"), t.Literal("CASHBACK")])),
	statements: t.Array(
		t.Object({
			amountDue: t.Number(),
			currency: t.String(),
			dueDate: t.String(),
			id: t.String(),
			totalAmount: t.Number(),
		}),
	),
	type: t.String(),
});
export const TransferSummary = t.Object({
	accounts: t.Array(t.Object({ name: t.Nullable(t.String()), type: t.String() })),
});
export const AccountTransferReturn = t.Object({
	createdAt: t.String(),
	id: t.String(),
	recipientId: t.String(),
	recipientName: t.String(),
	respondedAt: t.Nullable(t.String()),
	senderId: t.String(),
	senderName: t.String(),
	status: TransferStatus,
	summary: TransferSummary,
});
export type AccountTransferReturn = typeof AccountTransferReturn.static;
export const AccountTransferPreviewReturn = t.Object({
	accounts: t.Array(TransferAccountReturn),
	counts: t.Object({
		imports: t.Number(),
		pausedRecurrences: t.Number(),
		purchases: t.Number(),
		recurrences: t.Number(),
		separatedMovements: t.Number(),
		statements: t.Number(),
		transactions: t.Number(),
	}),
	transfer: AccountTransferReturn,
	version: t.Nullable(t.String()),
	warnings: t.Array(t.String()),
});
export type AccountTransferPreviewReturn = typeof AccountTransferPreviewReturn.static;
export const CreateAccountTransferDTO = t.Object({
	accountIds: t.Array(t.String({ maxLength: 36, minLength: 1 }), { maxItems: 500, minItems: 1 }),
	recipientEmail: t.String({ format: "email", maxLength: 254 }),
});
export type CreateAccountTransferDTO = typeof CreateAccountTransferDTO.static;
