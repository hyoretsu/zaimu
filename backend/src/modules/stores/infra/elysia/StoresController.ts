import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { resolveStore } from "~/modules/stores/application/resolve-store";
import { normalizeStoreName } from "~/modules/stores/domain/normalize-store-name";
import { catalogFilterHash, catalogPage, decodeCatalogCursor } from "~/shared/application/catalog-pagination";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { queryRaw } from "~/shared/infra/sql";

export const StoresController = new Elysia({ prefix: "/stores" })
	.get(
		"/",
		async ({ request, query, set }) => {
			const userId = await requireUserId(request);
			const search = (query.search ?? "").trim();
			const limit = query.limit ?? 50;
			const hash = catalogFilterHash(userId, "stores", search);
			const cursor = decodeCatalogCursor(query.cursor, hash);
			const cached = await distributedCache.remember(
				userId,
				"stores:list",
				{ cursor: query.cursor, limit, search, version: 2 },
				async () => {
					const rows = await queryRaw<{ id: string; name: string; userId: string }>(
						`SELECT "id", "name", "userId" FROM "public"."Store"
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
			detail: { tags: ["Stores"] },
			query: t.Object({
				cursor: t.Optional(t.String()),
				limit: t.Optional(t.Integer({ maximum: 100, minimum: 1 })),
				search: t.Optional(t.String({ maxLength: 200 })),
			}),
			response: t.Object({
				hasMore: t.Boolean(),
				items: t.Array(t.Object({ id: t.String(), name: t.String(), userId: t.String() })),
				nextCursor: t.Union([t.String(), t.Null()]),
			}),
		},
	)
	.post(
		"/",
		async ({ body, request }) => {
			const userId = await requireUserId(request);
			if (!normalizeStoreName(body.name).name) throw new HttpException("Informe o nome da loja", 400);
			const store = await resolveStore(userId, body.name);
			if (!store) throw new HttpException("Loja não criada", 500);
			return store;
		},
		{
			body: t.Object({ name: t.String({ maxLength: 200 }) }),
			detail: { tags: ["Stores"] },
		},
	);
