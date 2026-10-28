import { executeRaw, queryRaw } from "~/shared/infra/sql";
import { externalReference, type NormalizedRecord } from "../domain/normalize";
import { type LocalKind, localSnapshot } from "./local-snapshot";
// Called inside the same financial transaction, before a reviewed item is removed.
export async function settleExternalReview(itemId: string, localKind?: LocalKind, localId?: string) {
	return settleExternalReviews([{ itemId, localId, localKind }]);
}

export async function settleExternalReviews(
	items: readonly { itemId: string; localKind?: LocalKind; localId?: string }[],
) {
	if (!items.length) return;
	const targets = new Map(items.map(item => [item.itemId, item]));
	const records = await queryRaw<{
		id: string;
		reviewItemId: string;
		userId: string;
		remoteAccountId: string;
		snapshot: NormalizedRecord;
	}>(
		'SELECT "id", "reviewItemId", "userId", "remoteAccountId", "snapshot" FROM "OpenFinanceRecord" WHERE "reviewItemId"=ANY($1::text[]) ORDER BY "id" FOR UPDATE',
		[[...targets.keys()]],
	);
	for (const record of records) {
		const { itemId, localKind, localId } = targets.get(record.reviewItemId)!;
		if (localKind === "TRANSACTION" && localId) {
			const [source] = await queryRaw<{ financialAccountId: string }>(
				`SELECT b."financialAccountId" FROM "TransactionImport" b JOIN "TransactionImportItem" i ON i."transactionImportId"=b."id" WHERE i."id"=$1`,
				[itemId],
			);
			if (source)
				for (const alias of record.snapshot.aliases)
					await executeRaw(
						`INSERT INTO "TransactionExternalReference" ("id","transactionId","financialAccountId","externalId") VALUES ($1,$2,$3,$4) ON CONFLICT ("financialAccountId","externalId") DO NOTHING`,
						[
							crypto.randomUUID(),
							localId,
							source.financialAccountId,
							externalReference(record.userId, record.remoteAccountId, alias),
						],
					);
		}
		const snapshot = localKind && localId ? await localSnapshot(localKind, localId, record.userId) : null;
		await executeRaw(
			`UPDATE "OpenFinanceRecord" SET "state"=$2, "localKind"=$3, "localId"=$4, "appliedSnapshot"=$5::jsonb, "reviewItemId"=NULL, "importId"=NULL, "updatedAt"=now() WHERE "id"=$1`,
			[
				record.id,
				snapshot ? "APPLIED" : "DISCARDED",
				localKind ?? null,
				localId ?? null,
				snapshot ? JSON.stringify(snapshot) : null,
			],
		);
	}
}

export async function refreshAppliedSnapshots(userId: string, localId: string) {
	return refreshAppliedSnapshotsForIds(userId, [localId]);
}

export async function refreshAppliedSnapshotsForIds(userId: string, localIds: readonly string[]) {
	if (!localIds.length) return;
	const records = await queryRaw<{ id: string; localKind: LocalKind; localId: string }>(
		`SELECT "id", "localKind", "localId" FROM "OpenFinanceRecord" WHERE "userId"=$1 AND "localId"=ANY($2::text[]) AND "state"='APPLIED' ORDER BY "id" FOR UPDATE`,
		[userId, [...new Set(localIds)]],
	);
	for (const record of records)
		await executeRaw(`UPDATE "OpenFinanceRecord" SET "appliedSnapshot"=$2::jsonb WHERE "id"=$1`, [
			record.id,
			JSON.stringify(await localSnapshot(record.localKind, record.localId, userId)),
		]);
}

/** Discarding a batch requires no per-record local snapshot or alias writes. */
export async function discardExternalReviews(itemIds: readonly string[]) {
	if (!itemIds.length) return;
	await executeRaw(
		`UPDATE "OpenFinanceRecord" SET "state"='DISCARDED', "localKind"=NULL, "localId"=NULL, "appliedSnapshot"=NULL, "reviewItemId"=NULL, "importId"=NULL, "updatedAt"=now() WHERE "reviewItemId"=ANY($1::text[])`,
		[[...new Set(itemIds)]],
	);
}
