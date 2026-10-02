import { t } from "elysia";
import { executeRaw, queryRaw, withRawTransaction } from "~/shared/infra/sql";

const Id = t.String({ maxLength: 36, minLength: 1 });
export const UpgradeDebtBody = t.Object({
	records: t.Array(
		t.Object({
			debtPersonId: Id,
			original: t.Object({
				amount: t.Number({ exclusiveMinimum: 0 }),
				date: t.Optional(t.String()),
				description: t.Optional(t.String()),
				dueDate: t.Optional(t.String()),
				id: Id,
				isOwedToMe: t.Boolean(),
				isPaid: t.Boolean(),
				paidDate: t.Optional(t.String()),
				personId: t.Optional(Id),
				personName: t.String(),
				userId: Id,
			}),
			originId: Id,
			settlementId: t.Nullable(Id),
		}),
		{ maxItems: 1000 },
	),
});
export const UpgradeDebtResult = t.Array(
	t.Object({ debtPersonId: Id, deleted: t.Boolean(), originId: Id, settlementId: t.Nullable(Id) }),
);
export async function registerDebtUpgrade(userId: string, body: typeof UpgradeDebtBody.static) {
	return withRawTransaction(async () => {
		const result: (typeof UpgradeDebtResult.static)[number][] = [];
		for (const row of body.records) {
			if (row.original.id !== row.originId) throw new Error("Origem antiga inconsistente");
			const [person] = await queryRaw<{ userId: string }>('SELECT "userId" FROM "DebtPerson" WHERE "id"=$1', [
				row.debtPersonId,
			]);
			if (person && person.userId !== userId) throw new Error("Pessoa pertence a outro proprietário");
			const [origin] = await queryRaw<{
				createdByUserId: string;
				debtPersonId: string;
				deletedAt: string | null;
			}>('SELECT "createdByUserId","debtPersonId","deletedAt" FROM "DebtEvent" WHERE "id"=$1', [
				row.originId,
			]);
			if (origin && origin.createdByUserId !== userId) throw new Error("Colisão de origem exige revisão");
			const [archive] = await queryRaw<{ userId: string }>(
				'SELECT "userId" FROM "ApplicationUpgradeArchive" WHERE "source"=\'Debt\' AND "recordId"=$1',
				[row.originId],
			);
			if (archive && archive.userId !== userId) throw new Error("Origem pertence a outro proprietário");
			const debtPersonId = origin?.debtPersonId ?? row.debtPersonId;
			let id = row.settlementId;
			const deleted = Boolean(origin?.deletedAt || (archive && !origin));
			if (row.original.isPaid && id) {
				const date = row.original.paidDate ?? row.original.date ?? null;
				const effect = row.original.amount * (row.original.isOwedToMe ? -1 : 1);
				if (archive) {
					const matches = await queryRaw<{ id: string }>(
						'SELECT "id" FROM "DebtEvent" WHERE "createdByUserId"=$1 AND "debtPersonId"=$2 AND "kind"=\'MIGRATED_SETTLEMENT\' AND "amount"=$3 AND "effect"=$4 AND "date" IS NOT DISTINCT FROM $5::date',
						[userId, debtPersonId, row.original.amount, effect, date],
					);
					if (matches.length > 1) throw new Error("Compensação ambígua exige revisão");
					if (!matches.length) throw new Error("Compensação histórica indisponível; revisão necessária");
					id = matches[0]!.id;
				}
				const proof = {
					amount: row.original.amount,
					date,
					debtPersonId,
					effect,
					eventId: id,
					originId: row.originId,
				};
				const [existing] = await queryRaw<{ userId: string; original: Record<string, unknown> }>(
					'SELECT "userId","original" FROM "ApplicationUpgradeArchive" WHERE "source"=\'DebtSettlementProof\' AND "recordId"=$1',
					[id],
				);
				if (
					existing &&
					(existing.userId !== userId ||
						Number(existing.original.amount) !== proof.amount ||
						Number(existing.original.effect) !== proof.effect ||
						existing.original.debtPersonId !== proof.debtPersonId ||
						(existing.original.date ?? null) !== date)
				)
					throw new Error("Colisão de compensação exige revisão");
				await executeRaw(
					'INSERT INTO "ApplicationUpgradeArchive" ("source","recordId","userId","original") VALUES (\'DebtSettlementProof\',$1,$2,$3::json) ON CONFLICT DO NOTHING',
					[id, userId, JSON.stringify(proof)],
				);
			}
			result.push({ debtPersonId, deleted, originId: row.originId, settlementId: id });
		}
		return result;
	});
}
