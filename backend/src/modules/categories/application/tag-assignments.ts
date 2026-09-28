import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryRaw, queryRows } from "~/shared/infra/sql";

export const tagEntityType = {
	creditPurchase: "CREDIT_PURCHASE",
	recurringPayment: "RECURRING_PAYMENT",
	salary: "SALARY",
	subscription: "SUBSCRIPTION",
	transaction: "TRANSACTION",
} as const;

export interface TagSummary {
	color: null | string;
	icon: null | string;
	id: string;
	name: string;
}

export const normalizeTagIds = (tagIds: readonly string[] | undefined) => [
	...new Set((tagIds ?? []).filter(Boolean)),
];

export async function assertTagOwnership(tagIds: readonly string[], userId: string) {
	const normalizedTagIds = normalizeTagIds(tagIds);
	if (normalizedTagIds.length === 0) return normalizedTagIds;

	const ownedTags = await queryRows(
		db.sql.public.Category.select("id")
			.where((fields, functions) =>
				functions.and(functions.eq(fields.userId, userId), functions.in(fields.id, normalizedTagIds)),
			)
			.build(),
	);

	if (ownedTags.length !== normalizedTagIds.length) {
		throw new HttpException("Uma ou mais tags não estão disponíveis", 400);
	}

	return normalizedTagIds;
}

export async function replaceEntityTags({
	entityIds,
	entityType,
	tagIds,
}: {
	entityIds: readonly string[];
	entityType: string;
	tagIds: readonly string[];
}) {
	const normalizedEntityIds = [...new Set(entityIds.filter(Boolean))];
	const normalizedTagIds = normalizeTagIds(tagIds);
	if (normalizedEntityIds.length === 0) return;

	await executeStatement(
		db.sql.public.TagAssignment.delete()
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.entityType, entityType),
					functions.in(fields.entityId, normalizedEntityIds),
				),
			)
			.build(),
	);

	if (normalizedTagIds.length === 0) return;

	await executeStatement(
		db.sql.public.TagAssignment.insert(
			normalizedEntityIds.flatMap(entityId =>
				normalizedTagIds.map(categoryId => ({ categoryId, entityId, entityType })),
			),
		).build(),
	);
}

export async function getTagsByEntity(entityType: string, entityIds: readonly string[]) {
	const normalizedEntityIds = [...new Set(entityIds.filter(Boolean))];
	const tagsByEntity = new Map<string, TagSummary[]>();
	if (normalizedEntityIds.length === 0) return tagsByEntity;

	if (entityType === tagEntityType.creditPurchase) {
		const rows = await queryRaw<{
			color: null | string;
			icon: null | string;
			id: string;
			name: string;
			entityId: string;
		}>(
			`SELECT source.id AS "entityId",tag."id",tag."name",tag."color",tag."icon" FROM unnest($1::varchar[]) AS source(id) LEFT JOIN "CreditEntryReference" reference ON reference."id"=source.id JOIN "TagAssignment" assignment ON assignment."entityId"=COALESCE(reference."purchaseId",source.id) AND assignment."entityType"='CREDIT_PURCHASE' JOIN "Category" tag ON tag."id"=assignment."categoryId" ORDER BY tag."name"`,
			[normalizedEntityIds],
		);
		for (const row of rows)
			tagsByEntity.set(row.entityId, [
				...(tagsByEntity.get(row.entityId) ?? []),
				{ color: row.color, icon: row.icon, id: row.id, name: row.name },
			]);
		return tagsByEntity;
	}
	const assignments = await queryRows(
		db.sql.public.TagAssignment.innerJoin(db.sql.public.Category, (fields, functions) =>
			functions.eq(fields.TagAssignment.categoryId, fields.Category.id),
		)
			.select(fields => ({
				color: fields.Category.color,
				entityId: fields.TagAssignment.entityId,
				icon: fields.Category.icon,
				id: fields.Category.id,
				name: fields.Category.name,
			}))
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.TagAssignment.entityType, entityType),
					functions.in(fields.TagAssignment.entityId, normalizedEntityIds),
				),
			)
			.orderBy(fields => fields.Category.name, { direction: "asc" })
			.build(),
	);

	for (const assignment of assignments) {
		const tags = tagsByEntity.get(assignment.entityId) ?? [];
		tags.push({
			color: assignment.color,
			icon: assignment.icon,
			id: assignment.id,
			name: assignment.name,
		});
		tagsByEntity.set(assignment.entityId, tags);
	}

	return tagsByEntity;
}
