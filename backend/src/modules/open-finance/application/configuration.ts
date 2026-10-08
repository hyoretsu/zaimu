import { assertSupportedCurrency } from "~/modules/currencies/application/currency-defaults";
import { HttpException } from "~/shared/errors";
import { executeRaw, queryRaw, withRawTransaction } from "~/shared/infra/sql";
import {
	decryptCredentials,
	encryptCredentials,
	openFinanceAvailable,
	type PluggyCredentials,
} from "../infra/credentials";
import {
	PluggyClient,
	PluggyDiscoveryUnavailable,
	type RemoteAccount,
	type RemoteItem,
} from "../infra/pluggy-client";
import type { Binding } from "./candidates";
export async function pluggyForUser(userId: string) {
	if (!openFinanceAvailable()) throw new HttpException("Open Finance indisponível neste servidor", 503);
	const [config] = await queryRaw<{ encryptedCredentials: string | null }>(
		'SELECT "encryptedCredentials" FROM "OpenFinanceConfig" WHERE "userId"=$1',
		[userId],
	);
	if (!config?.encryptedCredentials) throw new HttpException("Configure as credenciais MeuPluggy", 409);
	return new PluggyClient(decryptCredentials(userId, config.encryptedCredentials));
}
export async function lockConfiguration(userId: string) {
	await queryRaw('SELECT "userId" FROM "OpenFinanceConfig" WHERE "userId"=$1 FOR UPDATE', [userId]);
}
export async function saveCredentials(userId: string, input: PluggyCredentials) {
	// Authenticate before acquiring a SQL lock; no credential material enters the outbox/cache.
	if (!openFinanceAvailable()) throw new HttpException("Open Finance indisponível neste servidor", 503);
	await new PluggyClient(input).validate();
	await withRawTransaction(async () => {
		await executeRaw(`INSERT INTO "OpenFinanceConfig" ("userId") VALUES ($1) ON CONFLICT DO NOTHING`, [
			userId,
		]);
		await lockConfiguration(userId);
		await executeRaw(
			`UPDATE "OpenFinanceConfig" SET "encryptedCredentials"=$2, "updatedAt"=now() WHERE "userId"=$1`,
			[userId, encryptCredentials(userId, input)],
		);
	});
}
export async function getConfiguration(userId: string) {
	if (!openFinanceAvailable())
		return { available: false, configured: false, connections: [], lastQueriedAt: null };
	const [config] = await queryRaw<{ configured: boolean; lastQueriedAt: Date | null }>(
		'SELECT ("encryptedCredentials" IS NOT NULL) AS "configured", "lastQueriedAt" FROM "OpenFinanceConfig" WHERE "userId"=$1',
		[userId],
	);
	const connections = await queryRaw<{
		id: string;
		itemId: string;
		bankName: string;
		status: string;
		bankUpdatedAt: Date | null;
		remoteAccounts: RemoteAccount[];
	}>(
		`SELECT "id", "itemId", "bankName", "status", "bankUpdatedAt", "remoteAccounts" FROM "OpenFinanceConnection" WHERE "userId"=$1 AND "status"<>'DISCONNECTED' ORDER BY "createdAt", "id"`,
		[userId],
	);
	const bindings = await queryRaw<Binding>(
		`SELECT b.* FROM "OpenFinanceBinding" b JOIN "OpenFinanceConnection" c ON c."id"=b."connectionId" WHERE c."userId"=$1`,
		[userId],
	);
	return {
		available: true,
		configured: config?.configured ?? false,
		connections: connections.map(c => ({
			...c,
			bankUpdatedAt: c.bankUpdatedAt?.toISOString() ?? null,
			bindings: bindings.filter(b => b.connectionId === c.id),
			remoteAccounts: c.remoteAccounts.map(a => ({
				currencyCode: a.currencyCode ?? "BRL",
				id: a.id,
				name: a.name,
				type: a.type,
			})),
		})),
		lastQueriedAt: config?.lastQueriedAt?.toISOString() ?? null,
	};
}
export async function addConnection(userId: string, itemId: string) {
	const pluggy = await pluggyForUser(userId);
	const [item, accounts] = await Promise.all([pluggy.item(itemId), pluggy.accounts(itemId)]);
	if (item.id !== itemId || accounts.some(a => a.itemId !== itemId))
		throw new HttpException("Contas incompatíveis com a conexão", 422);
	await persistConnection(userId, item, accounts);
	return getConfiguration(userId);
}
async function persistConnection(
	userId: string,
	item: RemoteItem,
	accounts: RemoteAccount[],
	expectedCredentials?: string,
) {
	await withRawTransaction(async () => {
		await lockConfiguration(userId);
		const [config] = await queryRaw<{ encryptedCredentials: string | null }>(
			'SELECT "encryptedCredentials" FROM "OpenFinanceConfig" WHERE "userId"=$1',
			[userId],
		);
		if (
			!config?.encryptedCredentials ||
			(expectedCredentials && config.encryptedCredentials !== expectedCredentials)
		)
			throw new HttpException("Configuração mudou durante consulta. Busque conexões novamente.", 409);
		await executeRaw(
			`INSERT INTO "OpenFinanceConnection" ("id", "userId", "itemId", "bankName", "status", "bankUpdatedAt", "remoteAccounts") VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
  ON CONFLICT ("userId", "itemId") DO UPDATE SET "bankName"=EXCLUDED."bankName", "status"=EXCLUDED."status", "bankUpdatedAt"=EXCLUDED."bankUpdatedAt", "remoteAccounts"=EXCLUDED."remoteAccounts"
  WHERE $8 OR "OpenFinanceConnection"."status"<>'DISCONNECTED'`,
			[
				crypto.randomUUID(),
				userId,
				item.id,
				item.connector?.name && !/meu\s*pluggy/i.test(item.connector.name)
					? item.connector.name
					: "Banco conectado via MeuPluggy",
				item.status,
				item.lastUpdatedAt ?? null,
				JSON.stringify(accounts),
				!expectedCredentials,
			],
		);
	});
}
export async function discoverConnections(userId: string) {
	if (!openFinanceAvailable()) throw new HttpException("Open Finance indisponível neste servidor", 503);
	const [config] = await queryRaw<{ encryptedCredentials: string | null }>(
		'SELECT "encryptedCredentials" FROM "OpenFinanceConfig" WHERE "userId"=$1',
		[userId],
	);
	if (!config?.encryptedCredentials) throw new HttpException("Configure as credenciais MeuPluggy", 409);
	const pluggy = new PluggyClient(decryptCredentials(userId, config.encryptedCredentials));
	const known = await queryRaw<{ itemId: string; status: string }>(
		'SELECT "itemId", "status" FROM "OpenFinanceConnection" WHERE "userId"=$1',
		[userId],
	);
	let discoveryAvailable = true;
	let discovered: RemoteItem[] = [];
	try {
		discovered = await pluggy.items();
	} catch (error) {
		if (!(error instanceof PluggyDiscoveryUnavailable)) throw error;
		discoveryAvailable = false;
	}
	const removed = new Set(known.filter(item => item.status === "DISCONNECTED").map(item => item.itemId));
	const itemIds = new Set([
		...known.filter(item => item.status !== "DISCONNECTED").map(item => item.itemId),
		...discovered.filter(item => /meu\s*pluggy/i.test(item.connector?.name ?? "")).map(item => item.id),
	]);
	const errors: { itemId: string; message: string }[] = [];
	for (const itemId of itemIds) {
		if (removed.has(itemId)) continue;
		try {
			const [item, accounts] = await Promise.all([pluggy.item(itemId), pluggy.accounts(itemId)]);
			if (item.id !== itemId || accounts.some(account => account.itemId !== itemId))
				throw new HttpException("Contas incompatíveis com a conexão", 422);
			await persistConnection(userId, item, accounts, config.encryptedCredentials);
		} catch (error) {
			errors.push({
				itemId,
				message: error instanceof HttpException ? error.message : "Não foi possível consultar conexão",
			});
		}
	}
	return { ...(await getConfiguration(userId)), discoveryAvailable, errors };
}
export async function saveBinding(
	userId: string,
	connectionId: string,
	input: {
		remoteAccountId: string;
		financialAccountId?: string | null;
		creditCardId?: string | null;
		paused?: boolean;
	},
) {
	return withRawTransaction(async () => {
		await lockConfiguration(userId);
		const [connection] = await queryRaw<{ remoteAccounts: RemoteAccount[] }>(
			'SELECT "remoteAccounts" FROM "OpenFinanceConnection" WHERE "id"=$1 AND "userId"=$2',
			[connectionId, userId],
		);
		const remote = connection?.remoteAccounts.find(a => a.id === input.remoteAccountId);
		if (!remote) throw new HttpException("Conta remota não encontrada", 404);
		const card = remote.type === "CREDIT";
		if (!input.financialAccountId && !input.creditCardId) {
			await executeRaw('DELETE FROM "OpenFinanceBinding" WHERE "connectionId"=$1 AND "remoteAccountId"=$2', [
				connectionId,
				input.remoteAccountId,
			]);
			return;
		}
		const currency = await assertSupportedCurrency(remote.currencyCode ?? "BRL");
		const [destination] = await queryRaw<{ id: string; currency: string }>(
			card
				? `SELECT c."id", c."currency" FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" WHERE c."id"=$1 AND a."userId"=$2`
				: `SELECT "id", "currency" FROM "FinancialAccount" WHERE "id"=$1 AND "userId"=$2 AND "type" IN ('CHECKING','SAVINGS','CASH')`,
			[card ? input.creditCardId : input.financialAccountId, userId],
		);
		if (
			!destination ||
			destination.currency !== currency ||
			(card ? Boolean(input.financialAccountId) : Boolean(input.creditCardId)) ||
			(!card && remote.type !== "BANK")
		)
			throw new HttpException("Selecione um destino compatível pertencente à sua conta", 422);
		await executeRaw(
			`INSERT INTO "OpenFinanceBinding" ("id", "connectionId", "remoteAccountId", "financialAccountId", "creditCardId", "paused") VALUES ($1,$2,$3,$4,$5,$6)
   ON CONFLICT ("connectionId", "remoteAccountId") DO UPDATE SET "financialAccountId"=EXCLUDED."financialAccountId", "creditCardId"=EXCLUDED."creditCardId", "paused"=EXCLUDED."paused"`,
			[
				crypto.randomUUID(),
				connectionId,
				input.remoteAccountId,
				input.financialAccountId ?? null,
				input.creditCardId ?? null,
				input.paused ?? false,
			],
		);
	});
}
export async function disconnect(userId: string, connectionId?: string) {
	await withRawTransaction(async () => {
		await lockConfiguration(userId);
		if (connectionId) {
			await executeRaw(
				`DELETE FROM "OpenFinanceBinding" WHERE "connectionId" IN (SELECT "id" FROM "OpenFinanceConnection" WHERE "userId"=$1 AND "id"=$2)`,
				[userId, connectionId],
			);
			await executeRaw(
				`UPDATE "OpenFinanceConnection" SET "status"='DISCONNECTED', "remoteAccounts"='[]'::jsonb WHERE "userId"=$1 AND "id"=$2`,
				[userId, connectionId],
			);
		} else {
			await executeRaw('DELETE FROM "OpenFinanceConnection" WHERE "userId"=$1', [userId]);
		}
		if (!connectionId)
			await executeRaw(
				`UPDATE "OpenFinanceRun" SET "status"='CANCELED', "finishedAt"=now(), "lockedUntil"=NULL WHERE "userId"=$1 AND "status" IN ('RUNNING','QUEUED')`,
				[userId],
			);
		if (!connectionId)
			await executeRaw(
				`UPDATE "OpenFinanceConfig" SET "encryptedCredentials"=NULL, "updatedAt"=now() WHERE "userId"=$1`,
				[userId],
			);
	});
}
