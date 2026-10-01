import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { resolveStore } from "~/modules/stores/application/resolve-store";
import { normalizeStoreName } from "~/modules/stores/domain/normalize-store-name";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { db, queryRows } from "~/shared/infra/sql";

export const StoresController = new Elysia({ prefix: "/stores" })
	.get(
		"/",
		async ({ request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(userId, "stores:list", {}, () =>
				queryRows(
					db.sql.public.Store.select("id", "name", "userId")
						.where((fields, functions) => functions.eq(fields.userId, userId))
						.orderBy("name", { direction: "asc" })
						.build(),
				),
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			return cached.value;
		},
		{ detail: { tags: ["Stores"] } },
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
