import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { resolveStore } from "~/modules/stores/application/resolve-store";
import { normalizeStoreName } from "~/modules/stores/domain/normalize-store-name";
import { catalogFilterHash, catalogPage, decodeCatalogCursor } from "~/shared/application/catalog-pagination";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { db, queryRows } from "~/shared/infra/sql";

const textCodec = "pg/text@1";
const boolCodec = "pg/bool@1";

/**
 * Store catalog page rows for one user. Ownership, projection and limit use the typed builder; only the
 * PostgreSQL-specific capabilities the builder lacks (public.normalize_search, strpos, COLLATE "C") are
 * expressed as typed, fully parameterized raw expressions. Order and cursor are byte-wise ("C") on (name, id).
 */
export const listStoreRows = (
	userId: string,
	search: string,
	cursor: { id: string; name: string } | undefined,
	rowLimit: number,
) =>
	queryRows(
		db.sql.public.Store.select("id", "name", "userId")
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
					const rows = await listStoreRows(userId, search, cursor ?? undefined, limit + 1);
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
			detail: { operationId: "getStores", tags: ["Stores"] },
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
			detail: { operationId: "postStores", tags: ["Stores"] },
		},
	);
