import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { Client } from "pg";
import { closeDatabase } from "sql";
import { GlobalPlugin } from "~/shared/infra/elysia/global";
import contract from "../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";

const url = requireFixtureUrl("DATABASE_TEST_URL");
requireFixtureUrl("CACHE_TEST_REDIS_URL");
mock.module("~/modules/auth", () => ({
	assertDirectOwnership: async () => undefined,
	requireUserId: async () => "a",
}));

const { CategoriesController, listCategoryRows } = await import("../infra/elysia/CategoriesController");
const app = new Elysia().use(GlobalPlugin).use(CategoriesController);

describe("category catalog list and lookup", () => {
	beforeAll(async () => {
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await installContractFixture(client, contract);
			await client.query("CREATE EXTENSION IF NOT EXISTS unaccent");
			await client.query(
				`CREATE OR REPLACE FUNCTION public.normalize_search(value TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE PARALLEL SAFE
				 RETURN lower(public.unaccent('public.unaccent', coalesce(value, '')))`,
			);
			await client.query("SET session_replication_role = replica");
			await client.query(
				`INSERT INTO "user" ("id","email","name","role") VALUES ('a','a@test.invalid','A','USER'),('b','b@test.invalid','B','USER')`,
			);
			await client.query(
				`INSERT INTO "Category" ("id","name","userId") VALUES
				 ('c1','Zebra','a'),('c2','apple','a'),('c3','Café Central','a'),
				 ('c4','Apple','a'),('c5','Banana','a'),('c6','Café Other','b')`,
			);
		} finally {
			await client.end();
		}
	});
	afterAll(() => closeDatabase());

	const ids = (rows: { id: string }[]) => rows.map(row => row.id);

	test("orders byte-wise (C collation) by name then id and isolates users", async () => {
		expect(ids(await listCategoryRows("a", "", undefined, 50))).toEqual(["c4", "c5", "c3", "c1", "c2"]);
	});

	test("search ignores case and accents", async () => {
		expect(ids(await listCategoryRows("a", "CAFE", undefined, 50))).toEqual(["c3"]);
		expect(ids(await listCategoryRows("b", "cafe", undefined, 50))).toEqual(["c6"]);
	});

	test("cursor continues after (name, id) in C order and respects the limit", async () => {
		expect(ids(await listCategoryRows("a", "", undefined, 2))).toEqual(["c4", "c5"]);
		expect(ids(await listCategoryRows("a", "", { id: "c4", name: "Apple" }, 2))).toEqual(["c5", "c3"]);
		expect(ids(await listCategoryRows("a", "", { id: "c2", name: "apple" }, 50))).toEqual([]);
	});

	test("lookup returns only the caller's requested categories in C order", async () => {
		const response = await app.handle(new Request("http://localhost/categories/lookup?ids=c1,c2,c6,c4"));
		expect(response.status).toBe(200);
		expect(((await response.json()) as { id: string }[]).map(row => row.id)).toEqual(["c4", "c1", "c2"]);
	});
});
