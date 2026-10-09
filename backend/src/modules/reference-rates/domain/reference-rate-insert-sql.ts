export function referenceRateInsertSql(preserveExisting: boolean) {
	const conflict = preserveExisting
		? "DO NOTHING"
		: 'DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now() WHERE "ReferenceRate"."value" IS DISTINCT FROM EXCLUDED."value"';
	return `INSERT INTO "public"."ReferenceRate" ("type", "date", "value") VALUES ($1, $2::date, $3) ON CONFLICT ("type", "date") ${conflict} RETURNING "id"`;
}
export function referenceRateBatchInsertSql(preserveExisting: boolean) {
	const conflict = preserveExisting
		? "DO NOTHING"
		: 'DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now() WHERE "ReferenceRate"."value" IS DISTINCT FROM EXCLUDED."value"';
	// Duplicate dates retain the same first/last value as sequential inserts.
	const order = preserveExisting ? "ASC" : "DESC";
	return `INSERT INTO "public"."ReferenceRate" ("type","date","value")
 SELECT $1::"ReferenceRateType", entry.date, entry.value FROM (
 SELECT DISTINCT ON ((item->>'date')::date) (item->>'date')::date AS date,(item->>'value')::numeric AS value
 FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS input(item,position)
 ORDER BY (item->>'date')::date,position ${order}
 ) entry
 ON CONFLICT ("type","date") ${conflict} RETURNING "date"::text`;
}
