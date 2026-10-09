import { executeRaw, queryRaw } from "~/shared/infra/sql";
import { externalReference, type NormalizedRecord } from "../domain/normalize";
import { type LocalKind, localSnapshot } from "./local-snapshot";
// Called inside the same financial transaction, before a reviewed item is removed.
export async function settleExternalReview(itemId: string, localKind?: LocalKind, localId?: string) {
	const records = await queryRaw<{
		id: string;
		userId: string;
		remoteAccountId: string;
		snapshot: NormalizedRecord;
	}>(
		'SELECT "id", "userId", "remoteAccountId", "snapshot" FROM "OpenFinanceRecord" WHERE "reviewItemId"=$1 FOR UPDATE',
		[itemId],
	);
	for (const record of records) {
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
	const records = await queryRaw<{ id: string; localKind: LocalKind }>(
		`SELECT "id", "localKind" FROM "OpenFinanceRecord" WHERE "userId"=$1 AND "localId"=$2 AND "state"='APPLIED' FOR UPDATE`,
		[userId, localId],
	);
	for (const record of records)
		await executeRaw(`UPDATE "OpenFinanceRecord" SET "appliedSnapshot"=$2::jsonb WHERE "id"=$1`, [
			record.id,
			JSON.stringify(await localSnapshot(record.localKind, localId, userId)),
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
