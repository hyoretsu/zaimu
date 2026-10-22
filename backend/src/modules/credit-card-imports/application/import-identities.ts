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
