import { afterAll, expect, test } from "bun:test";
import { requireFixtureUrl } from "../../../scripts/testing/fixture";
import { closeDatabase, db, queryFirst, queryRaw, withRawTransaction, withTransaction } from "../src";

requireFixtureUrl("DATABASE_TEST_URL");
afterAll(closeDatabase);

test("ORM builder and nested raw work share one rollback connection", async () => {
	const id = crypto.randomUUID();
	await expect(
		withRawTransaction(async raw => {
			await raw('INSERT INTO "user" ("id","name","email") VALUES ($1,$2,$3)', [
				id,
				"RC affinity",
				`${id}@example.test`,
			]);
			const backend = await raw<{ pid: number }>("SELECT pg_backend_pid() AS pid");
			const user = await db.orm.public.User.where({ id }).first();
			expect(user).toMatchObject({ id });
			expect(user?.createdAt).toBeInstanceOf(Date);
			expect(user?.image).toBeNull();
			expect(
				await queryFirst(
					db.sql.public.user
						.select("id")
						.where((user, ops) => ops.eq(user.id, id))
						.build(),
				),
			).toEqual({ id });
			expect(
				await queryFirst(
					db.sql.public.user
						.update({ name: "builder update" })
						.where((user, ops) => ops.eq(user.id, id))
						.returning("id", "name")
						.build(),
				),
			).toEqual({ id, name: "builder update" });
			await withTransaction(async () => {
				expect((await queryRaw<{ pid: number }>("SELECT pg_backend_pid() AS pid"))[0].pid).toBe(
					backend[0].pid,
				);
			});
			throw new Error("intentional affinity rollback");
		}),
	).rejects.toThrow("intentional affinity rollback");
	expect(await db.orm.public.User.where({ id }).first()).toBeNull();
});
