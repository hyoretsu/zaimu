import { createEventEnvelope, type EventEnvelope } from "~/shared/application/events";
import { HttpException } from "~/shared/errors";
import type { CacheNamespace } from "~/shared/infra/cache";
import { withWorkerCacheWrite } from "~/shared/infra/cache/worker-cache-write";
import { PostgresOutbox } from "~/shared/infra/outbox";
import { executeRaw, queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { normalizeTransaction } from "../domain/normalize";
import { openFinanceAvailable } from "../infra/credentials";
import type { RemoteBill } from "../infra/pluggy-client";
import type { Binding } from "./candidates";
import { pluggyForUser } from "./configuration";
import { processRecord } from "./process-record";
export async function startSync(userId: string, force = false) {
	if (!openFinanceAvailable()) return { runId: null };
	return withRawTransaction(async () => {
		const [config] = await queryRaw<{ configured: boolean; eligible: boolean }>(
			`SELECT ("encryptedCredentials" IS NOT NULL) AS "configured", ("lastQueriedAt" IS NULL OR "lastQueriedAt" < now()-interval '15 minutes') AS "eligible" FROM "OpenFinanceConfig" WHERE "userId"=$1 FOR UPDATE`,
			[userId],
		);
		if (!config?.configured) return { runId: null };
		const [active] = await queryRaw<{ id: string }>(
			`SELECT "id" FROM "OpenFinanceRun" WHERE "userId"=$1 AND "status" IN ('QUEUED','RUNNING')`,
			[userId],
		);
		if (active) return { runId: active.id };
		if (!force && !config.eligible) return { runId: null };
		const [binding] = await queryRaw<{ id: string }>(
			`SELECT b."id" FROM "OpenFinanceBinding" b JOIN "OpenFinanceConnection" c ON c."id"=b."connectionId" WHERE c."userId"=$1 AND NOT b."paused" LIMIT 1`,
			[userId],
		);
		if (!binding) return { runId: null };
		const runId = crypto.randomUUID();
		await executeRaw(`INSERT INTO "OpenFinanceRun" ("id", "userId", "status") VALUES ($1,$2,'QUEUED')`, [
			runId,
			userId,
		]);
		await executeRaw('UPDATE "OpenFinanceConfig" SET "lastQueriedAt"=now() WHERE "userId"=$1', [userId]);
		await new PostgresOutbox().append(
			createEventEnvelope({
				aggregateId: runId,
				aggregateType: "openFinance",
				correlationId: runId,
				eventType: "command.open-finance-sync",
				payload: { runId, userId },
				userIds: [userId],
			}),
		);
		return { runId };
	});
}
export async function syncStatus(userId: string, runId?: string) {
	const [run] = await queryRaw<{
		id: string;
		status: string;
		processed: number;
		imported: number;
		linked: number;
		pending: number;
		errors: Array<{ connectionId: string; message: string }>;
		startedAt: Date;
		finishedAt: Date | null;
	}>(
		`SELECT "id", "status", "processed", "imported", "linked", "pending", "errors", "startedAt", "finishedAt" FROM "OpenFinanceRun" WHERE "userId"=$1 ${runId ? 'AND "id"=$2' : ""} ORDER BY "startedAt" DESC LIMIT 1`,
		runId ? [userId, runId] : [userId],
	);
	if (runId && !run) throw new HttpException("Busca não encontrada", 404);
	const reviews = await queryRaw<{ importId: string; kind: string; count: number }>(
		`SELECT r."importId", CASE WHEN c."id" IS NOT NULL THEN 'PURCHASE' ELSE 'TRANSACTION' END AS "kind", count(*)::integer AS "count"
 FROM "OpenFinanceRecord" r LEFT JOIN "CreditCardImport" c ON c."id"=r."importId" LEFT JOIN "TransactionImport" t ON t."id"=r."importId"
 WHERE r."userId"=$1 AND r."state"='REVIEW' AND (c."status"='PENDING' OR t."status"='PENDING') GROUP BY r."importId", c."id"`,
		[userId],
	);
	return {
		reviews,
		run: run
			? { ...run, finishedAt: run.finishedAt?.toISOString() ?? null, startedAt: run.startedAt.toISOString() }
			: null,
	};
}
export async function handleOpenFinanceSync(event: EventEnvelope) {
	const { runId, userId } = event.payload as { runId: string; userId: string };
	const token = crypto.randomUUID();
	const [claimed] = await queryRaw<{ id: string }>(
		`UPDATE "OpenFinanceRun" SET "status"='RUNNING', "workerToken"=$3, "lockedUntil"=now()+interval '2 minutes' WHERE "id"=$1 AND "userId"=$2 AND ("status"='QUEUED' OR ("status"='RUNNING' AND ("lockedUntil" IS NULL OR "lockedUntil"<now()))) RETURNING "id"`,
		[runId, userId, token],
	);
	if (!claimed) {
		const [active] = await queryRaw<{ status: string }>(
			'SELECT "status" FROM "OpenFinanceRun" WHERE "id"=$1 AND "userId"=$2',
			[runId, userId],
		);
		if (active?.status === "RUNNING") throw new Error("Busca já em execução");
		return;
	}
	const errors: Array<{ connectionId: string; message: string }> = [];
	try {
		const pluggy = await pluggyForUser(userId);
		const connections = await queryRaw<{ id: string; itemId: string }>(
			`SELECT "id", "itemId" FROM "OpenFinanceConnection" WHERE "userId"=$1 AND "status"<>'DISCONNECTED'`,
			[userId],
		);
		const renew = async () => {
			const result = await queryRaw<{ id: string }>(
				`UPDATE "OpenFinanceRun" SET "lockedUntil"=now()+interval '2 minutes' WHERE "id"=$1 AND "workerToken"=$2 AND "status"='RUNNING' RETURNING "id"`,
				[runId, token],
			);
			if (!result.length) throw new Error("Busca perdeu bloqueio");
		};
		for (const connection of connections) {
			try {
				await renew();
				const [item, accounts] = await Promise.all([
					pluggy.item(connection.itemId),
					pluggy.accounts(connection.itemId),
				]);
				await executeRaw(
					`UPDATE "OpenFinanceConnection" SET "status"=$2, "bankUpdatedAt"=$3, "remoteAccounts"=$4::jsonb WHERE "id"=$1 AND "userId"=$5 AND "status"<>'DISCONNECTED'`,
					[connection.id, item.status, item.lastUpdatedAt ?? null, JSON.stringify(accounts), userId],
				);
				const bindings = await queryRaw<Binding>(
					'SELECT * FROM "OpenFinanceBinding" WHERE "connectionId"=$1 AND NOT "paused"',
					[connection.id],
				);
				for (const binding of bindings) {
					const account = accounts.find(a => a.id === binding.remoteAccountId);
					if (!account || account.itemId !== connection.itemId) throw new Error("Conta remota indisponível");
					let bills: RemoteBill[] = [];
					if (binding.creditCardId) {
						try {
							await renew();
							bills = await pluggy.bills(binding.remoteAccountId);
						} catch (error) {
							errors.push({
								connectionId: connection.id,
								message:
									error instanceof HttpException ? error.message : "Não foi possível consultar faturas",
							});
						}
					}
					for await (const page of pluggy.transactions(binding.remoteAccountId)) {
						await renew();
						for (const transaction of page) {
							if (transaction.accountId !== binding.remoteAccountId)
								throw new Error("Transação de conta incompatível");
							const remote = normalizeTransaction(transaction, Boolean(binding.creditCardId), bills);
							const namespaces: CacheNamespace[] = [
								"transactions:list",
								"transactions:detail",
								"imports:pending",
								"imports:detail",
								"accounts:list",
								"accounts:detail",
								"accounts:yields",
								"dashboard",
								"credit-cards:overview",
								"credit-cards:statements",
								"debts:events",
								"debts:overview",
							];
							if (binding.creditCardId) namespaces.push(`credit-cards:${binding.creditCardId}:statements`);
							const debtUsers = await queryRaw<{ userId: string }>(
								`SELECT CASE WHEN "requesterId"=$1 THEN "recipientId" ELSE "requesterId" END AS "userId" FROM "DebtConnection" WHERE "status" IN ('PENDING','ACCEPTED') AND ("requesterId"=$1 OR "recipientId"=$1)`,
								[userId],
							);
							await withWorkerCacheWrite([userId, ...debtUsers.map(u => u.userId)], namespaces, async () => {
								await queryRaw('SELECT "userId" FROM "OpenFinanceConfig" WHERE "userId"=$1 FOR UPDATE', [
									userId,
								]);
								const [lease] = await queryRaw<{ id: string }>(
									`SELECT "id" FROM "OpenFinanceRun" WHERE "id"=$1 AND "workerToken"=$2 AND "status"='RUNNING' AND "lockedUntil">now() FOR UPDATE`,
									[runId, token],
								);
								if (!lease) throw new Error("Busca perdeu bloqueio");
								const [currentBinding] = await queryRaw<Binding>(
									`SELECT b.* FROM "OpenFinanceBinding" b JOIN "OpenFinanceConnection" c ON c."id"=b."connectionId" WHERE b."id"=$1 AND c."userId"=$2 AND NOT b."paused"`,
									[binding.id, userId],
								);
								if (
									!currentBinding ||
									currentBinding.financialAccountId !== binding.financialAccountId ||
									currentBinding.creditCardId !== binding.creditCardId
								)
									return;
								const result = await processRecord(userId, binding, remote);
								await executeRaw(
									`UPDATE "OpenFinanceRun" SET "processed"="processed"+1, "imported"="imported"+$2, "linked"="linked"+$3, "pending"="pending"+$4, "lockedUntil"=now()+interval '2 minutes' WHERE "id"=$1 AND "workerToken"=$5`,
									[
										runId,
										result === "imported" ? 1 : 0,
										result === "linked" ? 1 : 0,
										result === "pending" ? 1 : 0,
										token,
									],
								);
							});
						}
					}
				}
			} catch (error) {
				errors.push({
					connectionId: connection.id,
					message:
						error instanceof HttpException
							? error.message
							: "Falha ao processar conexão. Tente buscar novamente.",
				});
			}
		}
		await executeRaw(
			`UPDATE "OpenFinanceRun" SET "status"=$3, "errors"=$4::jsonb, "finishedAt"=now(), "lockedUntil"=NULL WHERE "id"=$1 AND "workerToken"=$2`,
			[runId, token, errors.length ? "PARTIAL" : "COMPLETED", JSON.stringify(errors)],
		);
	} catch (error) {
		await executeRaw(
			`UPDATE "OpenFinanceRun" SET "status"='FAILED', "finishedAt"=now(), "lockedUntil"=NULL, "errors"=$3::jsonb WHERE "id"=$1 AND "workerToken"=$2`,
			[
				runId,
				token,
				JSON.stringify([
					{
						connectionId: "",
						message: error instanceof HttpException ? error.message : "Busca interrompida. Tente novamente.",
					},
				]),
			],
		);
	}
}

// Re-enqueue leases abandoned by a terminated worker or lost broker delivery.
export async function recoverOpenFinanceRuns() {
	if (!openFinanceAvailable()) return;
	await withRawTransaction(async () => {
		const runs = await queryRaw<{ id: string; userId: string }>(
			`SELECT "id", "userId" FROM "OpenFinanceRun" WHERE "status" IN ('RUNNING','QUEUED') AND COALESCE("lockedUntil", "startedAt"+interval '5 minutes')<now() FOR UPDATE SKIP LOCKED`,
		);
		for (const run of runs) {
			await executeRaw(
				`UPDATE "OpenFinanceRun" SET "status"='QUEUED', "workerToken"=NULL, "lockedUntil"=now()+interval '5 minutes' WHERE "id"=$1`,
				[run.id],
			);
			await new PostgresOutbox().append(
				createEventEnvelope({
					aggregateId: run.id,
					aggregateType: "openFinance",
					correlationId: run.id,
					eventType: "command.open-finance-sync",
					payload: { runId: run.id, userId: run.userId },
					userIds: [run.userId],
				}),
			);
		}
	});
}
