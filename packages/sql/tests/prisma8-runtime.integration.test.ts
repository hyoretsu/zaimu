import { afterAll, expect, test } from "bun:test";
import { requireFixtureUrl } from "../../../scripts/testing/fixture";
import {
	closeDatabase,
	db,
	executeStatement,
	queryFirst,
	queryRaw,
	withRawTransaction,
	withTransaction,
} from "../src";

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

test("legacy double-encoded json defaults are decoded only for known columns", async () => {
	const eventId = crypto.randomUUID();
	const institutionId = crypto.randomUUID();
	await expect(
		withRawTransaction(async raw => {
			await raw('INSERT INTO "user" ("id","name","email") VALUES ($1,$2,$3)', [
				eventId,
				"Legacy json",
				`${eventId}@example.test`,
			]);
			await raw(
				`INSERT INTO "OutboxEvent" ("id","aggregateId","aggregateType","correlationId","eventType","occurredAt","userIds")
				 VALUES ($1,$1,'t','c','e',now(),'{}')`,
				[eventId],
			);
			await raw(
				`INSERT INTO "FinancialInstitution" ("id","name","normalizedName","creditCardRules")
				 VALUES ($1::text,'Legacy json','legacy json ' || $1::text,$2::json)`,
				[institutionId, JSON.stringify("[1]")],
			);
			const stored = await raw<{ payload: unknown }>(`SELECT payload FROM "OutboxEvent" WHERE id=$1`, [
				eventId,
			]);
			expect(stored[0].payload).toBe("{}");
			const built = await queryFirst(
				db.sql.public.OutboxEvent.select("payload")
					.where((event, ops) => ops.eq(event.id, eventId))
					.build(),
			);
			expect(built).toEqual({ payload: {} });
			const orm = await db.orm.public.OutboxEvent.where({ id: eventId }).first();
			// db.orm is not normalized: the stored double-encoded sentinel is returned as is.
			expect(orm?.payload).toBe("{}");
			const genuine = await queryFirst(
				db.sql.public.FinancialInstitution.select("creditCardRules")
					.where((institution, ops) => ops.eq(institution.id, institutionId))
					.build(),
			);
			expect(genuine).toEqual({ creditCardRules: "[1]" });
			const aliased = await queryFirst(
				db.sql.public.user
					.innerJoin(db.sql.public.OutboxEvent.as("renamed"), (f, fn) =>
						fn.eq(f.user.id, f.renamed.aggregateId),
					)
					.select(f => ({ payload: f.renamed.payload }))
					.where((f, fn) => fn.eq(f.user.id, eventId))
					.build(),
			);
			expect(aliased).toEqual({ payload: {} });
			await raw(`UPDATE "FinancialInstitution" SET "creditCardRules"=$2::json WHERE id=$1`, [
				institutionId,
				JSON.stringify("[]"),
			]);
			const impostor = await queryFirst(
				db.sql.public.FinancialInstitution.as("OutboxEvent")
					.select("creditCardRules")
					.where((institution, ops) => ops.eq(institution.id, institutionId))
					.build(),
			);
			expect(impostor).toEqual({ creditCardRules: "[]" });
			throw new Error("rollback legacy json");
		}),
	).rejects.toThrow("rollback legacy json");
});

test("builder sends explicit undefined as NULL while omitted insert keys use column defaults", async () => {
	const id = crypto.randomUUID();
	const email = `${id}@example.test`;
	// An omitted key falls back to the column default; an explicit undefined must be coalesced by the caller.
	await executeStatement(db.sql.public.user.insert([{ email, id, name: "omitted default" }]).build());
	expect((await queryRaw<{ role: string }>('SELECT "role" FROM "user" WHERE "id"=$1', [id]))[0]?.role).toBe(
		"USER",
	);
	await queryRaw('INSERT INTO "user" ("id","name","email") VALUES ($1,$2,$3)', [
		crypto.randomUUID(),
		"raw default",
		`${crypto.randomUUID()}@example.test`,
	]);
	await expect(
		executeStatement(
			db.sql.public.user
				.insert([
					{
						email: `${crypto.randomUUID()}@example.test`,
						id: crypto.randomUUID(),
						name: "n",
						role: undefined,
					},
				])
				.build(),
		),
	).rejects.toThrow(/role|not-null/i);
	await queryRaw('UPDATE "user" SET "image"=$2 WHERE "id"=$1', [id, "https://example.test/a.png"]);
	await executeStatement(
		db.sql.public.user
			.update({ image: undefined, name: "undefined image" })
			.where((user, ops) => ops.eq(user.id, id))
			.build(),
	);
	const [row] = await queryRaw<{ image: null | string; name: string }>(
		'SELECT "image","name" FROM "user" WHERE "id"=$1',
		[id],
	);
	// Unchanged from the early RC runtime: an undefined update field clears the column; omit the key to preserve it.
	expect(row).toEqual({ image: null, name: "undefined image" });
});
