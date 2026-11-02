import Elysia, { t } from "elysia";
import { assertDirectOwnership, requireUserId } from "~/modules/auth";
import { catalogFilterHash, catalogPage, decodeCatalogCursor } from "~/shared/application/catalog-pagination";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { db, executeStatement, queryFirst, queryRows } from "~/shared/infra/sql";
import { categoryLookupIds } from "../../application/category-lookup";
import { CategoryPageReturn, CategorySummaryReturn } from "./CategoriesDTO";

const textCodec = "pg/text@1";
const boolCodec = "pg/bool@1";
const categoryColumns = ["id", "name", "userId", "color", "icon", "parentId"] as const;

/**
 * Category catalog page rows for one user. Ownership, projection and limit use the typed builder; only the
 * PostgreSQL-specific capabilities the builder lacks (public.normalize_search, strpos, COLLATE "C") are
 * expressed as typed, fully parameterized raw expressions. Order and cursor are byte-wise ("C") on (name, id).
 */
export const listCategoryRows = (
	userId: string,
	search: string,
	cursor: { id: string; name: string } | undefined,
	rowLimit: number,
) =>
	queryRows(
		db.sql.public.Category.select(...categoryColumns)
			.where((fields, functions) => {
				const cName = functions.raw`${fields.name} COLLATE "C"`.returns(textCodec);
				const cId = functions.raw`${fields.id} COLLATE "C"`.returns(textCodec);
				return functions.and(
					functions.eq(fields.userId, userId),
					functions.raw`strpos(public.normalize_search(${fields.name}), public.normalize_search(${search})) > 0`.returns(
						boolCodec,
					),
					...(cursor
						? [
								functions.or(
									functions.gt(
										cName,
										functions.raw`${cursor.name}::text COLLATE "C"`.returns(textCodec),
									),
									functions.and(
										functions.eq(
											cName,
											functions.raw`${cursor.name}::text COLLATE "C"`.returns(
												textCodec,
											),
										),
										functions.gt(
											cId,
											functions.raw`${cursor.id}::text COLLATE "C"`.returns(textCodec),
										),
									),
								),
							]
						: []),
				);
			})
			.orderBy((fields, functions) => functions.raw`${fields.name} COLLATE "C"`.returns(textCodec), {
				direction: "asc",
			})
			.orderBy((fields, functions) => functions.raw`${fields.id} COLLATE "C"`.returns(textCodec), {
				direction: "asc",
			})
			.limit(rowLimit)
			.build(),
	);

