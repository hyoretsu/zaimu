import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import {
	createAccountTransfer,
	listAccountTransfers,
	previewAccountTransfer,
	respondAccountTransfer,
} from "../application/account-transfers";
import { detachedRewardHistory } from "../application/detached-reward-history";
import {
	AccountTransferPreviewReturn,
	AccountTransferReturn,
	CreateAccountTransferDTO,
} from "./AccountTransfersDTO";

export const AccountTransfersController = new Elysia({ prefix: "/account-transfers" })
	.get(
		"/rewards/:accountId",
		async ({ request, params, query }) =>
			detachedRewardHistory(await requireUserId(request), params.accountId, query.cursor),
		{
			detail: { operationId: "getAccountTransfersRewardsByAccountId" },
			params: t.Object({ accountId: t.String({ maxLength: 36 }) }),
			query: t.Object({ cursor: t.Optional(t.String({ maxLength: 512 })) }),
			response: t.Object({
				items: t.Array(t.Object({ amount: t.Number(), date: t.String(), id: t.String() })),
				nextCursor: t.Nullable(t.String()),
			}),
		},
	)
	.get("/", async ({ request }) => listAccountTransfers(await requireUserId(request)), {
		detail: { operationId: "getAccountTransfers", tags: ["Account transfers"] },
		response: t.Array(AccountTransferReturn),
	})
	.post("/", async ({ request, body }) => createAccountTransfer(await requireUserId(request), body), {
		body: CreateAccountTransferDTO,
		detail: { operationId: "postAccountTransfers", tags: ["Account transfers"] },
		response: AccountTransferReturn,
	})
	.get(
		"/:id",
		async ({ request, params }) => previewAccountTransfer(await requireUserId(request), params.id),
		{
			detail: { operationId: "getAccountTransfersById", tags: ["Account transfers"] },
			params: t.Object({ id: t.String() }),
			response: AccountTransferPreviewReturn,
		},
	)
	.post(
		"/:id/accept",
		async ({ request, params, body }) =>
			respondAccountTransfer(await requireUserId(request), params.id, "ACCEPTED", body.version),
		{
			body: t.Object({ version: t.String({ maxLength: 64, minLength: 64 }) }),
			detail: { operationId: "postAccountTransfersByIdAccept", tags: ["Account transfers"] },
			params: t.Object({ id: t.String() }),
			response: AccountTransferReturn,
		},
	)
	.post(
		"/:id/decline",
		async ({ request, params }) =>
			respondAccountTransfer(await requireUserId(request), params.id, "DECLINED"),
		{
			detail: { operationId: "postAccountTransfersByIdDecline", tags: ["Account transfers"] },
			params: t.Object({ id: t.String() }),
			response: AccountTransferReturn,
		},
	)
	.post(
		"/:id/cancel",
		async ({ request, params }) =>
			respondAccountTransfer(await requireUserId(request), params.id, "CANCELLED"),
		{
			detail: { operationId: "postAccountTransfersByIdCancel", tags: ["Account transfers"] },
			params: t.Object({ id: t.String() }),
			response: AccountTransferReturn,
		},
	);
