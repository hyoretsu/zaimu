import type { RawQuery } from "~/modules/creditCards/application/normalized-statement-replay";
import { HttpException } from "~/shared/errors";

/** Preserve every bank identity without replacing the purchase's original identity. */
export async function rememberImportIdentity(query: RawQuery, externalId: string, purchaseId: string) {
	const rows = await query<{ purchaseId: string }>(
		`INSERT INTO "CreditPurchaseImportIdentity" ("externalId", "purchaseId") VALUES ($1,$2)
		 ON CONFLICT ("externalId") DO UPDATE SET "updatedAt"=CURRENT_TIMESTAMP
		 WHERE "CreditPurchaseImportIdentity"."purchaseId"=EXCLUDED."purchaseId"
		 RETURNING "purchaseId"`,
		[externalId, purchaseId],
	);
	if (!rows.length) throw new HttpException("Identificador importado já vinculado a outra compra", 409);
}

/** Keep conflict detection atomic while writing every bank identity in one statement. */
export async function rememberImportIdentities(
	query: RawQuery,
	values: { externalId: string; purchaseId: string }[],
) {
	const unique = new Map<string, string>();
	for (const { externalId, purchaseId } of values) {
		if (unique.has(externalId) && unique.get(externalId) !== purchaseId)
			throw new HttpException("Identificador importado já vinculado a outra compra", 409);
		unique.set(externalId, purchaseId);
	}
	if (!unique.size) return;
	const rows = await query<{ purchaseId: string }>(
		`INSERT INTO "CreditPurchaseImportIdentity" ("externalId", "purchaseId") SELECT * FROM unnest($1::text[],$2::text[])
		 ON CONFLICT ("externalId") DO UPDATE SET "updatedAt"=CURRENT_TIMESTAMP
		 WHERE "CreditPurchaseImportIdentity"."purchaseId"=EXCLUDED."purchaseId" RETURNING "purchaseId"`,
		[[...unique.keys()], [...unique.values()]],
	);
	if (rows.length !== unique.size)
		throw new HttpException("Identificador importado já vinculado a outra compra", 409);
}
