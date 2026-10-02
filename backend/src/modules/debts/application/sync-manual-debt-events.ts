import type { SyncDebtEvent } from "~/modules/sync/SyncDTO";
import { executeRaw, queryRaw } from "~/shared/infra/sql";
import { resolveDebtPersonConnection } from "./debt-ledger";

export async function syncManualDebtEvent(userId: string, input: SyncDebtEvent) {
	const { connectionId } = await resolveDebtPersonConnection(input.debtPersonId, userId);
	if (Math.abs(input.effect) !== input.amount) throw new Error("Efeito inválido no lançamento manual");
	const [existing] = await queryRaw<{
		createdByUserId: string;
		kind: string;
		updatedAt: Date;
		deletedAt: Date | null;
	}>('SELECT "createdByUserId","kind","updatedAt","deletedAt" FROM "DebtEvent" WHERE "id"=$1 FOR UPDATE', [
		input.id,
	]);
	if (existing && (existing.createdByUserId !== userId || existing.kind !== input.kind))
		throw new Error("Evento não pertence ao proprietário ou é derivado");
	if (existing?.deletedAt) return;
	if (
		existing &&
		input.baseUpdatedAt &&
		existing.updatedAt.getTime() !== Date.parse(input.updatedAt) &&
		existing.updatedAt.getTime() !== Date.parse(input.baseUpdatedAt)
	)
		throw new Error("Evento alterado no servidor; revise conflito antes de sincronizar");
	if (existing && existing.updatedAt.getTime() > Date.parse(input.updatedAt))
		throw new Error("Evento alterado no servidor; atualize antes de sincronizar");
	if (input.kind === "MIGRATED_SETTLEMENT") {
		const [proof] = await queryRaw<{ original: Record<string, unknown> }>(
			'SELECT "original" FROM "ApplicationUpgradeArchive" WHERE "source"=\'DebtSettlementProof\' AND "recordId"=$1 AND "userId"=$2',
			[input.upgradeRecordId, userId],
		);
		if (
			!proof ||
			proof.original.eventId !== input.id ||
			proof.original.debtPersonId !== input.debtPersonId ||
			Number(proof.original.amount) !== input.amount ||
			Number(proof.original.effect) !== input.effect ||
			(proof.original.date ?? null) !== input.date ||
			input.deletedAt
		)
			throw new Error("Compensação histórica exige comprovação do upgrade");
	}
	await executeRaw(
		`INSERT INTO "DebtEvent" ("id","debtPersonId","connectionId","createdByUserId","kind","amount","effect","date","dueDate","description","createdAt","updatedAt","deletedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT ("id") DO UPDATE SET "debtPersonId"=EXCLUDED."debtPersonId","connectionId"=EXCLUDED."connectionId","amount"=EXCLUDED."amount","effect"=EXCLUDED."effect","date"=EXCLUDED."date","dueDate"=EXCLUDED."dueDate","description"=EXCLUDED."description","updatedAt"=EXCLUDED."updatedAt","deletedAt"=EXCLUDED."deletedAt"`,
		[
			input.id,
			input.debtPersonId,
			connectionId ?? null,
			userId,
			input.kind,
			input.amount,
			input.effect,
			input.date,
			input.dueDate ?? null,
			input.description ?? null,
			input.createdAt,
			input.updatedAt,
			input.deletedAt ?? null,
		],
	);
}
export async function listManualDebtEvents(userId: string): Promise<SyncDebtEvent[]> {
	const rows = await queryRaw<Record<string, unknown>>(
		'SELECT e.*,p."recordId" AS "upgradeRecordId" FROM "DebtEvent" e LEFT JOIN "ApplicationUpgradeArchive" p ON p."source"=\'DebtSettlementProof\' AND p."recordId"=e."id" AND p."userId"=e."createdByUserId" WHERE e."createdByUserId"=$1 AND e."kind" IN (\'ORIGIN\',\'MIGRATED_SETTLEMENT\') AND e."debtPersonId" IS NOT NULL',
		[userId],
	);
	return rows.map(row => ({
		amount: Number(row.amount),
		createdAt: (row.createdAt as Date).toISOString(),
		date: row.date ? (row.date as Date).toISOString().slice(0, 10) : null,
		debtPersonId: String(row.debtPersonId),
		deletedAt: row.deletedAt ? (row.deletedAt as Date).toISOString() : null,
		description: row.description as string | null,
		dueDate: row.dueDate ? (row.dueDate as Date).toISOString().slice(0, 10) : null,
		effect: Number(row.effect),
		id: String(row.id),
		kind: row.kind as SyncDebtEvent["kind"],
		updatedAt: (row.updatedAt as Date).toISOString(),
		...(row.upgradeRecordId ? { upgradeRecordId: String(row.upgradeRecordId) } : {}),
	}));
}
