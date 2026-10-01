import Elysia, { t } from "elysia";
import { assertDirectOwnership, requireUserId } from "~/modules/auth";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { db, executeStatement, queryFirst, queryRows } from "~/shared/infra/sql";

export const CategoriesController = new Elysia({ prefix: "/categories" })
	.get(
		"/",
		async ({ request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(userId, "categories:list", {}, () =>
				queryRows(
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
						.where((fields, functions) => functions.eq(fields.userId, userId))
						.orderBy("name", { direction: "asc" })
						.build(),
				),
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			return cached.value;
		},
		{
			detail: { tags: ["Categories"] },
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
