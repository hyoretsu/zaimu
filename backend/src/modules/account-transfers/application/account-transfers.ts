import { createEventEnvelope } from "~/shared/application/events";
import { HttpException } from "~/shared/errors";
import { PostgresOutbox } from "~/shared/infra/outbox";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import type { AccountTransferReturn, CreateAccountTransferDTO } from "../infra/AccountTransfersDTO";
import { moveFinancialHistory } from "./move-financial-history";
import { describeTransfer, loadTransferSnapshot } from "./transfer-snapshot";

const outbox = new PostgresOutbox();
export async function lockTransferOwners(userIds: string[]) {
	for (const id of [...new Set(userIds)].sort())
		await queryRaw(`SELECT pg_advisory_xact_lock(hashtextextended('account-owner:'||$1,0))`, [id]);
}
export async function listAccountTransfers(userId: string) {
	return queryRaw<AccountTransferReturn & Record<string, unknown>>(
		`SELECT invitation.*,sender."name" AS "senderName",recipient."name" AS "recipientName",to_char(invitation."createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",to_char(invitation."respondedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "respondedAt" FROM "AccountTransfer" invitation JOIN "user" sender ON sender."id"=invitation."senderId" JOIN "user" recipient ON recipient."id"=invitation."recipientId" WHERE invitation."senderId"=$1 OR invitation."recipientId"=$1 ORDER BY invitation."createdAt" DESC,invitation."id"`,
		[userId],
	);
}
async function findTransfer(userId: string, id: string) {
	const transfer = (await listAccountTransfers(userId)).find(row => row.id === id);
	if (!transfer) throw new HttpException("Convite não encontrado", 404);
	return transfer;
}
async function items(id: string) {
	return (
		await queryRaw<{ accountId: string }>(
			`SELECT "accountId" FROM "AccountTransferItem" WHERE "transferId"=$1 ORDER BY "accountId"`,
			[id],
		)
	).map(row => row.accountId);
}
export async function previewAccountTransfer(userId: string, id: string) {
	return withRawTransaction(async () => {
		const transfer = await findTransfer(userId, id);
		if (transfer.status !== "PENDING")
			return {
				accounts: [],
				counts: {
					imports: 0,
					pausedRecurrences: 0,
					purchases: 0,
					recurrences: 0,
					separatedMovements: 0,
					statements: 0,
					transactions: 0,
				},
				transfer,
				version: null,
				warnings: [],
			};
		// Shared locks stabilize the multi-query preview against acceptance; version catches ordinary edits.
		for (const owner of [transfer.senderId, transfer.recipientId].sort())
			await queryRaw(`SELECT pg_advisory_xact_lock_shared(hashtextextended('account-owner:'||$1,0))`, [
				owner,
			]);
		const snapshot = await loadTransferSnapshot(transfer.senderId, transfer.recipientId);
		return {
			transfer,
			...(await describeTransfer(transfer.senderId, transfer.recipientId, await items(id), snapshot)),
		};
	});
}
async function notify(transfer: AccountTransferReturn, event: "PENDING" | "ACCEPTED" | "DECLINED") {
	const userId = event === "PENDING" ? transfer.recipientId : transfer.senderId;
	await queryRaw(
		`INSERT INTO "AppNotification" ("id","userId","type","payload") VALUES ($1,$2,'ACCOUNT_TRANSFER',$3::json)`,
		[crypto.randomUUID(), userId, JSON.stringify({ status: event, transferId: transfer.id })],
	);
	await queryRaw(
		`INSERT INTO "NotificationDelivery" ("id","userId","transferId","event","channel","destinationKey") VALUES ($1,$2,$3,$4,'EMAIL','EMAIL') ON CONFLICT DO NOTHING`,
		[crypto.randomUUID(), userId, transfer.id, event],
	);
	await queryRaw(
		`INSERT INTO "NotificationDelivery" ("id","userId","transferId","event","channel","deviceId","destinationKey") SELECT gen_random_uuid()::text,$1::varchar,$2::varchar,$3::varchar,'PUSH',"id",'PUSH:'||"id" FROM "PushDevice" WHERE "userId"=$1 AND "enabled" ON CONFLICT DO NOTHING`,
		[userId, transfer.id, event],
	);
	await outbox.append(
		createEventEnvelope({
			aggregateId: transfer.id,
			aggregateType: "accountTransfer",
			correlationId: transfer.id,
			eventType: event.toLowerCase(),
			payload: {},
			userIds: [transfer.senderId, transfer.recipientId],
		}),
	);
}
export async function createAccountTransfer(senderId: string, body: CreateAccountTransferDTO) {
	return withRawTransaction(async () => {
		const recipients = await queryRaw<{ id: string }>(
			`SELECT "id" FROM "user" WHERE lower("email")=lower($1) AND "emailVerified"=true`,
			[body.recipientEmail.trim()],
		);
		const recipientId = recipients[0]?.id;
		if (!recipientId)
			throw new HttpException("Informe o e-mail verificado de uma conta Zaimu existente.", 400);
		if (recipientId === senderId)
			throw new HttpException("Escolha outra conta Zaimu como destinatário.", 400);
		await lockTransferOwners([senderId, recipientId]);
		const accountIds = [...new Set(body.accountIds)].sort();
		const overlap = await queryRaw(
			`SELECT item."id" FROM "AccountTransferItem" item JOIN "AccountTransfer" invitation ON invitation."id"=item."transferId" WHERE invitation."status"='PENDING' AND item."accountId"=ANY($1::text[]) LIMIT 1`,
			[accountIds],
		);
		if (overlap.length) throw new HttpException("Uma conta selecionada já possui convite pendente.", 409);
		const snapshot = await loadTransferSnapshot(senderId, recipientId);
		const preview = await describeTransfer(senderId, recipientId, accountIds, snapshot);
		const id = crypto.randomUUID();
		await queryRaw(
			`INSERT INTO "AccountTransfer" ("id","senderId","recipientId","summary") VALUES ($1,$2,$3,$4::json)`,
			[
				id,
				senderId,
				recipientId,
				JSON.stringify({ accounts: preview.accounts.map(({ name, type }) => ({ name, type })) }),
			],
		);
		for (const accountId of accountIds)
			await queryRaw(
				`INSERT INTO "AccountTransferItem" ("id","transferId","accountId") VALUES ($1,$2,$3)`,
				[crypto.randomUUID(), id, accountId],
			);
		const transfer = await findTransfer(senderId, id);
		await notify(transfer, "PENDING");
		return transfer;
	});
}
export async function respondAccountTransfer(
	userId: string,
	id: string,
	action: "ACCEPTED" | "DECLINED" | "CANCELLED",
	version?: string,
) {
	return withRawTransaction(async () => {
		const initial = await findTransfer(userId, id);
		if ((action === "CANCELLED" ? initial.senderId : initial.recipientId) !== userId)
			throw new HttpException("Convite não encontrado", 404);
		await lockTransferOwners([initial.senderId, initial.recipientId]);
		const transfer = await findTransfer(userId, id);
		if (transfer.status === action) return transfer;
		if (transfer.status !== "PENDING")
			throw new HttpException("Este convite já foi respondido ou cancelado.", 409);
		if (action === "ACCEPTED") {
			const verified = await queryRaw(
				`SELECT "id" FROM "user" WHERE "id"=$1 AND "emailVerified"=true`,
				[userId],
			);
			if (!verified.length)
				throw new HttpException("Verifique seu e-mail antes de aceitar a transferência.", 403);
			const accountIds = await items(id);
			const snapshot = await loadTransferSnapshot(transfer.senderId, transfer.recipientId);
			const preview = await describeTransfer(
				transfer.senderId,
				transfer.recipientId,
				accountIds,
				snapshot,
			);
			if (!version || version !== preview.version)
				throw new HttpException("Dados alterados. Atualize a prévia e revise antes de aceitar.", 409);
			await queryRaw(`SELECT set_config('zaimu.account_transfer','on',true)`);
			await moveFinancialHistory({
				accountIds,
				names: preview.accounts,
				recipientId: transfer.recipientId,
				senderId: transfer.senderId,
				snapshot,
			});
			await queryRaw(`SELECT set_config('zaimu.account_transfer','off',true)`);
		}
		await queryRaw(
			`UPDATE "AccountTransfer" SET "status"=$1,"respondedAt"=now(),"updatedAt"=now() WHERE "id"=$2`,
			[action, id],
		);
		const result = await findTransfer(userId, id);
		if (action !== "CANCELLED") await notify(result, action);
		return result;
	});
}
