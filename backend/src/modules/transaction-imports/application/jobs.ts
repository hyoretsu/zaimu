import { createUploadedCreditCardImport } from "~/modules/credit-card-imports/application/upload";
import { createEventEnvelope, type EventEnvelope } from "~/shared/application/events";
import { HttpException } from "~/shared/errors";
import { withWorkerCacheFence } from "~/shared/infra/cache/worker-cache-write";
import { PostgresOutbox } from "~/shared/infra/outbox";
import { userEventBus } from "~/shared/infra/realtime";
import { executeRaw, queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { createUploadedTransactionImport } from "./upload";

type Kind = "account" | "credit-card";
type JobRow = Job & Record<string, unknown>;
interface Job {
	provider: string;
	password?: string;
	statementId?: string;
	id: string;
	batchId: string;
	userId: string;
	kind: Kind;
	scopeId: string;
	ordinal: number;
	fileName: string;
	fileType: string;
	fileBytes: string;
	status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
	importId: string | null;
	ignoredCount: number;
	error: string | null;
}
type Options = Pick<Job, "password" | "provider" | "statementId">;
const publish = (jobId: string) =>
	new PostgresOutbox().append(
		createEventEnvelope({
			aggregateId: jobId,
			aggregateType: "importFile",
			correlationId: jobId,
			eventType: "command.import-file",
			payload: { jobId },
			userIds: [],
		}),
	);

export async function enqueueImportBatch(
	userId: string,
	kind: Kind,
	scopeId: string,
	files: File[],
	options: Options,
) {
	if (!files.length) throw new HttpException("Selecione pelo menos um arquivo", 400);
	const batchId = crypto.randomUUID();
	await withRawTransaction(async () => {
		const table = kind === "account" ? "FinancialAccount" : "CreditCard";
		const [owner] = await queryRaw<{ id: string }>(
			`SELECT "id" FROM "${table}" WHERE "id"=$1 AND "userId"=$2`,
			[scopeId, userId],
		);
		if (!owner) throw new HttpException("Recurso não encontrado", 404);
		// All enqueues/claims for this scope use the same short transaction lock.
		await queryRaw("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
			`import-file:${kind}:${scopeId}`,
		]);
		for (const [ordinal, file] of files.entries()) {
			const id = crypto.randomUUID();
			await executeRaw(
				`INSERT INTO "ImportFileJob" ("id","batchId","userId","kind","scopeId","ordinal","status","fileName","fileType","fileBytes","provider","password","statementId") VALUES ($1,$2,$3,$4,$5,$6,'QUEUED',$7,$8,$9,$10,$11,$12)`,
				[
					id,
					batchId,
					userId,
					kind,
					scopeId,
					ordinal,
					file.name,
					file.type,
					Buffer.from(await file.arrayBuffer()).toString("base64"),
					options.provider,
					options.password ?? null,
					options.statementId ?? null,
				],
			);
			await publish(id);
		}
	});
	return { batchId };
}

export async function getImportBatch(userId: string, batchId: string) {
	const jobs = await queryRaw<JobRow>(
		`SELECT "ordinal","fileName","status","importId","ignoredCount","error" FROM "ImportFileJob" WHERE "userId"=$1 AND "batchId"=$2 ORDER BY "ordinal"`,
		[userId, batchId],
	);
	if (!jobs.length) throw new HttpException("Importação não encontrada", 404);
	return {
		batchId,
		results: jobs.map(j => ({
			error: j.error,
			fileName: j.fileName,
			ignoredCount: j.ignoredCount,
			importId: j.importId,
			index: j.ordinal,
			status: j.status,
			success: j.status === "SUCCEEDED",
		})),
		status: jobs.every(j => j.status === "SUCCEEDED" || j.status === "FAILED")
			? ("COMPLETED" as const)
			: jobs.some(j => j.status === "RUNNING" || j.status === "SUCCEEDED" || j.status === "FAILED")
				? ("RUNNING" as const)
				: ("QUEUED" as const),
	};
}