export const CategoriesController = new Elysia({ prefix: "/categories" })
	.get(
		"/",
		async ({ request, query, set }) => {
			const userId = await requireUserId(request);
			const search = (query.search ?? "").trim();
			const limit = query.limit ?? 50;
			const hash = catalogFilterHash(userId, "categories", search);
			const cursor = decodeCatalogCursor(query.cursor, hash);
			const cached = await distributedCache.remember(
				userId,
				"categories:list",
				{ cursor: query.cursor, limit, search, version: 2 },
				async () => {
					const rows = await listCategoryRows(userId, search, cursor ?? undefined, limit + 1);
					return catalogPage(rows, limit, hash);
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return undefined as never;
			}
			return cached.value;
		},
		{
			detail: { operationId: "getCategories", tags: ["Categories"] },
			query: t.Object({
				cursor: t.Optional(t.String()),
				limit: t.Optional(t.Integer({ maximum: 100, minimum: 1 })),
				search: t.Optional(t.String({ maxLength: 200 })),
			}),
			response: CategoryPageReturn,
		},
	)
	.get(
		"/lookup",
		async ({ request, query, set }) => {
			const userId = await requireUserId(request);
			const ids = categoryLookupIds(query.ids);
			const cached = await distributedCache.remember(
				userId,
				"categories:detail",
				{ ids, version: 1 },
				async () => {
					if (!ids.length) return [];
					return queryRows(
						db.sql.public.Category.select(...categoryColumns)
							.where((fields, functions) =>
								functions.and(
									functions.eq(fields.userId, userId),
									functions.in(fields.id, ids),
								),
							)
							.orderBy(
								(fields, functions) =>
									functions.raw`${fields.name} COLLATE "C"`.returns(textCodec),
								{
									direction: "asc",
								},
							)
							.orderBy(
								(fields, functions) =>
									functions.raw`${fields.id} COLLATE "C"`.returns(textCodec),
								{
									direction: "asc",
								},
							)
							.build(),
					);
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return undefined as never;
			}
			return cached.value;
		},
		{
			detail: { operationId: "getCategoriesLookup", tags: ["Categories"] },
			query: t.Object({ ids: t.String({ maxLength: 40000 }) }),
			response: t.Array(CategorySummaryReturn),
		},
	)
	.get(
		"/:id",
		async ({ params, request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				"categories:detail",
				{ id: params.id },
				async () => {
					const category = await queryFirst(
						db.sql.public.Category.select(
							"id",
							"userId",
							"name",
							"color",
							"icon",
							"parentId",
							"createdAt",
							"updatedAt",
						)
							.where((fields, functions) =>
								functions.and(
									functions.eq(fields.id, params.id),
									functions.eq(fields.userId, userId),
								),
							)
							.limit(1)
							.build(),
					);

					if (!category) {
						throw new HttpException("Category not found", 404);
					}

					return category;
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return undefined as never;
			}
			return cached.value;
		},
		{
			detail: { operationId: "getCategoriesById", tags: ["Categories"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.post(
		"/",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			const existing = await queryFirst(
				db.sql.public.Category.select("id")
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.userId, userId),
							functions.eq(fields.name, body.name),
						),
					)
					.limit(1)
					.build(),
			);

			if (existing) {
				throw new HttpException("Category with this name already exists", 409);
			}

			const category = await queryFirst(
				db.sql.public.Category.insert([
					{
						color: body.color,
						icon: body.icon,
						name: body.name,
						parentId: body.parentId,
						userId,
					},
				])
					.returning("id", "userId", "name", "color", "icon", "parentId", "createdAt", "updatedAt")
					.build(),
			);
			if (!category) throw new HttpException("Category not created", 500);

			return category;
		},
		{
			body: t.Object({
				color: t.Optional(t.String({ maxLength: 7 })),
				icon: t.Optional(t.String({ maxLength: 50 })),
				name: t.String({ maxLength: 50 }),
				parentId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
			}),
			detail: { operationId: "postCategories", tags: ["Categories"] },
		},
	)
	.patch(
		"/:id",
		async ({ params, body, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("Category", params.id, userId);
			const existing = await queryFirst(
				db.sql.public.Category.select("id")
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);

			if (!existing) {
				throw new HttpException("Category not found", 404);
			}

			const category = await queryFirst(
				db.sql.public.Category.update({
					...(body.name && { name: body.name }),
					...(body.color !== undefined && { color: body.color }),
					...(body.icon !== undefined && { icon: body.icon }),
					...(body.parentId !== undefined && { parentId: body.parentId }),
					updatedAt: new Date(),
				} as never)
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.returning("id", "userId", "name", "color", "icon", "parentId", "createdAt", "updatedAt")
					.build(),
			);
			if (!category) throw new HttpException("Category not found", 404);

			return category;
		},
		{
			body: t.Object({
				color: t.Optional(t.Nullable(t.String({ maxLength: 7 }))),
				icon: t.Optional(t.Nullable(t.String({ maxLength: 50 }))),
				name: t.Optional(t.String({ maxLength: 50 })),
				parentId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
			}),
			detail: { operationId: "patchCategoriesById", tags: ["Categories"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	)
	.delete(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("Category", params.id, userId);
			const existing = await queryFirst(
				db.sql.public.Category.select("id")
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);

			if (!existing) {
				throw new HttpException("Category not found", 404);
			}

			await executeStatement(
				db.sql.public.Category.delete()
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.build(),
			);
			return { success: true };
		},
		{
			detail: { operationId: "deleteCategoriesById", tags: ["Categories"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	);
