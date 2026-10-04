export function referenceRateInsertSql(preserveExisting: boolean) {
	const conflict = preserveExisting
		? "DO NOTHING"
		: 'DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now() WHERE "ReferenceRate"."value" IS DISTINCT FROM EXCLUDED."value"';
	return `INSERT INTO "public"."ReferenceRate" ("type", "date", "value") VALUES ($1, $2::date, $3) ON CONFLICT ("type", "date") ${conflict} RETURNING "id"`;
}