export async function handleImportFile(event: EventEnvelope<{ jobId: string }>) {
	const token = crypto.randomUUID();
	const job = await withRawTransaction(async () => {
		const [candidate] = await queryRaw<JobRow>(
			`SELECT "id","kind","scopeId" FROM "ImportFileJob" WHERE "id"=$1`,
			[event.payload.jobId],
		);
		if (!candidate) return;
		await queryRaw("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
			`import-file:${candidate.kind}:${candidate.scopeId}`,
		]);
		// An earlier unfinished file blocks later files, even across batches/replicas.
		const [claimed] = await queryRaw<JobRow>(
			`UPDATE "ImportFileJob" j SET "status"='RUNNING',"workerToken"=$2,"lockedUntil"=now()+interval '2 minutes' WHERE j."id"=$1 AND (j."status"='QUEUED' OR (j."status"='RUNNING' AND j."lockedUntil"<now())) AND NOT EXISTS (SELECT 1 FROM "ImportFileJob" p WHERE p."kind"=j."kind" AND p."scopeId"=j."scopeId" AND p."status" IN ('QUEUED','RUNNING') AND (p."createdAt",p."batchId",p."ordinal") < (j."createdAt",j."batchId",j."ordinal")) RETURNING j.*`,
			[candidate.id, token],
		);
		return claimed;
	});
	if (!job) return;
	let renewal = Promise.resolve();
	const timer = setInterval(() => {
		renewal = renewal
			.then(async () => {
				await executeRaw(
					`UPDATE "ImportFileJob" SET "lockedUntil"=now()+interval '2 minutes' WHERE "id"=$1 AND "workerToken"=$2 AND "status"='RUNNING' AND "lockedUntil">now()`,
					[job.id, token],
				);
			})
			.catch(error => console.error("Import lease renewal failed", error));
	}, 20_000);
	const guard = async () => {
		const [live] = await queryRaw(
			`SELECT "id" FROM "ImportFileJob" WHERE "id"=$1 AND "workerToken"=$2 AND "status"='RUNNING' AND "lockedUntil">now() FOR UPDATE`,
			[job.id, token],
		);
		if (!live) throw new Error("Import worker lease lost");
	};
	const complete = async (result: { importId: string | null; ignoredCount: number }) => {
		await executeRaw(
			`UPDATE "ImportFileJob" SET "status"='SUCCEEDED',"importId"=$3,"ignoredCount"=$4,"fileBytes"=NULL,"password"=NULL,"workerToken"=NULL,"lockedUntil"=NULL,"finishedAt"=now() WHERE "id"=$1 AND "workerToken"=$2 AND "status"='RUNNING'`,
			[job.id, token, result.importId, result.ignoredCount],
		);
	};
	try {
		const file = new File([Buffer.from(job.fileBytes, "base64")], job.fileName, { type: job.fileType });
		await withWorkerCacheFence(
			[job.userId],
			[
				"imports:pending",
				"imports:detail",
				"dashboard",
				"credit-cards:overview",
				"credit-cards:statements",
			],
			async () => {
				if (job.kind === "account")
					await createUploadedTransactionImport(
						job.userId,
						{
							file,
							financialAccountId: job.scopeId,
							provider: job.provider as Parameters<
								typeof createUploadedTransactionImport
							>[1]["provider"],
						},
						guard,
						complete,
					);
				else
					await createUploadedCreditCardImport(
						job.userId,
						{
							creditCardId: job.scopeId,
							file,
							password: job.password ?? undefined,
							provider: job.provider as Parameters<
								typeof createUploadedCreditCardImport
							>[1]["provider"],
							statementId: job.statementId ?? undefined,
						},
						guard,
						complete,
					);
			},
		);
	} catch {
		// Do not persist parser messages: they may contain PDF text or passwords.
		await executeRaw(
			`UPDATE "ImportFileJob" SET "status"='FAILED',"error"='Não foi possível processar o arquivo',"fileBytes"=NULL,"password"=NULL,"workerToken"=NULL,"lockedUntil"=NULL,"finishedAt"=now() WHERE "id"=$1 AND "workerToken"=$2 AND "status"='RUNNING' AND "lockedUntil">now()`,
			[job.id, token],
		);
	} finally {
		clearInterval(timer);
		await renewal;
	}
	// Clients waiting on the batch re-read it; a lost push falls back to their slow poll.
	await userEventBus
		.publish([job.userId], {
			aggregateId: job.batchId,
			aggregateType: "importBatch",
			eventType: "progress",
		})
		.catch(error => console.warn("Failed to publish import batch progress", error));
	await recoverImportFiles();
}

export async function recoverImportFiles() {
	await withRawTransaction(async () => {
		const jobs = await queryRaw<{ id: string }>(
			`SELECT j."id" FROM "ImportFileJob" j WHERE ((j."status"='QUEUED' AND (j."lockedUntil" IS NULL OR j."lockedUntil"<now())) OR (j."status"='RUNNING' AND j."lockedUntil"<now())) AND NOT EXISTS (SELECT 1 FROM "ImportFileJob" p WHERE p."kind"=j."kind" AND p."scopeId"=j."scopeId" AND p."status" IN ('QUEUED','RUNNING') AND (p."createdAt",p."batchId",p."ordinal") < (j."createdAt",j."batchId",j."ordinal")) FOR UPDATE OF j SKIP LOCKED`,
		);
		for (const job of jobs) {
			await executeRaw(
				`UPDATE "ImportFileJob" SET "status"='QUEUED',"workerToken"=NULL,"lockedUntil"=now()+interval '2 minutes' WHERE "id"=$1`,
				[job.id],
			);
			await publish(job.id);
		}
	});
}
