import { toMinorUnits } from "@zaimu/finance/money";
import { assertSupportedCurrency } from "~/modules/currencies/application/currency-defaults";
import type { SyncDebtEvent } from "~/modules/sync/SyncDTO";
import { db, queryFirst, queryRows } from "~/shared/infra/sql";
import { resolveDebtPersonConnection } from "./debt-ledger";

export async function syncManualDebtEvent(userId: string, input: SyncDebtEvent) {
	const currency = await assertSupportedCurrency(input.currency ?? "BRL");
	toMinorUnits(input.amount, currency, 1);
	toMinorUnits(input.effect, currency, -Number.MAX_SAFE_INTEGER);
	const { connectionId } = await resolveDebtPersonConnection(input.debtPersonId, userId);
	if (Math.abs(input.effect) !== input.amount) throw new Error("Efeito inválido no lançamento manual");
	const existing = await queryFirst(
		db.sql.public.DebtEvent.select("createdByUserId", "kind", "currency", "updatedAt", "deletedAt")
			.where((fields, functions) => functions.eq(fields.id, input.id))
			.forUpdate()
			.build(),
	);
	if (existing && (existing.createdByUserId !== userId || existing.kind !== input.kind))
		throw new Error("Evento não pertence ao proprietário ou é derivado");
	if (existing?.deletedAt) return;
	if (existing && existing.currency !== currency)
		throw new Error("Moeda do lançamento existente não pode ser alterada");
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
		const proof = await queryFirst(
			db.sql.public.ApplicationUpgradeArchive.select("original")
				.where((fields, functions) =>
					functions.and(
						functions.eq(fields.source, "DebtSettlementProof"),
						functions.eq(fields.recordId, input.upgradeRecordId!),
						functions.eq(fields.userId, userId),
					),
				)
				.limit(1)
				.build(),
		);
		const original = proof?.original;
		if (
			!original ||
			typeof original !== "object" ||
			Array.isArray(original) ||
			currency !== String(original.currency ?? "BRL") ||
			original.eventId !== input.id ||
			original.debtPersonId !== input.debtPersonId ||
			Number(original.amount) !== input.amount ||
			Number(original.effect) !== input.effect ||
			(original.date ?? null) !== input.date ||
			input.deletedAt
		)
			throw new Error("Compensação histórica exige comprovação do upgrade");
	}
	const update = {
		amount: String(input.amount),
		connectionId: connectionId ?? null,
		currency,
		date: input.date,
		debtPersonId: input.debtPersonId,
		deletedAt: input.deletedAt ? new Date(input.deletedAt) : null,
		description: input.description ?? null,
		dueDate: input.dueDate ?? null,
		effect: String(input.effect),
		updatedAt: new Date(input.updatedAt),
	};
	await db.orm.public.DebtEvent.upsert({
		conflictOn: { id: input.id },
		create: {
			...update,
			createdAt: new Date(input.createdAt),
			createdByUserId: userId,
			id: input.id,
			kind: input.kind,
		},
		update,
	});
}
export async function listManualDebtEvents(userId: string): Promise<SyncDebtEvent[]> {
	const events = await queryRows(
		db.sql.public.DebtEvent.select(
			"id",
			"amount",
			"createdAt",
			"currency",
			"date",
			"debtPersonId",
			"deletedAt",
			"description",
			"dueDate",
			"effect",
			"kind",
			"updatedAt",
		)
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.createdByUserId, userId),
					functions.in(fields.kind, ["ORIGIN", "MIGRATED_SETTLEMENT"]),
					functions.ne(fields.debtPersonId, null),
				),
			)
			.build(),
	);
	const proofs = events.length
		? await queryRows(
				db.sql.public.ApplicationUpgradeArchive.select("recordId")
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.source, "DebtSettlementProof"),
							functions.eq(fields.userId, userId),
							functions.in(
								fields.recordId,
								events.map(event => event.id),
							),
						),
					)
					.build(),
			)
		: [];
	// source + recordId is the archive primary key, so this fixed-source map preserves join cardinality.
	const proofsByEvent = new Map(proofs.map(proof => [proof.recordId, proof.recordId]));
	const rows = events.map(event => ({ ...event, upgradeRecordId: proofsByEvent.get(event.id) }));
	return rows.map(row => ({
		amount: Number(row.amount),
		createdAt: row.createdAt.toISOString(),
		currency: String(row.currency ?? "BRL"),
		date: row.date,
		debtPersonId: String(row.debtPersonId),
		deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
		description: row.description,
		dueDate: row.dueDate,
		effect: Number(row.effect),
		id: String(row.id),
		kind: row.kind as SyncDebtEvent["kind"],
		updatedAt: row.updatedAt.toISOString(),
		...(row.upgradeRecordId ? { upgradeRecordId: String(row.upgradeRecordId) } : {}),
	}));
}
