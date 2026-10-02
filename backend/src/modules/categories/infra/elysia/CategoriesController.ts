import Elysia, { t } from "elysia";
import { assertDirectOwnership, requireUserId } from "~/modules/auth";
import { catalogFilterHash, catalogPage, decodeCatalogCursor } from "~/shared/application/catalog-pagination";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { db, executeStatement, queryFirst, queryRaw } from "~/shared/infra/sql";
import { categoryLookupIds } from "../../application/category-lookup";
import { CategoryPageReturn, CategorySummaryReturn } from "./CategoriesDTO";

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
					const rows = await queryRaw<typeof CategorySummaryReturn.static>(
						`SELECT "id", "name", "userId", "color", "icon", "parentId" FROM "public"."Category"
					 WHERE "userId" = $1
					 AND strpos(public.normalize_search("name"), public.normalize_search($2)) > 0
					 AND ($3::text IS NULL OR ("name" COLLATE "C", "id" COLLATE "C") > ($3::text COLLATE "C", $4::text COLLATE "C"))
					 ORDER BY "name" COLLATE "C", "id" COLLATE "C" LIMIT $5`,
						[userId, search, cursor?.name ?? null, cursor?.id ?? null, limit + 1],
					);
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
			detail: { tags: ["Categories"] },
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
					return queryRaw<typeof CategorySummaryReturn.static>(
						`SELECT "id", "name", "userId", "color", "icon", "parentId" FROM "public"."Category"
					 WHERE "userId" = $1 AND "id" = ANY($2::text[])
					 ORDER BY "name" COLLATE "C", "id" COLLATE "C"`,
						[userId, ids],
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
			detail: { tags: ["Categories"] },
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
								functions.and(functions.eq(fields.id, params.id), functions.eq(fields.userId, userId)),
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
			detail: { tags: ["Categories"] },
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
						functions.and(functions.eq(fields.userId, userId), functions.eq(fields.name, body.name)),
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
			detail: { tags: ["Categories"] },
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
			detail: { tags: ["Categories"] },
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
			detail: { tags: ["Categories"] },
			params: t.Object({
				id: t.String({ maxLength: 36, minLength: 1 }),
			}),
		},
	);
